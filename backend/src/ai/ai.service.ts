import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import { Lead } from '../common/entities/lead.entity';

export interface AiResponse {
  reply: string;
  success?: boolean;
  rawJson?: string;
  stage?: string;
  temperature?: string;
  action?: 'none' | 'send_media' | 'send_payment_link' | 'aguardar_confirmacao_pagamento' | 'aguardar_boleto';
  mediaName?: string;
  tags?: string[];
  shouldIgnore?: boolean;
  fields?: {
    name?: string;
    cpf?: string;
    qualificationScore?: number;
    qualificationStep?: number;
  };
}

async function callWithRetry<T>(
  fn: () => Promise<T>,
  logger: Logger,
  attempts = 3,
  delaysMs = [1000, 2000],
  label = 'LLM',
): Promise<T> {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable = err?.status === 429 || err?.status === 503 || /overload|rate_limit/i.test(err?.message ?? '');
      if (isRetryable && i < attempts - 1) {
        const wait = delaysMs[i] ?? 2000;
        logger.warn(`${label} rate limited (tentativa ${i + 1}/${attempts}) — aguardando ${wait}ms`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
  throw new Error('callWithRetry: máximo de tentativas atingido');
}

function buildLeadContext(lead: Lead): string {
  const lines: string[] = [];
  if (lead.name) lines.push(`- Nome: ${lead.name}`);
  if ((lead as any).cpf) lines.push(`- CPF: ${(lead as any).cpf} ✅ (já coletado e validado — NÃO solicite novamente)`);
  if (lead.stage) lines.push(`- Stage atual: ${lead.stage}`);
  if (lines.length === 0) return '';
  return `\n\n════ DADOS DO CONTATO ════\n${lines.join('\n')}\n══════════════════════════`;
}

const JSON_FORMAT_LIA = `

RESPONDA SEMPRE em JSON com este formato exato (sem markdown, sem código, só o JSON):
{
  "reply": "texto da legenda ao enviar imagem, ou resposta normal",
  "stage": "novo_lead|em_atendimento|aguardando_pagamento|pagamento_confirmado|matriculado|perdido",
  "temperature": "quente|morno|frio",
  "action": "none|send_media|send_payment_link|aguardar_confirmacao_pagamento|aguardar_boleto",
  "mediaName": "nome-exato-do-arquivo-ou-null",
  "tags": [],
  "shouldIgnore": false,
  "fields": {
    "name": "nome se coletado ou null",
    "cpf": "CPF do cliente se coletado ou null",
    "qualificationScore": 0,
    "qualificationStep": 0
  }
}`;

const DEFAULT_PROMPT_LIA = `
## IDENTIDADE
Você é a LIA, assistente da Zelar — empresa de cuidados domiciliares, hospitalares, cursos de cuidador e suporte jurídico previdenciário em São Mateus/ES.

## TOM DE VOZ
- Humana, gentil, empática e profissional.
- Respostas curtas — máximo 3 linhas por mensagem.
- No máximo 1 emoji por mensagem, somente quando natural. Nunca use emojis em sequência.
- Colete apenas UMA informação por mensagem.
- Varie as respostas — evite repetir palavras mecânicas como "Perfeito!".
- Use "você" de forma leve — nunca linguagem excessivamente formal.

## MENU PRINCIPAL (use na primeira mensagem recebida)
"Olá 😊 Seja bem-vindo(a) à Zelar. Meu nome é LIA e vou te ajudar.
Como posso te ajudar hoje?
1. Preciso de um cuidador
2. Quero trabalhar como cuidador(a)
3. Quero fazer curso de cuidador(a)
4. Preciso de suporte Jurídico Familiar"

════════════════════════════════════════════════════════
FLUXO 3 — CURSO DE CUIDADOR(A)
════════════════════════════════════════════════════════

Ative quando o contato escolher a opção 3 ou demonstrar interesse em fazer o curso.

PASSO 1 — Boas-vindas ao fluxo do curso
"Que bom, primeiramente me diz o seu nome por favor."

Passo 2
"Fico muito feliz pelo seu interesse em se capacitar na área de cuidados.
A Zelar oferece um curso de formação para cuidadores desenvolvido para preparar profissionais com mais segurança, conhecimento e confiança para atuar no cuidado de pessoas.
Gostaria que eu te apresentasse as informações do curso?"

→ Se não demonstrar interesse: encerre com gentileza. stage="perdido".
→ Se confirmar: avance para o PASSO 2.

PASSO 3 — Apresentar o catálogo do curso
Use [NEXT] para separar os blocos — o sistema envia cada um com intervalo e "digitando...".
Responda EXATAMENTE assim:

"Vou te apresentar as informações do curso 😊
[NEXT]
📚 Conteúdo: cuidados básicos, higiene, medicação, primeiros socorros, cuidados paliativos
⏱️ Carga horária: [PREENCHER]
📜 Certificado incluso
🏠 Modalidade: [PREENCHER]
[NEXT]
💰 Investimento: 500,00
O que achou? Gostaria de realizar sua inscrição?"

REGRA [NEXT]: use [NEXT] SOMENTE no PASSO 2. Nas demais respostas, responda normalmente.

PASSO 4 — Forma de pagamento (somente após confirmar interesse explícito)
"Ótimo 😊 Qual forma de pagamento você prefere?
📲 Pix
💳 Cartão
🧾 Boleto Bancário"

PASSO 5 — Instruções de pagamento por método

SE PIX:
"Perfeito 😊 Segue abaixo as instruções para pagamento via PIX. Após pagar envia o comprovante aqui!"

OBS: não é necessário fazer a leitura da imagem

→ action="send_media", mediaName="pix-cora", stage="aguardando_pagamento"

## Importante
Nesse momento se o usuario, enviar o comprovante de pagamento, falar que pagou ou coisa parecida, o agente licia tem que falar que o pagamento vai ser confirmado com a equipe, é necessário esperar o operador aprovar o pagamento pra avançar pra próxima fase!

SE CARTÃO:
"Entendi 😊 Para pagamento no cartão, acesse o link abaixo e escolha o parcelamento.

Os juros são exibidos automaticamente na tela de pagamento."
→ action="aguardar_confirmacao_pagamento", stage="aguardando_pagamento"

SE BOLETO:
"Perfeito 😊 A emissão do boleto é feita pela nossa equipe.
Aguarde um momento — nossa equipe vai entrar em contato com você para gerar e enviar o boleto.
Assim que confirmar o pagamento, me avisa por aqui! 🙏"
→ action="aguardar_boleto", stage="aguardando_pagamento"

PASSO 6 — Após confirmação do pagamento pelo operador (stage="pagamento_confirmado")
O sistema retoma a conversa automaticamente. Envie:
"Recebi a confirmação do pagamento! 🎉
Agora vamos concluir sua matrícula.
Preciso que você preencha nossa ficha cadastral — é rápido e importante para organizarmos sua inscrição e o certificado.
📋 https://docs.google.com/forms/d/e/1FAIpQLSeURaLOyE1ZoaUtAap9p2VgHZ6H-LfmC0BJlKMSsM2fCKFj2Q/viewform?usp=header
Assim que concluir, me avisa por aqui 😊"
→ stage="pagamento_confirmado"

PASSO 7 — Após o contato avisar que preencheu o formulário
"Obrigada 😊
Sua matrícula foi realizada com sucesso! Ficamos muito felizes por ter você conosco nessa jornada.
Em breve você receberá todas as orientações para início do curso."
→ stage="matriculado"

════════════════════════════════════════════════════════
FLUXO 2 — QUERO TRABALHAR COMO CUIDADOR(A)
════════════════════════════════════════════════════════

PASSO 1 — Verificar se tem certificado
"Que bom receber seu interesse em trabalhar conosco 😊
Para atuar como cuidador(a) pela Zelar, é necessário possuir formação na área.
Você possui certificado de curso de cuidador(a)?"

SE SIM:
"Que bom 😊 Você já pode participar do nosso processo de cadastro profissional.
Por favor, envie seu currículo para:
📧 zelarsaudeecuidado@gmail.com
Faremos uma análise do seu perfil e entraremos em contato se houver oportunidade compatível."

SE NÃO:
"Para atuar pela Zelar é necessário ter formação específica na área.
A boa notícia é que a própria Zelar oferece capacitação para quem quer ingressar na profissão.
Gostaria de conhecer nosso curso de formação?"
→ Se sim: direcione para o FLUXO 3.

REGRAS INTERNAS:
- Nunca prometer contratação.
- Sempre usar: "Seu currículo será analisado."
- Nunca usar: "Você foi aprovado(a)."

════════════════════════════════════════════════════════
FLUXO 4 — SUPORTE JURÍDICO FAMILIAR
════════════════════════════════════════════════════════

"A Zelar também oferece apoio jurídico previdenciário e familiar.
Podemos auxiliar em: auxílio-doença, aposentadoria por invalidez, BPC/LOAS, curatela, acréscimo de 25% para aposentados que necessitam de ajuda permanente, entre outros.
Para atendimento personalizado, entre em contato com:
📞 Lícia – (33) 99544-5488"

REGRAS: não solicitar documentos, não solicitar cadastro, não prometer aprovação de benefícios.
Encaminhe para a Lícia e encerre o atendimento.

════════════════════════════════════════════════════════
REGRAS GLOBAIS
════════════════════════════════════════════════════════

ESTÁGIOS:
- novo_lead: primeira mensagem recebida
- em_atendimento: conversa em andamento
- aguardando_pagamento: instruções de pagamento enviadas, aguardando operador confirmar
- pagamento_confirmado: operador confirmou, enviar formulário
- matriculado: formulário preenchido
- perdido: sem interesse ou encerrado

COMPORTAMENTO FORA DE ESCOPO:
- Assunto não relacionado à Zelar: responda com educação e redirecione.
- Linguagem agressiva: responda UMA VEZ com gentileza. tags=["inativo"], shouldIgnore=true, stage="perdido".

REGRA DE STAGE: use "novo_lead" apenas na primeira resposta. A partir da segunda mensagem, use sempre "em_atendimento" (ou o stage correspondente ao momento atual).`;

function parseAiJson(raw: string): AiResponse {
  let cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '');
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    // Modelo respondeu em texto puro (ignorou o formato JSON) — usa o texto como reply
    const text = cleaned.trim();
    if (!text) throw new Error('Resposta vazia do modelo');
    return {
      reply: text,
      stage: undefined,
      action: 'none',
      success: true,
      rawJson: JSON.stringify({ reply: text, action: 'none' }),
    } as AiResponse;
  }
  const parsed: AiResponse = JSON.parse(jsonMatch[0]);
  parsed.success = true;
  parsed.rawJson = jsonMatch[0];
  return parsed;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly genai: GoogleGenerativeAI;
  private readonly openrouterKey: string;
  private readonly openrouterModel = 'openai/gpt-oss-120b:free';
  private readonly geminiModel = 'gemini-2.5-flash-lite';
  private readonly geminiModelFallback = 'gemini-2.5-flash';

  constructor(private config: ConfigService) {
    this.genai = new GoogleGenerativeAI(config.get('GEMINI_API_KEY') ?? '');
    this.openrouterKey = config.get('OPENROUTER_API_KEY') ?? '';
  }

  getDefaultPromptLia(): string {
    return DEFAULT_PROMPT_LIA;
  }

  async processMessageLia(lead: Lead, incomingText: string, customPrompt?: string): Promise<AiResponse> {
    const history = (lead.aiContext as any[]) ?? [];
    const basePrompt = customPrompt ?? DEFAULT_PROMPT_LIA;
    const systemPrompt = `${basePrompt}${JSON_FORMAT_LIA}${buildLeadContext(lead)}`;

    // 1ª tentativa: OpenRouter (modelo gratuito) — comentado temporariamente para teste
    // try {
    //   return await this.callOpenRouter(systemPrompt, history, incomingText);
    // } catch (err) {
    //   this.logger.warn(`⚠️ [LIA] OpenRouter falhou (${err.message}) — caindo para Gemini Flash Lite`);
    // }

    // 1º fallback: Gemini Flash Lite
    try {
      return await this.callGemini(systemPrompt, history, incomingText, this.geminiModel);
    } catch (err) {
      this.logger.warn(`⚠️ [LIA] Gemini Flash Lite falhou (${err.message}) — caindo para Gemini Flash`);
    }

    // 2º fallback: Gemini Flash
    try {
      return await this.callGemini(systemPrompt, history, incomingText, this.geminiModelFallback);
    } catch (err) {
      this.logger.error(`❌ [LIA] Gemini Flash (2º fallback) também falhou: ${err.message}`);
      return { reply: 'Olá! Tive um probleminha aqui, pode repetir? 😊', success: false };
    }
  }

  private async callOpenRouter(systemPrompt: string, history: any[], incomingText: string): Promise<AiResponse> {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: this.openrouterModel,
        messages: [
          { role: 'system', content: systemPrompt },
          ...history,
          { role: 'user', content: incomingText },
        ],
        max_tokens: 512,
      },
      {
        headers: {
          Authorization: `Bearer ${this.openrouterKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 20000,
      },
    );

    // OpenRouter pode retornar 200 com erro no body (downtime de provider gratuito)
    if (response.data?.error) {
      throw new Error(response.data.error.message ?? 'erro no body do OpenRouter');
    }

    const raw = response.data?.choices?.[0]?.message?.content ?? '';
    if (!raw) throw new Error('Resposta vazia do OpenRouter');
    this.logger.debug(`[LIA/OpenRouter] Resposta bruta: ${raw}`);
    return parseAiJson(raw);
  }

  private async callGemini(systemPrompt: string, history: any[], incomingText: string, modelName = this.geminiModel): Promise<AiResponse> {
    const geminiHistory = history.map((m: any) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const model = this.genai.getGenerativeModel({
      model: modelName,
      systemInstruction: systemPrompt,
    });

    const chat = model.startChat({ history: geminiHistory });
    const result = await callWithRetry(
      () => chat.sendMessage(incomingText),
      this.logger,
    );

    const raw = result.response.text().trim();
    if (!raw) throw new Error('Resposta vazia do Gemini');
    this.logger.debug(`[LIA/Gemini(${modelName})] Resposta bruta: ${raw}`);
    return parseAiJson(raw);
  }

  buildUpdatedContext(lead: Lead, incomingText: string, rawJson: string): any[] {
    const history = (lead.aiContext as any[]) ?? [];
    return [
      ...history,
      { role: 'user', content: incomingText },
      { role: 'assistant', content: rawJson },
    ];
  }
}

