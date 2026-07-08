import { Controller, Post, Get, Body, Query, Res, Logger, OnModuleInit } from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { EvolutionService } from './evolution.service';
import { MessageQueueService } from './message-queue.service';
import { WhatsappConfigService } from './whatsapp-config.service';
import { UazapiProvider } from './providers/uazapi.provider';
import { LeadsService } from '../leads/leads.service';
import { AiService, AiResponse, FlowKey } from '../ai/ai.service';
import { WhatsappConfig } from '../common/entities/whatsapp-config.entity';
import { LeadsGateway } from '../leads/leads.gateway';
import { CalendarService } from '../calendar/calendar.service';
import { AudioService } from '../audio/audio.service';
import { MediaService } from '../media/media.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { InfinitpayService } from '../infinitpay/infinitpay.service';
import { CaregiversService } from '../care/caregivers.service';
import { CareRequestsService } from '../care/care-requests.service';
import { CareRequestSummary, CareComplexity } from '../common/entities/care-request.entity';

@Controller('webhooks')
export class EvolutionController implements OnModuleInit {
  private readonly logger = new Logger(EvolutionController.name);
  private readonly processedIds = new Set<string>();
  // Rastreia se a última mensagem recebida de um phone foi áudio (para responder em áudio)
  private readonly lastMessageWasAudio = new Map<string, boolean>();

  constructor(
    private readonly evolutionService: EvolutionService,
    private readonly messageQueue: MessageQueueService,
    private readonly whatsappConfigService: WhatsappConfigService,
    private readonly uazapiProvider: UazapiProvider,
    private readonly leadsService: LeadsService,
    private readonly aiService: AiService,
    private readonly leadsGateway: LeadsGateway,
    private readonly calendarService: CalendarService,
    private readonly audioService: AudioService,
    private readonly mediaService: MediaService,
    private readonly configService: ConfigService,
    private readonly appointmentsService: AppointmentsService,
    private readonly infinitpayService: InfinitpayService,
    private readonly caregiversService: CaregiversService,
    private readonly careRequestsService: CareRequestsService,
  ) {}

  onModuleInit() {
    this.leadsService.setFollowupSender((phone, message) =>
      this.evolutionService.sendTextMessage(phone, message),
    );
    this.careRequestsService.setSender((phone, message) =>
      this.evolutionService.sendTextMessage(phone, message),
    );
  }

  @Post('uazapi')
  async handleUazapiWebhook(@Body() body: any) {
    this.logger.debug(`Webhook recebido — EventType="${body.EventType}", phone="${body.chat?.phone}", fromMe=${body.message?.fromMe}, wasSentByApi=${body.message?.wasSentByApi}, type="${body.message?.type}", text="${String(body.message?.text ?? '').substring(0, 40)}"`);
    if (body.EventType !== 'messages') return { ok: true };

    // Validação de instância: rejeita mensagens de instâncias não configuradas neste backend
    const instanceConfig = await this.whatsappConfigService.get();
    const expectedToken = instanceConfig?.instanceToken;
    const bodyToken: string = body.token ?? body.instanceToken ?? body.instance?.token ?? '';
    if (expectedToken && bodyToken && bodyToken !== expectedToken) {
      this.logger.warn(`Webhook ignorado — instância desconhecida (token=${bodyToken.substring(0, 8)}...)`);
      return { ok: true };
    }

    const message = body.message;
    if (!message) { this.logger.warn('Webhook ignorado — body sem message'); return { ok: true }; }
    if (message.fromMe) { this.logger.debug(`Webhook ignorado — fromMe: ${message.messageid}`); return { ok: true }; }
    if (message.isGroup) { this.logger.debug(`Webhook ignorado — isGroup: ${message.messageid}`); return { ok: true }; }
    if (message.wasSentByApi) { this.logger.debug(`Webhook ignorado — wasSentByApi: ${message.messageid}`); return { ok: true }; }

    const rawPhone: string = body.chat?.phone ?? '';
    const phone = rawPhone.replace(/\D/g, '');
    const text: string = message.text;
    const isAudio = message.type === 'media' && ['audio', 'ptt', 'myaudio'].includes(message.mediaType);

    // Ignora mensagens de números de operadores (evita IA responder a testes internos)
    const operatorPhones = (this.configService.get<string>('OPERATOR_PHONES') ?? '')
      .split(',').map(p => p.replace(/\D/g, '')).filter(Boolean);
    if (operatorPhones.includes(phone)) {
      this.logger.debug(`Webhook ignorado — número de operador: ${phone}`);
      return { ok: true };
    }

    // Modo de teste: se ALLOWED_PHONES estiver configurado, só atende esses números
    const allowedPhones = (this.configService.get<string>('ALLOWED_PHONES') ?? '')
      .split(',').map(p => p.replace(/\D/g, '')).filter(Boolean);
    if (allowedPhones.length > 0) {
      // Normaliza para comparar: adiciona o 9 após DDD se número brasileiro sem o nono dígito
      const normalizePhone = (p: string) => {
        if (p.startsWith('55') && p.length === 12) return `${p.slice(0, 4)}9${p.slice(4)}`;
        return p;
      };
      const normalizedPhone = normalizePhone(phone);
      const isAllowed = allowedPhones.some(a => a === phone || a === normalizedPhone || normalizePhone(a) === phone);
      if (!isAllowed) {
        this.logger.debug(`Webhook ignorado — modo teste ativo, número não permitido: ${phone}`);
        return { ok: true };
      }
    }

    // Ignora reações de mensagem (👍, ❤️, etc.) — uazapi pode enviar como type='reaction'
    // ou com campo reactionMessage preenchido
    if (message.type === 'reaction' || message.reactionMessage || body.reactionMessage) {
      this.logger.debug(`Webhook ignorado — reação de mensagem: type=${message.type} text=${message.text}`);
      return { ok: true };
    }

    if (!phone || (!text && !isAudio)) {
      this.logger.warn(`Webhook ignorado — phone="${phone}", text="${text}", type="${message.type}", mediaType="${message.mediaType}"`);
      return { ok: true };
    }

    // Log detalhado para tipos não-padrão (ajuda a identificar novos tipos do uazapi)
    if (message.type && message.type !== 'text' && message.type !== 'media' && message.type !== 'extendedTextMessage') {
      this.logger.warn(`[WEBHOOK] Tipo incomum recebido: type=${message.type}, text="${String(text ?? '').substring(0, 40)}", body=${JSON.stringify(message).substring(0, 200)}`);
    }

    if (!phone || (!text && !isAudio)) return { ok: true };

    // Ignora mensagens antigas — timestamp já em milissegundos na uazapi
    const messageTimestamp: number = message.messageTimestamp;
    if (messageTimestamp) {
      const ageSeconds = (Date.now() - messageTimestamp) / 1000;
      if (ageSeconds > 300) {
        this.logger.warn(`Mensagem ignorada — muito antiga (${Math.round(ageSeconds)}s): ${phone}`);
        return { ok: true };
      }
    }

    // Deduplicação por messageid
    const messageId: string = message.messageid;
    if (this.processedIds.has(messageId)) {
      this.logger.warn(`Webhook duplicado ignorado: ${messageId}`);
      return { ok: true };
    }
    this.processedIds.add(messageId);
    setTimeout(() => this.processedIds.delete(messageId), 5 * 60 * 1000);

    this.lastMessageWasAudio.set(phone, isAudio);

    if (isAudio) {
      this.transcribeAndEnqueue(phone, message, messageId).catch((err) =>
        this.logger.error(`Erro ao transcrever áudio de ${phone}: ${err.message}`),
      );
      return { ok: true };
    }

    this.logger.log(`Mensagem recebida de ${phone}: ${text}`);

    this.messageQueue.enqueue(phone, text, (combinedText) => {
      this.logger.log(`[PROCESSANDO] messageId=${messageId}, phone=${phone}, texto="${combinedText.substring(0, 40)}..."`);
      this.processMessage(phone, combinedText, messageId).catch((err) => {
        this.logger.error(`❌ [ERRO AO PROCESSAR] ${phone}: ${err.message}`);
        this.logger.error(`❌ [ERRO AO PROCESSAR] Stack: ${err.stack}`);
        this.sendFallback(phone);
      });
    });

    return { ok: true };
  }

  private async sendFallback(phone: string) {
    try {
      const fallbackText = 'Desculpa, tive uma instabilidade aqui. Pode repetir a última mensagem? 😊';
      await this.evolutionService.sendTextMessage(phone, fallbackText);
      this.logger.warn(`📤 [FALLBACK] Mensagem de recuperação enviada para ${phone}`);
    } catch (err) {
      this.logger.error(`Falha ao enviar fallback para ${phone}: ${err.message}`);
    }
  }

  private async transcribeAndEnqueue(phone: string, message: any, messageId: string) {
    this.logger.log(`Transcrevendo áudio de ${phone}...`);
    const transcribedText = await this.evolutionService.transcribeAudio(message.messageid);
    this.logger.log(`Áudio transcrito de ${phone}: "${transcribedText}"`);

    this.messageQueue.enqueue(phone, transcribedText, (combinedText) => {
      this.processMessage(phone, combinedText, messageId).catch((err) => {
        this.logger.error(`Erro ao processar áudio transcrito de ${phone}: ${err.message}`);
        this.sendFallback(phone);
      });
    });
  }

  /** Seleciona o prompt customizado do fluxo (ou undefined para usar o default do código). */
  private pickFlowPrompt(config: WhatsappConfig | null, flow: Exclude<FlowKey, 'roteador'>): string | undefined {
    if (!config) return undefined;
    switch (flow) {
      case 'fluxo_1': return config.promptFluxo1 ?? undefined;
      case 'fluxo_2': return config.promptFluxo2 ?? undefined;
      // fluxo_3 cai para o prompt legado (customPromptLia) enquanto promptFluxo3 não for definido
      case 'fluxo_3': return config.promptFluxo3 ?? config.customPromptLia ?? undefined;
      case 'fluxo_4': return config.promptFluxo4 ?? undefined;
    }
  }

  private async processMessage(phone: string, combinedText: string, messageKeyId: string) {
    // INTERCEPTAÇÃO DE CUIDADOR (Fluxo 1): telefones cadastrados como cuidadores NUNCA
    // viram lead — a resposta deles (ex: "ACEITO") é tratada pelo serviço de solicitações.
    const caregiver = await this.caregiversService.findActiveByPhone(phone);
    if (caregiver) {
      this.logger.log(`[CARE] Mensagem de cuidador ${caregiver.name} (${phone}) interceptada: "${combinedText.substring(0, 40)}"`);
      await this.careRequestsService.handleCaregiverReply(caregiver, combinedText);
      return;
    }

    const { lead: leadInit, conversation } = await this.leadsService.findOrCreate(phone);
    let lead = leadInit;

    this.logger.log(`[DIAG] findOrCreate phone=${phone} → id=${lead.id}, stage=${lead.stage}, activeFlow=${lead.activeFlow}, aiEnabled=?`);

    await this.leadsService.saveMessage(conversation.id, 'inbound', phone, combinedText, messageKeyId);
    await this.leadsService.update(lead.id, { lastMessageAt: new Date() });

    // Se IA desativada (etiquetado como inativo), apenas salva e notifica frontend — nunca responde
    const aiEnabled = await this.leadsService.getAiEnabled(lead.id);
    if (!aiEnabled) {
      const updatedLead = await this.leadsService.findOne(lead.id);
      this.leadsGateway.emitLeadUpdated(updatedLead);
      return;
    }

    // GUARD DETERMINÍSTICO POR STAGE: lead aguardando confirmação de pagamento NÃO recebe
    // resposta da IA — independente do flag aiEnabled ou do que a IA tente fazer.
    // Só o operador (botão "Confirmar Pagamento") ou o webhook InfinitPay retomam a conversa.
    // Isso impede a IA de: (a) confirmar pagamento por conta própria ("ta bom" → formulário),
    // (b) regredir o card (perdido/novo_lead) enquanto aguarda pagamento.
    if (lead.stage === 'aguardando_pagamento') {
      this.logger.log(`[GUARD] ${phone} em aguardando_pagamento — IA não responde (aguardando operador/webhook)`);
      await this.leadsService.toggleAi(lead.id, false);
      const updatedLead = await this.leadsService.findOne(lead.id);
      this.leadsGateway.emitLeadUpdated(updatedLead);
      return;
    }

    // Lead perdido que volta a falar: a IA continua respondendo, mas o card NÃO é
    // movido automaticamente (regra: nenhuma regressão automática). Se for o caso de
    // reativar, o operador move o card manualmente no Kanban.

    // AUTO-EXTRAÇÃO DE CPF: se a mensagem contém exatamente 11 dígitos e o lead
    // ainda não tem CPF, salva imediatamente — a IA não precisa validar formato.
    // Só executa quando o lead tem a label 'boleto' (evita capturar dígitos fora de contexto).
    const existingCpf = (lead as any).cpf;
    if (!existingCpf && (lead.labels ?? []).includes('boleto')) {
      const digits = combinedText.replace(/\D/g, '');
      if (digits.length === 11) {
        await this.leadsService.update(lead.id, { cpf: digits } as any);
        lead = (await this.leadsService.findOne(lead.id)) ?? lead;
        this.logger.log(`[CPF] Auto-extraído da mensagem para ${phone}: ${digits}`);
      }
    }

    // Mostra "digitando..." enquanto a IA processa
    void this.evolutionService.sendTypingIndicator(phone, 5000);

    // ROTEAMENTO MULTIAGENTE: determina qual agente conduz o atendimento
    const instanceConfig = await this.whatsappConfigService.get();
    let flow = (lead.activeFlow ?? null) as Exclude<FlowKey, 'roteador'> | null;
    let flowKeyForContext: FlowKey;
    let aiResponse: AiResponse;

    // Migração: leads legados (sem activeFlow) já em estágios de pagamento só podem
    // estar no fluxo do curso — atribui fluxo_3 sem passar pelo roteador.
    if (!flow && ['aguardando_pagamento', 'pagamento_confirmado', 'matriculado'].includes(lead.stage)) {
      flow = 'fluxo_3';
      await this.leadsService.update(lead.id, { activeFlow: flow } as any);
      lead.activeFlow = flow;
      this.logger.log(`[MIGRAÇÃO] ${phone} em ${lead.stage} → fluxo_3`);
    }

    if (!flow) {
      const routed = await this.aiService.routeFlow(lead, combinedText, instanceConfig?.promptRoteador ?? undefined);
      if (routed.flow && routed.flow !== 'roteador') {
        flow = routed.flow as Exclude<FlowKey, 'roteador'>;
        await this.leadsService.update(lead.id, { activeFlow: flow } as any);
        lead.activeFlow = flow;
        flowKeyForContext = flow;
        this.logger.log(`[ROTEADOR] ${phone} → ${flow}`);
        aiResponse = await this.aiService.processFlow(lead, combinedText, flow, this.pickFlowPrompt(instanceConfig, flow));
      } else {
        // Roteador respondeu com o menu — sem fluxo definido ainda
        flowKeyForContext = 'roteador';
        aiResponse = {
          reply: routed.reply,
          rawJson: routed.rawJson ?? JSON.stringify({ flow: 'none', reply: routed.reply }),
          success: true,
          action: 'none',
        };
        this.logger.log(`[ROTEADOR] ${phone} → menu (sem fluxo definido)`);
      }
    } else {
      flowKeyForContext = flow;
      aiResponse = await this.aiService.processFlow(lead, combinedText, flow, this.pickFlowPrompt(instanceConfig, flow));
    }

    // Transição de fluxo solicitada pelo especialista (ex: fluxo_2 → fluxo_3)
    if (aiResponse.switchFlow && aiResponse.switchFlow !== lead.activeFlow) {
      const validFlows: FlowKey[] = ['fluxo_1', 'fluxo_2', 'fluxo_3', 'fluxo_4'];
      if (validFlows.includes(aiResponse.switchFlow)) {
        const newFlow = aiResponse.switchFlow as Exclude<FlowKey, 'roteador'>;
        await this.leadsService.update(lead.id, { activeFlow: newFlow } as any);
        lead.activeFlow = newFlow;
        this.logger.log(`[SWITCH] ${phone} → ${newFlow}`);

        // Envia a resposta de transição do fluxo atual (ex: "Que ótimo!")
        if (aiResponse.reply) {
          void this.evolutionService.sendTypingIndicator(phone, 1000);
          await new Promise(r => setTimeout(r, 800));
          await this.evolutionService.sendTextMessage(phone, aiResponse.reply);
          await this.leadsService.saveMessage(conversation.id, 'outbound', 'ai', aiResponse.reply);
          aiResponse.reply = ''; // evita reenvio no final do fluxo normal
        }

        // Chama o novo especialista na mesma requisição com o contexto atualizado
        const freshLead = (await this.leadsService.findOne(lead.id)) ?? lead;
        const switchPrompt = this.pickFlowPrompt(instanceConfig, newFlow);
        const handoffMsg = `[Sistema] O usuário aceitou e foi transferido do ${flowKeyForContext} para ${newFlow}. Continue a conversa a partir do PASSO 1 do novo fluxo.`;
        const switchResponse = await this.aiService.processFlow(freshLead, handoffMsg, newFlow, switchPrompt);

        if (switchResponse.success && switchResponse.reply) {
          void this.evolutionService.sendTypingIndicator(phone, 1500);
          await new Promise(r => setTimeout(r, 1200));
          await this.evolutionService.sendTextMessage(phone, switchResponse.reply);
          await this.leadsService.saveMessage(conversation.id, 'outbound', 'ai', switchResponse.reply);
          const switchContext = this.aiService.buildUpdatedContext(freshLead, newFlow, handoffMsg, switchResponse.rawJson!);
          await this.leadsService.update(lead.id, { aiContext: switchContext } as any);
        }

        if (switchResponse.stage) {
          await this.safeUpdateStageForAi(lead.id, freshLead.stage, switchResponse.stage);
        }

        const updatedLead = await this.leadsService.findOne(lead.id);
        this.leadsGateway.emitLeadUpdated(updatedLead);
        return;
      }
    }

    this.logger.log(`LIA respondeu [flow=${flowKeyForContext}, stage=${aiResponse.stage}]: ${aiResponse.reply}`);

    // FLUXO 1 — guarda os dados do atendimento coletados até aqui (nome, tipo, região,
    // data, turno, complexidade) em lead.aiContext.careSummaryPending. O broadcast pros
    // cuidadores só dispara DEPOIS do pagamento confirmado (CareRequestsService.triggerBroadcastAfterPayment),
    // então esses dados precisam sobreviver até lá — são atualizados a cada resposta da IA.
    if (flowKeyForContext === 'fluxo_1' && aiResponse.fields) {
      const f = aiResponse.fields;
      if (f.tipoCuidado && f.regiao && f.dataAtendimento && f.turno) {
        const careSummaryPending = {
          clientName: (f.name || lead.name || '').trim(),
          tipoCuidado: f.tipoCuidado,
          regiao: f.regiao,
          dataAtendimento: f.dataAtendimento,
          turno: f.turno,
          complexidade: f.complexidade ?? null,
        };
        const currentContext = (lead.aiContext as any) ?? {};
        lead.aiContext = { ...currentContext, careSummaryPending } as any;
        await this.leadsService.update(lead.id, { aiContext: lead.aiContext } as any);
      }
    }

    // GUARD DETERMINÍSTICO — CONFIRMAÇÃO DE PAGAMENTO É EXCLUSIVA DO OPERADOR/WEBHOOK:
    // a IA NÃO pode confirmar pagamento nem enviar o formulário de matrícula por conta
    // própria. O formulário só sai pelo endpoint confirm-payment (botão do operador) ou
    // pelo webhook InfinitPay — ambos setam pagamento_confirmado ANTES de chamar a IA.
    // Aqui, se a IA tenta setar pagamento_confirmado sem o lead já estar nesse stage, é
    // alucinação (ex.: cliente disse "ta bom") — suprime a resposta inteira, não envia nada.
    // Os 3 marcos abaixo só são válidos quando o lead JÁ está em pagamento_confirmado
    // (estado setado exclusivamente pelo operador/webhook antes de chamar a IA):
    //   - confirmar pagamento (stage=pagamento_confirmado)
    //   - enviar o formulário de matrícula (link do Google Forms)
    //   - matricular (stage=matriculado)
    // Se a IA anuncia qualquer um desses sem o lead estar em pagamento_confirmado, é
    // alucinação (ex.: cliente disse "ta bom"/"fiz") — suprime a resposta inteira para
    // não enviar mensagem que contradiz o card (que continua parado pela proteção de stage).
    // Bloqueia marcos que exigem pagamento confirmado pelo operador/webhook:
    // - pagamento_confirmado: só operador/webhook pode setar
    // - formulário: só enviado via confirm-payment (lead já em pagamento_confirmado)
    // - matriculado: só válido a partir de pagamento_confirmado
    // Se o lead JÁ está em matriculado, a IA pode responder livremente (stage é no-op).
    const stagesQueExigemPagamento = ['pagamento_confirmado', 'matriculado'];
    const tentouMarcoSemAutorizacao =
      (stagesQueExigemPagamento.includes(aiResponse.stage ?? '') || /docs\.google\.com\/forms/i.test(aiResponse.reply ?? '')) &&
      !['pagamento_confirmado', 'matriculado'].includes(lead.stage);
    if (tentouMarcoSemAutorizacao) {
      this.logger.warn(`[GUARD] IA tentou anunciar marco sem autorização para ${phone} (stage atual=${lead.stage}, aiStage=${aiResponse.stage}). Resposta suprimida.`);
      const updatedLead = await this.leadsService.findOne(lead.id);
      this.leadsGateway.emitLeadUpdated(updatedLead);
      return;
    }

    // CAMADA DE SEGURANÇA: Se shouldIgnore=true, não responder e sair
    if (aiResponse.shouldIgnore === true) {
      this.logger.warn(`Lead ${phone} marcado para ignorar. Aplicando etiquetas e não respondendo mais.`);

      // Envia a mensagem final UMA VEZ antes de silenciar
      if (aiResponse.reply) {
        this.logger.log(`📤 [SHOULDIGNORE] Enviando ${aiResponse.reply.substring(0, 40)}...`);
        await this.evolutionService.sendTextMessage(phone, aiResponse.reply);
        await this.leadsService.saveMessage(conversation.id, 'outbound', 'ai', aiResponse.reply);
      }

      // Aplica etiquetas na uazapi e salva no banco
      const tags = aiResponse.tags ?? [];
      if (tags.length > 0) {
        await this.applyTagsToLead(phone, tags);
        const existingLabels: string[] = lead.labels ?? [];
        const mergedLabels = Array.from(new Set([...existingLabels, ...tags]));
        await this.leadsService.update(lead.id, { labels: mergedLabels } as any);
      }

      // Atualiza stage e desativa IA permanentemente para nunca mais responder
      if (aiResponse.stage) {
        await this.safeUpdateStageForAi(lead.id, lead.stage, aiResponse.stage);
      }
      await this.leadsService.toggleAi(lead.id, false);

      const updatedLead = await this.leadsService.findOne(lead.id);
      this.leadsGateway.emitLeadUpdated(updatedLead);
      return;
    }

    // Helper: extrai apenas os dígitos (usado para CPF)
    const onlyDigits = (s?: string | null) => (s ?? '').replace(/\D/g, '');

    // GUARD BOLETO (rede de segurança no backend — não confia 100% no prompt):
    // só dispara o boleto quando houver nome (qualquer) + CPF com 11 dígitos.
    // Se CPF for válido mas nome faltar, salva o CPF e pede o nome (não descarta o CPF).
    // Se CPF for inválido, descarta e pede de novo.
    if (aiResponse.action === 'aguardar_boleto') {
      // Marca a intenção de boleto CEDO (mesmo com dados incompletos) — habilita a
      // auto-extração de CPF nas próximas mensagens e a conclusão determinística.
      if (!(lead.labels ?? []).includes('boleto')) {
        await this.applyTagsToLead(phone, ['boleto']);
        const merged = [...(lead.labels ?? []), 'boleto'];
        await this.leadsService.update(lead.id, { labels: merged } as any);
        lead.labels = merged;
      }

      const cpfDigits = onlyDigits(aiResponse.fields?.cpf || (lead as any).cpf);
      const effectiveName = (aiResponse.fields?.name || lead.name || '').trim();
      const hasName = effectiveName.length > 0;
      const cpfValid = cpfDigits.length === 11;

      if (!hasName || !cpfValid) {
        this.logger.warn(`[BOLETO] Bloqueado — nomeOk=${hasName} cpf=${cpfDigits.length} dígitos. Pedindo correção.`);
        if (aiResponse.fields) {
          // Preserva CPF válido para não perder entre turnos; descarta somente se inválido
          aiResponse.fields.cpf = cpfValid ? cpfDigits : (null as any);
        }
        aiResponse.action = 'none';
        aiResponse.stage = undefined;
        aiResponse.reply = !hasName
          ? 'Para emitir o boleto, primeiro me diz seu nome, por favor 😊'
          : 'Quase lá! Agora me confirma só os 11 números do seu CPF 😊';
      } else if (aiResponse.fields) {
        aiResponse.fields.cpf = cpfDigits; // normaliza para só dígitos antes de salvar/notificar
      }
    }

    // Atualiza contexto e campos do lead
    const updatedContext = aiResponse.success
      ? this.aiService.buildUpdatedContext(lead, flowKeyForContext, combinedText, aiResponse.rawJson!)
      : lead.aiContext;
    const updateData: any = { aiContext: updatedContext };

    if (aiResponse.temperature) updateData.temperature = aiResponse.temperature;
    if (aiResponse.fields) {
      const f = aiResponse.fields;
      // Atualiza nome se o lead ainda não tem um, OU se a IA trouxe uma versão
      // mais completa (mais palavras) — necessário para coletar nome completo no boleto.
      const wordCount = (s?: string | null) => (s ?? '').trim().split(/\s+/).filter(Boolean).length;
      if (f.name && (!lead.name || wordCount(f.name) > wordCount(lead.name))) updateData.name = f.name;
      if (f.cpf && !(lead as any).cpf) updateData.cpf = onlyDigits(f.cpf);
      if (f.qualificationScore !== undefined) updateData.qualificationScore = f.qualificationScore;
      if (f.qualificationStep !== undefined) updateData.qualificationStep = f.qualificationStep;
    }

    await this.leadsService.update(lead.id, updateData);

    // CONCLUSÃO DETERMINÍSTICA DO BOLETO (rede de segurança independente da action da IA):
    // só roda se a IA EMITIU action=aguardar_boleto — evita disparar em mensagens posteriores
    // de um lead que tem label boleto mas já passou pra pagamento_confirmado.
    if (aiResponse.action === 'aguardar_boleto' && (lead.labels ?? []).includes('boleto')) {
      const freshLead = (await this.leadsService.findOne(lead.id)) ?? lead;
      const cpf = onlyDigits((freshLead as any).cpf);
      const name = (freshLead.name ?? '').trim();
      // Só conclui se o lead ainda NÃO chegou a aguardando_pagamento (evita regredir
      // um lead já em aguardando_pagamento/pagamento_confirmado/matriculado).
      const beforePayment = (this.STAGE_ORDER[freshLead.stage] ?? 0) < this.STAGE_ORDER['aguardando_pagamento'];
      if (name && cpf.length === 11 && beforePayment) {
        await this.completeBoleto(freshLead, phone, conversation.id);
        return;
      }
    }

    // GUARD SOLICITAR CUIDADOR (Fluxo 1 — rede de segurança no backend, não confia 100% no prompt):
    // só dispara o broadcast quando TODOS os dados estiverem válidos. Com dados incompletos,
    // transforma em pergunta determinística pelo dado faltante.
    if (aiResponse.action === 'solicitar_cuidador') {
      const normalize = (s?: string | null) =>
        (s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

      const f = aiResponse.fields ?? {};
      const clientName = (f.name || lead.name || '').trim();
      const tipoCuidado = (f.tipoCuidado ?? '').trim();
      const regiao = (f.regiao ?? '').trim();
      const dataAtendimento = (f.dataAtendimento ?? '').trim();
      const turno = normalize(f.turno);
      const turnoValid = ['manha', 'tarde', 'noite', 'integral'].includes(turno);
      const dataValid = /^\d{2}\/\d{2}\/\d{4}$/.test(dataAtendimento);

      const missingReply = !clientName ? 'Pra começar, me diz o seu nome, por favor 😊'
        : !tipoCuidado ? 'Me conta rapidinho: pra quem é o cuidado e qual a necessidade?'
        : !regiao ? 'Em qual bairro ou cidade será o atendimento?'
        : !dataValid ? 'Pra qual data você precisa do atendimento? 😊'
        : !turnoValid ? 'Qual período você prefere: manhã, tarde, noite ou integral?'
        : null;

      if (missingReply) {
        this.logger.warn(`[CARE] solicitar_cuidador bloqueado — dados incompletos (nome=${!!clientName}, tipo=${!!tipoCuidado}, regiao=${!!regiao}, dataOk=${dataValid}, turnoOk=${turnoValid})`);
        aiResponse.action = 'none';
        aiResponse.stage = undefined;
        aiResponse.reply = missingReply;
      } else {
        // Complexidade: classificação interna da IA — default 'medio' se vier inválida (não bloqueia o cliente)
        const complexityRaw = normalize(f.complexidade);
        const complexity: CareComplexity = (['simples', 'medio', 'complexo'].includes(complexityRaw)
          ? complexityRaw : 'medio') as CareComplexity;

        await this.completeCareRequest(lead, phone, conversation.id, {
          clientName, tipoCuidado, regiao, dataAtendimento,
          turno: turno as CareRequestSummary['turno'],
        }, complexity, aiResponse.reply);
        return;
      }
    }

    // Aplica tags
    const normalTags = (aiResponse.tags ?? []).filter(t => t);
    if (normalTags.length > 0) {
      const existingLabels: string[] = lead.labels ?? [];
      const newTags = normalTags.filter(t => !existingLabels.includes(t));
      if (newTags.length > 0) {
        await this.applyTagsToLead(phone, newTags);
        const mergedLabels = Array.from(new Set([...existingLabels, ...newTags]));
        await this.leadsService.update(lead.id, { labels: mergedLabels } as any);
      }
    }

    // Fallback: avança de novo_lead para em_atendimento
    if (lead.stage === 'novo_lead' && (!aiResponse.stage || aiResponse.stage === 'novo_lead')) {
      aiResponse.stage = 'em_atendimento';
    }

    // Atualiza stage com proteção contra regressão e contra avanço indevido
    if (aiResponse.stage) {
      await this.safeUpdateStageForAi(lead.id, lead.stage, aiResponse.stage);
    }

    // Envio de mídia (imagem/vídeo cadastrada no sistema)
    if (aiResponse.action === 'send_media' && aiResponse.mediaName) {
      const mediaFile = await this.mediaService.findByName(aiResponse.mediaName);
      if (mediaFile) {
        const type = mediaFile.mimeType?.startsWith('video/') ? 'video' : 'image';
        const mediaBlocks = aiResponse.reply.split('[NEXT]').map((b: string) => b.trim()).filter(b => b && !b.includes('[imagem') && !b.includes('[image') && !b.includes('📎'));
        const caption = mediaBlocks[0] ?? '';
        const extraBlocks = mediaBlocks.slice(1);
        await this.uazapiProvider.sendMediaByUrl(phone, mediaFile.url, type, caption);
        await this.leadsService.saveMessage(conversation.id, 'outbound', 'ai', `[mídia: ${mediaFile.name}] ${caption}`);
        // Envia blocos extras após a imagem
        for (const block of extraBlocks) {
          void this.evolutionService.sendTypingIndicator(phone, 1500);
          await new Promise(r => setTimeout(r, 1000));
          await this.evolutionService.sendTextMessage(phone, block);
          await this.leadsService.saveMessage(conversation.id, 'outbound', 'ai', block);
        }
        if (aiResponse.stage) {
          await this.safeUpdateStageForAi(lead.id, lead.stage, aiResponse.stage);
        }
        // Pausa a IA apenas para mídia de pagamento (PIX), aguardando confirmação do operador.
        // Mídias informativas (ex: catálogo do curso) NÃO pausam a IA.
        const isPaymentMedia = aiResponse.mediaName === 'pix-cora';
        if (isPaymentMedia) {
          await this.leadsService.toggleAi(lead.id, false);
        }
        aiResponse.reply = ''; // Limpa para não enviar em duplicado
      } else {
        this.logger.warn(`[LIA] Mídia "${aiResponse.mediaName}" não encontrada no banco`);
      }
    }

    // Boleto com dados incompletos: a IA emitiu aguardar_boleto mas o guard acima
    // transformou em pedido de nome/CPF (action='none'). A conclusão determinística
    // (acima) cuida do caso com dados completos. Aqui não há mais nada a fazer.

    // Confirmação de pagamento: cartão → gera link InfinitPay
    if (aiResponse.action === 'aguardar_confirmacao_pagamento' || aiResponse.action === 'send_payment_link') {
      try {
        const paymentUrl = await this.infinitpayService.createPaymentLink(lead.id);
        const msg = `${aiResponse.reply}\n\n${paymentUrl}`;
        await this.evolutionService.sendTextMessage(phone, msg);
        await this.leadsService.saveMessage(conversation.id, 'outbound', 'ai', msg);
        if (aiResponse.stage) await this.safeUpdateStageForAi(lead.id, lead.stage, aiResponse.stage);
        await this.leadsService.toggleAi(lead.id, false);
        const updatedLead = await this.leadsService.findOne(lead.id);
        this.leadsGateway.emitLeadUpdated(updatedLead);
      } catch (err) {
        this.logger.error(`[InfinitPay] Falha ao criar link para ${phone}: ${err.message}`);
        await this.evolutionService.sendTextMessage(phone, 'Tive um probleminha ao gerar o link de pagamento. Nossa equipe entrará em contato em breve! 😊');
      }
      return;
    }

    this.lastMessageWasAudio.delete(phone);

    const blocks = aiResponse.reply.split('[NEXT]').map((b: string) => b.trim()).filter(Boolean);
    if (blocks.length > 1) {
      for (let i = 0; i < blocks.length; i++) {
        if (i > 0) {
          void this.evolutionService.sendTypingIndicator(phone, 1500);
          await new Promise(r => setTimeout(r, 1000));
        }
        this.logger.log(`📤 [TEXT ${i + 1}/${blocks.length}] Enviando para ${phone}: ${blocks[i].substring(0, 60)}...`);
        await this.evolutionService.sendTextMessage(phone, blocks[i]);
      }
      this.logger.log(`✅ [TEXT] ${blocks.length} blocos enviados para ${phone}`);
      await this.leadsService.saveMessage(conversation.id, 'outbound', 'ai', aiResponse.reply);
    } else if (blocks.length === 1) {
      this.logger.log(`📤 [TEXT] Enviando resposta para ${phone}: ${aiResponse.reply.substring(0, 60)}...`);
      await this.evolutionService.sendTextMessage(phone, aiResponse.reply);
      this.logger.log(`✅ [TEXT] Resposta enviada para ${phone}`);
      await this.leadsService.saveMessage(conversation.id, 'outbound', 'ai', aiResponse.reply);
    }
    // blocks.length === 0: mídia já enviada, reply foi limpo — não envia texto duplicado

    const updatedLead = await this.leadsService.findOne(lead.id);
    this.leadsGateway.emitLeadUpdated(updatedLead);

  }

  // Verificação de webhook exigida pela Meta
  @Get('whatsapp')
  handleMetaVerification(@Query() query: any, @Res() res: Response) {
    const mode = query['hub.mode'];
    const token = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode === 'subscribe' && token === this.configService.get('WHATSAPP_VERIFY_TOKEN')) {
      this.logger.log('Webhook Meta verificado com sucesso');
      return res.status(200).send(challenge);
    }

    this.logger.warn('Falha na verificação do webhook Meta — token inválido');
    return res.status(403).send('Forbidden');
  }

  @Post('whatsapp')
  async handleMetaWebhook(@Body() body: any) {
    if (body.object !== 'whatsapp_business_account') return { ok: true };

    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const messages: any[] = value?.messages ?? [];

    for (const message of messages) {
      if (message.type === 'reaction') continue;

      const rawPhone: string = message.from ?? '';
      const phone = rawPhone.replace(/\D/g, '');
      if (!phone) continue;

      // Ignora mensagens antigas
      const ageSeconds = (Date.now() / 1000) - Number(message.timestamp);
      if (ageSeconds > 300) {
        this.logger.warn(`Mensagem Meta ignorada — muito antiga (${Math.round(ageSeconds)}s): ${phone}`);
        continue;
      }

      // Deduplicação
      const messageId: string = message.id;
      if (this.processedIds.has(messageId)) {
        this.logger.warn(`Webhook Meta duplicado ignorado: ${messageId}`);
        continue;
      }
      this.processedIds.add(messageId);
      setTimeout(() => this.processedIds.delete(messageId), 5 * 60 * 1000);

      const isAudio = message.type === 'audio';
      this.lastMessageWasAudio.set(phone, isAudio);

      if (isAudio) {
        const mediaId: string = message.audio?.id;
        if (!mediaId) continue;
        this.transcribeAndEnqueueMeta(phone, mediaId, messageId).catch((err) =>
          this.logger.error(`Erro ao transcrever áudio Meta de ${phone}: ${err.message}`),
        );
        continue;
      }

      const text: string = message.text?.body ?? '';
      if (!text) continue;

      this.logger.log(`Mensagem Meta recebida de ${phone}: ${text}`);
      this.messageQueue.enqueue(phone, text, (combinedText) => {
        this.processMessage(phone, combinedText, messageId).catch((err) =>
          this.logger.error(`Erro ao processar mensagem Meta de ${phone}: ${err.message}`),
        );
      });
    }

    return { ok: true };
  }

  private async transcribeAndEnqueueMeta(phone: string, mediaId: string, messageId: string) {
    this.logger.log(`Transcrevendo áudio Meta de ${phone}...`);
    const transcribedText = await this.evolutionService.transcribeAudio(mediaId);
    this.logger.log(`Áudio Meta transcrito de ${phone}: "${transcribedText}"`);

    this.messageQueue.enqueue(phone, transcribedText, (combinedText) => {
      this.processMessage(phone, combinedText, messageId).catch((err) =>
        this.logger.error(`Erro ao processar áudio Meta de ${phone}: ${err.message}`),
      );
    });
  }

  @Get('infinitpay/redirect')
  handleInfinitpayRedirect(@Res() res: Response) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Pagamento confirmado — Zelar</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f0fdf4; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { background: #fff; border-radius: 20px; padding: 40px 32px; max-width: 400px; width: 100%; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .icon { font-size: 56px; margin-bottom: 16px; }
    h1 { font-size: 22px; font-weight: 700; color: #16a34a; margin-bottom: 12px; }
    p { font-size: 15px; color: #4b5563; line-height: 1.6; margin-bottom: 8px; }
    .highlight { font-weight: 600; color: #111827; }
    .whatsapp { display: inline-flex; align-items: center; gap: 8px; margin-top: 28px; background: #25d366; color: #fff; font-weight: 600; font-size: 15px; padding: 14px 28px; border-radius: 999px; text-decoration: none; }
    .whatsapp:hover { background: #1ebe5d; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✅</div>
    <h1>Pagamento confirmado!</h1>
    <p>Obrigada por escolher a <span class="highlight">Zelar</span>.</p>
    <p style="margin-top:12px">Volte para o WhatsApp — em até <span class="highlight">1 minuto</span> você receberá o formulário de matrícula para concluir sua inscrição.</p>
    <a class="whatsapp" href="https://wa.me/5527996972230">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
      Voltar para o WhatsApp
    </a>
  </div>
</body>
</html>`);
  }

  @Post('infinitpay')
  async handleInfinitpayWebhook(@Body() body: any) {
    // Responde imediatamente (InfinitPay exige < 1s) e processa async
    this.processInfinitpayPayment(body).catch(err =>
      this.logger.error(`[InfinitPay] Erro no processamento: ${err.message}`),
    );
    return { success: true, message: null };
  }

  private async processInfinitpayPayment(body: any) {
    const orderNsu: string = body.order_nsu;
    const transactionNsu: string = body.transaction_nsu;
    const slug: string = body.invoice_slug;

    if (!orderNsu) {
      this.logger.warn('[InfinitPay] Webhook sem order_nsu — ignorado');
      return;
    }

    this.logger.log(`[InfinitPay] Webhook recebido — order_nsu=${orderNsu}, capture_method=${body.capture_method}, paid_amount=${body.paid_amount}`);

    // Verifica se o lead existe (order_nsu = lead.id)
    const lead = await this.leadsService.findOne(orderNsu);
    if (!lead) {
      this.logger.warn(`[InfinitPay] Lead não encontrado para order_nsu=${orderNsu}`);
      return;
    }

    if (lead.stage !== 'aguardando_pagamento') {
      this.logger.warn(`[InfinitPay] Lead ${orderNsu} já processado (stage=${lead.stage}) — ignorando`);
      return;
    }

    // Valida o pagamento com InfinitPay (segurança)
    const isPaid = await this.infinitpayService.verifyPayment(orderNsu, transactionNsu, slug);
    if (!isPaid) {
      this.logger.warn(`[InfinitPay] Pagamento não confirmado pelo /payment_check para order_nsu=${orderNsu}`);
      return;
    }

    // Confirma pagamento e reativa IA
    await this.leadsService.updateStage(orderNsu, 'pagamento_confirmado' as any, 'system');
    await this.leadsService.toggleAi(orderNsu, true);
    this.logger.log(`[InfinitPay] ✅ Pagamento confirmado automaticamente para lead ${orderNsu}`);

    const updatedLead = await this.leadsService.findOne(orderNsu);
    if (!updatedLead) return;

    // FLUXO 1 — pagamento confirmado dispara o broadcast pros cuidadores (não envia formulário de curso)
    if (updatedLead.activeFlow === 'fluxo_1') {
      await this.careRequestsService.triggerBroadcastAfterPayment(updatedLead);
      const finalLead = await this.leadsService.findOne(orderNsu);
      this.leadsGateway.emitLeadUpdated(finalLead);
      return;
    }

    // LIA retoma e envia formulário de matrícula
    const instanceConfig = await this.whatsappConfigService.get();
    const confirmationMsg = '[Sistema] Pagamento confirmado automaticamente via InfinitPay. Envie o link do formulário de matrícula (PASSO 5).';

    const aiResponse = await this.aiService.processFlow(
      updatedLead,
      confirmationMsg,
      'fluxo_3',
      this.pickFlowPrompt(instanceConfig, 'fluxo_3'),
    );

    if (aiResponse.success && aiResponse.reply) {
      await this.evolutionService.sendTextMessage(lead.phone, aiResponse.reply);
      const context = this.aiService.buildUpdatedContext(updatedLead, 'fluxo_3', confirmationMsg, aiResponse.rawJson!);
      await this.leadsService.update(orderNsu, { aiContext: context } as any);
    }

    const finalLead = await this.leadsService.findOne(orderNsu);
    this.leadsGateway.emitLeadUpdated(finalLead);
  }

  @Post('manual')
  async sendManual(@Body() body: { phone: string; text: string }) {
    const { lead, conversation } = await this.leadsService.findOrCreate(body.phone);
    this.logger.log(`📤 [MANUAL] Enviando para ${body.phone}: ${body.text.substring(0, 50)}...`);
    await this.evolutionService.sendTextMessage(body.phone, body.text);
    await this.leadsService.saveMessage(conversation.id, 'outbound', 'operator', body.text);
    await this.leadsService.update(lead.id, { lastMessageAt: new Date() });
    const updatedLead = await this.leadsService.findOne(lead.id);
    this.leadsGateway.emitLeadUpdated(updatedLead);
    return { ok: true };
  }

  /**
   * Aplica etiquetas em um contato via uazapi:
   * 1. Busca etiquetas existentes (GET /labels)
   * 2. Cria as que não existem (POST /label/edit)
   * 3. Busca novamente para pegar IDs atualizados
   * 4. Associa cada etiqueta ao contato (POST /chat/labels com add_labelid)
   */
  private readonly STAGE_ORDER: Record<string, number> = {
    novo_lead: 0, em_atendimento: 1, aguardando_pagamento: 2,
    pagamento_confirmado: 3, matriculado: 4, perdido: 2,
  };

  /** Atualiza stage pela IA com proteção completa contra regressão e stages bloqueados. */
  private async safeUpdateStageForAi(leadId: string, currentStage: string, newStage: string): Promise<boolean> {
    if (!newStage || newStage === currentStage) return false;

    if (newStage === 'pagamento_confirmado') {
      this.logger.warn(`[STAGE] Bloqueado pela IA: tentativa de setar pagamento_confirmado — exclusivo do operador/webhook`);
      return false;
    }

    // GUARD PAGAMENTO CONFIRMADO: o lead que já confirmou pagamento só pode ir pra matriculado
    // ou ficar em pagamento_confirmado. Qualquer regressão/lateral é bloqueado.
    // Impede a IA de marcar como perdido/novo_lead enquanto aguarda resposta do formulário.
    if (currentStage === 'pagamento_confirmado') {
      if (newStage !== 'matriculado') {
        this.logger.warn(`[STAGE] Bloqueado pela IA: em pagamento_confirmado, só permite ir pra matriculado (tentou: ${newStage})`);
        return false;
      }
    }

    const currentOrder = this.STAGE_ORDER[currentStage] ?? 0;
    const newOrder = this.STAGE_ORDER[newStage] ?? 0;

    if (newStage === 'matriculado' && currentStage !== 'pagamento_confirmado') {
      this.logger.warn(`[STAGE] Bloqueado pela IA: matriculado requer pagamento_confirmado anterior (atual: ${currentStage})`);
      return false;
    }

    if (newOrder <= currentOrder) {
      this.logger.warn(`[STAGE] Bloqueado pela IA: ${currentStage}(${currentOrder}) → ${newStage}(${newOrder}) é regressão`);
      return false;
    }

    this.logger.log(`[STAGE] ${currentStage}(${currentOrder}) → ${newStage}(${newOrder})`);
    await this.leadsService.updateStage(leadId, newStage as any, 'ai');

    // GUARD BACKEND: ao entrar em aguardando_pagamento, a IA SEMPRE pausa —
    // independente de qual action (PIX, cartão, boleto) disparou a transição.
    // Só o operador (botão) ou o webhook InfinitPay reativam a IA.
    if (newStage === 'aguardando_pagamento') {
      await this.leadsService.toggleAi(leadId, false);
      this.logger.log(`[STAGE] IA pausada — lead ${leadId} aguardando confirmação de pagamento`);
    }
    return true;
  }

  /**
   * Conclui o fluxo de boleto de forma DETERMINÍSTICA (não depende da action da IA):
   * notifica o operador, avisa o cliente, move para aguardando_pagamento e pausa a IA.
   * Chamado assim que o backend tem nome + CPF(11 dígitos) do lead com label 'boleto'.
   */
  private async completeBoleto(lead: any, phone: string, conversationId: string): Promise<void> {
    const onlyDigits = (s?: string | null) => (s ?? '').replace(/\D/g, '');
    const clientName = (lead.name ?? 'Sem nome').trim() || 'Sem nome';
    const clientCpf = onlyDigits(lead.cpf) || 'Não informado';

    // Garante a etiqueta de boleto
    const existingLabels: string[] = lead.labels ?? [];
    if (!existingLabels.includes('boleto')) {
      await this.applyTagsToLead(phone, ['boleto']);
      await this.leadsService.update(lead.id, { labels: [...existingLabels, 'boleto'] } as any);
    }

    // Notifica o operador para emitir o boleto manualmente
    const operadorPhone = '5527996972230';
    const notifyMsg = `🧾 *Boleto solicitado*\n\n👤 Cliente: ${clientName}\n🪪 CPF: ${clientCpf}\n📱 WhatsApp: ${phone}\n\nEmita o boleto e envie diretamente para o cliente.`;
    this.evolutionService.sendTextMessage(operadorPhone, notifyMsg).catch(err =>
      this.logger.error(`[BOLETO] Falha ao notificar operador: ${err.message}`),
    );

    // Avisa o cliente e pausa
    const clientMsg = 'Perfeito! A emissão do boleto é feita pela nossa equipe. Aguarde um momento que já te enviamos por aqui 😊';
    await this.evolutionService.sendTextMessage(phone, clientMsg);
    await this.leadsService.saveMessage(conversationId, 'outbound', 'ai', clientMsg);

    await this.leadsService.updateStage(lead.id, 'aguardando_pagamento' as any, 'system');
    await this.leadsService.toggleAi(lead.id, false);
    this.logger.log(`[BOLETO] Concluído deterministicamente — ${phone} (${clientName}/${clientCpf}) → aguardando_pagamento, IA pausada`);

    const updatedLead = await this.leadsService.findOne(lead.id);
    this.leadsGateway.emitLeadUpdated(updatedLead);
  }

  /**
   * Conclui o Fluxo 1 de forma DETERMINÍSTICA (não depende de o prompt reenviar tudo):
   * envia a confirmação ao cliente, cria a solicitação e dispara o broadcast aos cuidadores.
   * Chamado só quando o backend validou nome + tipo + região + data(DD/MM/AAAA) + turno.
   */
  private async completeCareRequest(
    lead: any,
    phone: string,
    conversationId: string,
    summary: Omit<CareRequestSummary, never>,
    complexity: CareComplexity,
    aiReply?: string,
  ): Promise<void> {
    // Salva o nome no lead se ainda não tiver (não sobrescreve nome existente)
    if (!lead.name && summary.clientName) {
      await this.leadsService.update(lead.id, { name: summary.clientName } as any);
    }

    // Idempotência: se já há uma solicitação em aberto para este lead, não dispara outra
    if (await this.careRequestsService.hasPendingForLead(lead.id)) {
      this.logger.warn(`[CARE] Lead ${phone} já tem solicitação pendente — broadcast ignorado`);
      const dupMsg = 'Já estou localizando um cuidador para você e retorno em breve por aqui 😊';
      await this.evolutionService.sendTextMessage(phone, dupMsg);
      await this.leadsService.saveMessage(conversationId, 'outbound', 'ai', dupMsg);
      return;
    }

    // Mensagem de confirmação ao cliente (usa a da IA se houver, senão um padrão)
    const clientMsg = (aiReply && aiReply.trim())
      ? aiReply.trim()
      : 'Perfeito! Já vou localizar um cuidador disponível para o seu atendimento e retorno em breve por aqui 😊';
    await this.evolutionService.sendTextMessage(phone, clientMsg);
    await this.leadsService.saveMessage(conversationId, 'outbound', 'ai', clientMsg);

    // Avança para em_atendimento (proteção de stage cuida de não regredir)
    await this.safeUpdateStageForAi(lead.id, lead.stage, 'em_atendimento');

    const freshLead = (await this.leadsService.findOne(lead.id)) ?? lead;
    const request = await this.careRequestsService.createAndBroadcast(freshLead, summary as CareRequestSummary, complexity);

    if (request) {
      // Broadcast disparado: pausa a IA enquanto aguarda um cuidador aceitar.
      // A retomada (aviso ao cliente) é feita pelo CareRequestsService ao designar o cuidador.
      await this.leadsService.toggleAi(lead.id, false);
    } else {
      // Nenhum cuidador ativo cadastrado — avisa a operadora para tratar manualmente
      const operatorPhone = (this.configService.get<string>('OPERATOR_PHONES') ?? '5527997885752')
        .split(',')[0].replace(/\D/g, '');
      const opMsg = `⚠️ *Solicitação de cuidador sem cuidadores cadastrados*\n\n👤 ${summary.clientName} (${phone})\n🗓 ${summary.dataAtendimento} — ${summary.turno}\n📍 ${summary.regiao}\n\nCadastre cuidadores no sistema ou trate manualmente.`;
      this.evolutionService.sendTextMessage(operatorPhone, opMsg).catch(err =>
        this.logger.error(`[CARE] Falha ao notificar operadora (sem cuidadores): ${err.message}`));
    }

    this.logger.log(`[CARE] Solicitação criada para ${phone} — complexidade=${complexity}, cuidadores notificados=${request?.notifiedPhones?.length ?? 0}`);

    const updatedLead = await this.leadsService.findOne(lead.id);
    this.leadsGateway.emitLeadUpdated(updatedLead);
  }

  private async applyTagsToLead(phone: string, tags: string[]): Promise<void> {
    const uazapiUrl = this.configService.get('UAZAPI_BASE_URL') || 'https://labsai.uazapi.com';
    const uazapiToken = await this.whatsappConfigService.getActiveToken();

    if (!uazapiToken) {
      this.logger.warn('Token uazapi não encontrado — etiquetas não aplicadas');
      return;
    }

    const headers = {
      token: uazapiToken,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    try {
      this.logger.log(`Aplicando etiquetas ao contato ${phone}: ${tags.join(', ')}`);

      // 1. Busca etiquetas existentes
      const labelsRes = await axios.get(`${uazapiUrl}/labels`, { headers });
      let existingLabels: Array<{ id: string; name: string }> = labelsRes.data || [];
      const existingByName = new Map(existingLabels.map((l) => [l.name.toLowerCase(), l.id]));

      // 2. Cria etiquetas que ainda não existem (cores: 1=verde, 2=amarelo, 3=azul, 4=vermelho, 5=roxo)
      const colorMap: Record<string, number> = {
        inativo: 4,       // vermelho
        desrespeitoso: 4, // vermelho
        emergencia: 4,    // vermelho
        'fora-de-escopo': 3, // azul
        qualificado: 5,   // verde
      };

      for (const tag of tags) {
        if (!existingByName.has(tag.toLowerCase())) {
          this.logger.log(`Criando etiqueta "${tag}"`);
          await axios.post(
            `${uazapiUrl}/label/edit`,
            { labelid: 'new', name: tag, color: colorMap[tag.toLowerCase()] ?? 1, delete: false },
            { headers },
          );
        }
      }

      // 3. Busca novamente para pegar IDs das recém-criadas
      const updatedRes = await axios.get(`${uazapiUrl}/labels`, { headers });
      existingLabels = updatedRes.data || [];
      const updatedByName = new Map(existingLabels.map((l) => [l.name.toLowerCase(), l.id]));

      // 4. Associa cada etiqueta ao contato individualmente
      for (const tag of tags) {
        const labelId = updatedByName.get(tag.toLowerCase());
        if (!labelId) {
          this.logger.warn(`Etiqueta "${tag}" não encontrada após criação`);
          continue;
        }

        await axios.post(
          `${uazapiUrl}/chat/labels`,
          { number: phone, add_labelid: labelId },
          { headers },
        );
        this.logger.log(`Etiqueta "${tag}" (id=${labelId}) aplicada ao contato ${phone}`);
      }
    } catch (err) {
      this.logger.error(`Erro ao aplicar etiquetas para ${phone}: ${err.message}`);
    }
  }

  private parseBrazilianDateTime(isoStr: string): Date {
    const cleaned = isoStr.replace(/(\.\d+)?([Z]|[+-]\d{2}:?\d{2})?$/, '');
    return new Date(`${cleaned}-03:00`);
  }
}
