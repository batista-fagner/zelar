import { Controller, Post, Get, Body, Query, Res, Logger, OnModuleInit } from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { EvolutionService } from './evolution.service';
import { MessageQueueService } from './message-queue.service';
import { WhatsappConfigService } from './whatsapp-config.service';
import { UazapiProvider } from './providers/uazapi.provider';
import { LeadsService } from '../leads/leads.service';
import { AiService } from '../ai/ai.service';
import { LeadsGateway } from '../leads/leads.gateway';
import { CalendarService } from '../calendar/calendar.service';
import { AudioService } from '../audio/audio.service';
import { MediaService } from '../media/media.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { InfinitpayService } from '../infinitpay/infinitpay.service';

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
  ) {}

  onModuleInit() {
    this.leadsService.setFollowupSender((phone, message) =>
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

    if (!phone || (!text && !isAudio)) {
      this.logger.warn(`Webhook ignorado — phone="${phone}", text="${text}", type="${message.type}", mediaType="${message.mediaType}"`);
      return { ok: true };
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

  private async processMessage(phone: string, combinedText: string, messageKeyId: string) {
    const { lead, conversation } = await this.leadsService.findOrCreate(phone);

    await this.leadsService.saveMessage(conversation.id, 'inbound', phone, combinedText, messageKeyId);
    await this.leadsService.update(lead.id, { lastMessageAt: new Date() });

    // Se IA desativada (etiquetado como inativo), apenas salva e notifica frontend — nunca responde
    const aiEnabled = await this.leadsService.getAiEnabled(lead.id);
    if (!aiEnabled) {
      const updatedLead = await this.leadsService.findOne(lead.id);
      this.leadsGateway.emitLeadUpdated(updatedLead);
      return;
    }

    // Lead perdido voltou a falar: reinicia como novo_lead
    if (lead.stage === 'perdido') {
      await this.leadsService.updateStage(lead.id, 'novo_lead', 'system');
      lead.stage = 'novo_lead';
      this.logger.log(`Lead ${phone} era perdido — movido para novo_lead ao retornar`);
    }

    // Mostra "digitando..." enquanto a IA processa
    void this.evolutionService.sendTypingIndicator(phone, 5000);

    // Processa com LIA (Zelar)
    const instanceConfig = await this.whatsappConfigService.get();
    const aiResponse = await this.aiService.processMessageLia(lead, combinedText, instanceConfig?.customPromptLia ?? undefined);
    this.logger.log(`LIA respondeu [stage=${aiResponse.stage}]: ${aiResponse.reply}`);

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
        await this.leadsService.updateStage(lead.id, aiResponse.stage as any, 'ai');
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
      ? this.aiService.buildUpdatedContext(lead, combinedText, aiResponse.rawJson!)
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
    if (aiResponse.stage && aiResponse.stage !== lead.stage) {
      const stageOrder: Record<string, number> = {
        novo_lead: 0, em_atendimento: 1, aguardando_pagamento: 2,
        pagamento_confirmado: 3, matriculado: 4, perdido: 2,
      };
      const currentOrder = stageOrder[lead.stage] ?? 0;
      const newOrder = stageOrder[aiResponse.stage] ?? 0;

      // pagamento_confirmado é EXCLUSIVO do operador (botão CRM) ou webhook InfinitPay.
      // A IA nunca pode setar este stage diretamente, mesmo que o cliente diga que pagou.
      if (aiResponse.stage === 'pagamento_confirmado') {
        this.logger.warn(`[STAGE] Bloqueado pela IA: tentativa de setar pagamento_confirmado — exclusivo do operador/webhook`);
      } else {
        // pagamento_confirmado só pode ser setado pela IA se o lead já passou por aguardando_pagamento
        const requiresPriorStage: Partial<Record<string, string>> = {
          matriculado: 'pagamento_confirmado',
        };
        const requiredPrior = requiresPriorStage[aiResponse.stage];
        const priorSatisfied = !requiredPrior || stageOrder[lead.stage] >= stageOrder[requiredPrior];

        this.logger.log(`[STAGE] ${lead.stage}(${currentOrder}) → ${aiResponse.stage}(${newOrder})`);
        if (newOrder > currentOrder && priorSatisfied) {
          await this.leadsService.updateStage(lead.id, aiResponse.stage as any, 'ai');
        } else {
          this.logger.warn(`[STAGE] Bloqueado pela IA: ${lead.stage} → ${aiResponse.stage} (regressão ou stage anterior obrigatório não atingido)`);
        }
      }
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
        if (aiResponse.stage && aiResponse.stage !== lead.stage) {
          await this.leadsService.updateStage(lead.id, aiResponse.stage as any, 'ai');
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

    // Boleto → notifica operador (action exclusiva)
    if (aiResponse.action === 'aguardar_boleto') {
      this.logger.log(`⏳ [LIA] Boleto — notificando operador para ${phone}`);
      const existingLabels: string[] = lead.labels ?? [];
      if (!existingLabels.includes('boleto')) {
        await this.applyTagsToLead(phone, ['boleto']);
        await this.leadsService.update(lead.id, { labels: [...existingLabels, 'boleto'] } as any);
      }
      const operadorPhone = '5527996972230';
      const clientName = aiResponse.fields?.name || lead.name || 'Sem nome';
      const clientCpf = aiResponse.fields?.cpf || (lead as any).cpf || 'Não informado';
      const notifyMsg = `🧾 *Boleto solicitado*\n\n👤 Cliente: ${clientName}\n🪪 CPF: ${clientCpf}\n📱 WhatsApp: ${phone}\n\nEmita o boleto e envie diretamente para o cliente.`;
      this.evolutionService.sendTextMessage(operadorPhone, notifyMsg).catch(err =>
        this.logger.error(`[BOLETO] Falha ao notificar operador: ${err.message}`),
      );
    }

    // Confirmação de pagamento: cartão → gera link InfinitPay
    if (aiResponse.action === 'aguardar_confirmacao_pagamento' || aiResponse.action === 'send_payment_link') {
      try {
        const paymentUrl = await this.infinitpayService.createPaymentLink(lead.id);
        const msg = `${aiResponse.reply}\n\n${paymentUrl}`;
        await this.evolutionService.sendTextMessage(phone, msg);
        await this.leadsService.saveMessage(conversation.id, 'outbound', 'ai', msg);
        if (aiResponse.stage) await this.leadsService.updateStage(lead.id, aiResponse.stage as any, 'ai');
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

    // LIA retoma e envia formulário de matrícula
    const instanceConfig = await this.whatsappConfigService.get();
    const confirmationMsg = '[Sistema] Pagamento confirmado automaticamente via InfinitPay. Envie o link do formulário de matrícula (PASSO 5).';
    const updatedLead = await this.leadsService.findOne(orderNsu);
    if (!updatedLead) return;

    const aiResponse = await this.aiService.processMessageLia(
      updatedLead,
      confirmationMsg,
      instanceConfig?.customPromptLia ?? undefined,
    );

    if (aiResponse.success && aiResponse.reply) {
      await this.evolutionService.sendTextMessage(lead.phone, aiResponse.reply);
      const context = this.aiService.buildUpdatedContext(updatedLead, confirmationMsg, aiResponse.rawJson!);
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
