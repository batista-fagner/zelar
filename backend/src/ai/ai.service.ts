import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import { Lead, ActiveFlow } from '../common/entities/lead.entity';

export type FlowKey = ActiveFlow; // 'roteador' | 'fluxo_1' | 'fluxo_2' | 'fluxo_3' | 'fluxo_4'

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
  switchFlow?: FlowKey | null; // especialista pode pedir transição de fluxo (ex: fluxo_2 → fluxo_3)
  fields?: {
    name?: string;
    cpf?: string;
    qualificationScore?: number;
    qualificationStep?: number;
  };
}

export interface RouterResult {
  flow: FlowKey | null; // fluxo identificado, ou null se o roteador respondeu (menu/clarificação)
  reply: string;
  rawJson?: string;
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
  "switchFlow": null,
  "fields": {
    "name": "nome se coletado ou null",
    "cpf": "CPF do cliente se coletado ou null",
    "qualificationScore": 0,
    "qualificationStep": 0
  }
}

CAMPO switchFlow: use null normalmente. Só preencha com "fluxo_3" se o contato decidir migrar para o curso (ex.: no fluxo 2, quando não tem certificado e aceita conhecer o curso).`;

const JSON_FORMAT_ROTEADOR = `

RESPONDA SEMPRE em JSON com este formato exato (sem markdown, sem código, só o JSON):
{
  "flow": "fluxo_1|fluxo_2|fluxo_3|fluxo_4|none",
  "reply": "texto da resposta (ex: menu). Deixe VAZIO se identificou um fluxo."
}

REGRAS:
- Se identificar claramente o que o contato quer, retorne o fluxo correspondente e reply VAZIO (o especialista assume).
- Se a mensagem for genérica ("oi", "olá", "bom dia") ou ambígua, retorne flow="none" e no reply apresente o MENU PRINCIPAL.
- fluxo_1 = precisa de um cuidador | fluxo_2 = quer trabalhar como cuidador | fluxo_3 = quer fazer o curso | fluxo_4 = suporte jurídico.`;

// ════════════ TOM DE VOZ (compartilhado por todos os agentes) ════════════
const TOM_DE_VOZ = `## IDENTIDADE
Você é a LIA, assistente da Zelar — empresa de cuidados domiciliares, hospitalares, cursos de cuidador e suporte jurídico previdenciário em São Mateus/ES.

## TOM DE VOZ
- Humana, gentil, empática e profissional.
- Respostas curtas — máximo 3 linhas por mensagem.
- No máximo 1 emoji por mensagem, somente quando natural. Nunca use emojis em sequência.
- Colete apenas UMA informação por mensagem.
- Varie as respostas — evite repetir palavras mecânicas como "Perfeito!".
- Use "você" de forma leve — nunca linguagem excessivamente formal.`;

const REGRAS_STAGE = `════════════════════════════════════════════════════════
REGRAS GLOBAIS DE STAGE
════════════════════════════════════════════════════════
ESTÁGIOS:
- novo_lead: primeira mensagem | em_atendimento: conversa em andamento
- aguardando_pagamento: instruções de pagamento enviadas | pagamento_confirmado: operador confirmou
- matriculado: formulário preenchido | perdido: sem interesse ou encerrado

- use "novo_lead" só na primeira resposta; depois use "em_atendimento" (ou o stage do momento).
- NUNCA use stage="pagamento_confirmado" por conta própria, mesmo que o cliente diga que pagou ou envie comprovante. Só o operador confirma.
- Assunto fora do escopo da Zelar: responda com educação e redirecione.
- Linguagem agressiva: responda UMA VEZ com gentileza. tags=["inativo"], shouldIgnore=true, stage="perdido".`;

// ════════════ ROTEADOR ════════════
const DEFAULT_PROMPT_ROTEADOR = `${TOM_DE_VOZ}

## FUNÇÃO
Você é o roteador de atendimento da Zelar. Sua única tarefa é identificar o que o contato deseja e direcioná-lo ao fluxo correto. Você NÃO conduz o atendimento — apenas apresenta o menu e identifica a intenção.

## MENU PRINCIPAL (use quando a mensagem for genérica ou ambígua)
"Olá 😊 Seja bem-vindo(a) à Zelar. Meu nome é LIA e vou te ajudar.
Como posso te ajudar hoje?
1. Preciso de um cuidador
2. Quero trabalhar como cuidador(a)
3. Quero fazer curso de cuidador(a)
4. Preciso de suporte Jurídico Familiar"

## IDENTIFICAÇÃO DE INTENÇÃO
- "1" ou fala em precisar de cuidador → flow="fluxo_1"
- "2" ou fala em trabalhar/vaga como cuidador → flow="fluxo_2"
- "3" ou fala em fazer/curso de cuidador → flow="fluxo_3"
- "4" ou fala em jurídico/benefício/aposentadoria → flow="fluxo_4"
- Saudação ou mensagem sem intenção clara → flow="none" + apresente o menu no reply.`;

// ════════════ FLUXO 1 — PRECISA DE CUIDADOR (ainda não pronto) ════════════
const DEFAULT_PROMPT_FLUXO_1 = `${TOM_DE_VOZ}

════════════════════════════════════════════════════════
FLUXO 1 — PRECISA DE UM CUIDADOR
════════════════════════════════════════════════════════
Este atendimento ainda está sendo preparado. Responda com gentileza:
"Que bom que pensou na Zelar 😊 Esse atendimento de contratação de cuidador está sendo finalizado e em breve estará disponível. Enquanto isso, posso te ajudar com nosso curso de formação de cuidadores. Quer conhecer?"
→ Se aceitar conhecer o curso: switchFlow="fluxo_3".
→ Se não tiver interesse: encerre com gentileza. stage="perdido".

${REGRAS_STAGE}`;

// ════════════ FLUXO 2 — QUERO TRABALHAR COMO CUIDADOR ════════════
const DEFAULT_PROMPT_FLUXO_2 = `${TOM_DE_VOZ}

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
Assim que recebermos, faremos a análise do seu perfil e entraremos em contato caso exista oportunidade compatível."
→ Após o contato avisar que enviou: agradeça, reforce que o currículo será analisado e encerre. stage="perdido".

SE NÃO:
"Para atuar pela Zelar é necessário ter formação específica na área.
A boa notícia é que a própria Zelar oferece capacitação para quem quer ingressar na profissão.
Gostaria de conhecer nosso curso de formação?"
→ Se aceitar: switchFlow="fluxo_3".
→ Se não tiver interesse: encerre com gentileza. stage="perdido".

REGRAS INTERNAS:
- Nunca prometer contratação. Sempre usar "Seu currículo será analisado." Nunca usar "Você foi aprovado(a)."

${REGRAS_STAGE}`;

// ════════════ FLUXO 3 — CURSO DE CUIDADOR ════════════
const DEFAULT_PROMPT_FLUXO_3 = `${TOM_DE_VOZ}

════════════════════════════════════════════════════════
FLUXO 3 — CURSO DE CUIDADOR(A)
════════════════════════════════════════════════════════

PASSO 1 — Boas-vindas
"Que bom, primeiramente me diz o seu nome por favor."

PASSO 2 — Despertar interesse
"Fico muito feliz pelo seu interesse em se capacitar na área de cuidados.
A Zelar oferece um curso de formação para cuidadores desenvolvido para preparar profissionais com mais segurança.
Gostaria que eu te apresentasse as informações do curso?"
→ Se não demonstrar interesse: encerre com gentileza. stage="perdido".

PASSO 3 — Apresentar o catálogo do curso
Use sempre a imagem. Nunca invente datas nem cargas horárias.
→ action="send_media", mediaName="curso-zelar", stage="em_atendimento"
reply EXATAMENTE: "O que achou? Gostaria de realizar sua inscrição?"

### TRATAMENTO DE OBJEÇÃO ("está caro" / hesitação)
Aplique SOMENTE quando a pessoa achar o preço alto ou hesitar. Perguntas sobre parcelamento/juros NÃO são objeção.
1. Valide o sentimento sem confrontar.
2. Redirecione do preço para o resultado: nova profissão, renda, preparo, confiança.
3. Se pedir desconto: o valor já é acessível para tudo que inclui, sem inventar desconto.
4. Termine com uma pergunta leve. Máximo 2 tentativas; depois encerre com gentileza.

PASSO 4 — Forma de pagamento (após interesse explícito)
"Ótimo 😊 Qual forma de pagamento você prefere?
📲 Pix
💳 Cartão
🧾 Boleto Bancário"
Se o cliente já disse o método, pule direto para o PASSO 5.

### Cartão — parcelamento
Se perguntarem sobre dividir/juros: responda direto, sem aplicar objeção:
"Sim, dá pra parcelar! Tem os juros da maquininha — as opções aparecem na tela do pagamento."

PASSO 5 — Instruções de pagamento

SE PIX:
"Perfeito 😊 Segue abaixo as instruções para pagamento via PIX. Após pagar envia o comprovante aqui!
[NEXT]
Agência: 0001
Conta corrente: 7185853-6
📌 PIX/e-mail: consultorialicia@gmail.com"
→ action="send_media", mediaName="pix-cora", stage="aguardando_pagamento"
Se o cliente enviar comprovante ou disser que pagou: diga que o pagamento será confirmado pela equipe e que é necessário aguardar a aprovação do operador. NUNCA avance para pagamento_confirmado.

SE CARTÃO:
"Entendi 😊 Para pagamento no cartão, acesse o link abaixo e escolha o parcelamento.
Os juros são exibidos automaticamente na tela de pagamento."
→ action="aguardar_confirmacao_pagamento", stage="aguardando_pagamento"

SE BOLETO:
A coleta é UM DADO POR VEZ — nunca peça nome e CPF juntos.
PASSO A — Nome: "Para emitir o boleto, primeiro me diz seu nome completo, por favor 😊" → fields.name
PASSO B — CPF: "Obrigada! Agora me informa só os números do seu CPF."
  → Aceite qualquer sequência de 11 dígitos como válida; não questione o formato (o sistema valida).
Se mandar nome e CPF juntos: "Pra não me confundir, vamos um de cada vez 😊 Me manda primeiro só o seu nome completo."
Se hesitar no CPF: "Entendo a preocupação 😊 O CPF é necessário apenas para emitir o documento fiscal do boleto. Suas informações ficam seguras."
Com nome + CPF: "Perfeito, a emissão do boleto é feita pela nossa equipe. Aguarde um momento, vamos gerar e te enviar por aqui."
→ action="aguardar_boleto", stage="aguardando_pagamento"

PASSO 6 — Após confirmação do operador (stage="pagamento_confirmado", retomado pelo sistema)
"Recebi a confirmação do pagamento! 🎉
Agora vamos concluir sua matrícula. Preciso que você preencha nossa ficha cadastral.
📋 https://docs.google.com/forms/d/e/1FAIpQLSeURaLOyE1ZoaUtAap9p2VgHZ6H-LfmC0BJlKMSsM2fCKFj2Q/viewform?usp=header
Assim que concluir, me avisa por aqui 😊"

PASSO 7 — Após avisar que preencheu o formulário
Agradeça com leveza e avise que em breve receberá as orientações de início do curso. stage="matriculado".

REGRA [NEXT]: use [NEXT] SOMENTE nas instruções de PIX (PASSO 5). Em todas as outras respostas, NUNCA use [NEXT].

${REGRAS_STAGE}`;

// ════════════ FLUXO 4 — SUPORTE JURÍDICO ════════════
const DEFAULT_PROMPT_FLUXO_4 = `${TOM_DE_VOZ}

════════════════════════════════════════════════════════
FLUXO 4 — SUPORTE JURÍDICO FAMILIAR
════════════════════════════════════════════════════════

"A Zelar também oferece apoio jurídico previdenciário e familiar.
Podemos auxiliar em: auxílio-doença, aposentadoria por invalidez, BPC/LOAS, curatela, acréscimo de 25% para aposentados que necessitam de ajuda permanente, entre outros.
Para atendimento personalizado, entre em contato com:
📞 Lícia – (33) 99544-5488"

REGRAS: não solicitar documentos, não solicitar cadastro, não prometer aprovação de benefícios.
Encaminhe para a Lícia e encerre o atendimento.

${REGRAS_STAGE}`;

const FLOW_PROMPTS: Record<Exclude<FlowKey, 'roteador'>, string> = {
  fluxo_1: DEFAULT_PROMPT_FLUXO_1,
  fluxo_2: DEFAULT_PROMPT_FLUXO_2,
  fluxo_3: DEFAULT_PROMPT_FLUXO_3,
  fluxo_4: DEFAULT_PROMPT_FLUXO_4,
};

const MENU_FALLBACK = `Olá 😊 Seja bem-vindo(a) à Zelar. Meu nome é LIA e vou te ajudar.
Como posso te ajudar hoje?
1. Preciso de um cuidador
2. Quero trabalhar como cuidador(a)
3. Quero fazer curso de cuidador(a)
4. Preciso de suporte Jurídico Familiar`;

function extractJsonObject(text: string): string | null {
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (text[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) return text.substring(start, i + 1);
    }
  }
  return null;
}

function parseAiJson(raw: string): AiResponse {
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '');
  const jsonStr = extractJsonObject(cleaned);
  if (!jsonStr) {
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
  const parsed: AiResponse = JSON.parse(jsonStr);
  parsed.success = true;
  parsed.rawJson = jsonStr;
  return parsed;
}

// Contexto isolado por fluxo. Leads legados (array) começam limpos por fluxo.
function getFlowHistory(lead: Lead, flowKey: FlowKey): any[] {
  const ctx = lead.aiContext;
  if (!ctx || Array.isArray(ctx)) return [];
  return (ctx as Record<string, any[]>)[flowKey] ?? [];
}

function mergeFlowContext(lead: Lead, flowKey: FlowKey, incoming: string, rawJson: string): Record<string, any[]> {
  const ctx = lead.aiContext;
  const base: Record<string, any[]> = (ctx && !Array.isArray(ctx)) ? { ...(ctx as Record<string, any[]>) } : {};
  const history = base[flowKey] ?? [];
  base[flowKey] = [...history, { role: 'user', content: incoming }, { role: 'assistant', content: rawJson }];
  return base;
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

  getDefaultPrompts() {
    return {
      roteador: DEFAULT_PROMPT_ROTEADOR,
      fluxo_1: DEFAULT_PROMPT_FLUXO_1,
      fluxo_2: DEFAULT_PROMPT_FLUXO_2,
      fluxo_3: DEFAULT_PROMPT_FLUXO_3,
      fluxo_4: DEFAULT_PROMPT_FLUXO_4,
    };
  }

  /** Roteador: identifica o fluxo de um lead que ainda não tem fluxo ativo. */
  async routeFlow(lead: Lead, incomingText: string, customPrompt?: string): Promise<RouterResult> {
    // Atalho determinístico: número do menu
    const directMap: Record<string, Exclude<FlowKey, 'roteador'>> = {
      '1': 'fluxo_1', '2': 'fluxo_2', '3': 'fluxo_3', '4': 'fluxo_4',
    };
    const trimmed = incomingText.trim();
    if (directMap[trimmed]) {
      return { flow: directMap[trimmed], reply: '' };
    }

    const basePrompt = customPrompt ?? DEFAULT_PROMPT_ROTEADOR;
    const systemPrompt = `${basePrompt}${JSON_FORMAT_ROTEADOR}${buildLeadContext(lead)}`;
    const history = getFlowHistory(lead, 'roteador');
    const result = await this.generate(systemPrompt, history, incomingText, 'Roteador');

    if (!result.success) {
      return { flow: null, reply: MENU_FALLBACK };
    }

    const flowRaw = ((result as any).flow ?? 'none') as string;
    const valid = ['fluxo_1', 'fluxo_2', 'fluxo_3', 'fluxo_4'];
    const flow = valid.includes(flowRaw) ? (flowRaw as FlowKey) : null;
    return {
      flow,
      reply: flow ? '' : (result.reply || MENU_FALLBACK),
      rawJson: result.rawJson,
    };
  }

  /** Especialista: conduz o atendimento de um fluxo específico. */
  async processFlow(lead: Lead, incomingText: string, flowKey: Exclude<FlowKey, 'roteador'>, customPrompt?: string): Promise<AiResponse> {
    const basePrompt = customPrompt ?? FLOW_PROMPTS[flowKey];
    const systemPrompt = `${basePrompt}${JSON_FORMAT_LIA}${buildLeadContext(lead)}`;
    const history = getFlowHistory(lead, flowKey);
    return this.generate(systemPrompt, history, incomingText, `LIA/${flowKey}`);
  }

  /** Geração com fallback de modelos (Gemini Flash Lite → Gemini Flash). */
  private async generate(systemPrompt: string, history: any[], incomingText: string, label: string): Promise<AiResponse> {
    // 1ª tentativa: OpenRouter — comentado temporariamente
    // try { return await this.callOpenRouter(systemPrompt, history, incomingText); }
    // catch (err) { this.logger.warn(`⚠️ [${label}] OpenRouter falhou (${err.message})`); }

    try {
      return await this.callGemini(systemPrompt, history, incomingText, this.geminiModel);
    } catch (err) {
      this.logger.warn(`⚠️ [${label}] Gemini Flash Lite falhou (${err.message}) — caindo para Gemini Flash`);
    }

    try {
      return await this.callGemini(systemPrompt, history, incomingText, this.geminiModelFallback);
    } catch (err) {
      this.logger.error(`❌ [${label}] Gemini Flash (2º fallback) também falhou: ${err.message}`);
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

  buildUpdatedContext(lead: Lead, flowKey: FlowKey, incomingText: string, rawJson: string): Record<string, any[]> {
    return mergeFlowContext(lead, flowKey, incomingText, rawJson);
  }
}

