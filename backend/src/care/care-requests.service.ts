import { Injectable, Logger, OnApplicationBootstrap, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { CareRequest, CareRequestSummary, CareComplexity } from '../common/entities/care-request.entity';
import { Caregiver } from '../common/entities/caregiver.entity';
import { WhatsappConfig } from '../common/entities/whatsapp-config.entity';
import { Lead } from '../common/entities/lead.entity';
import { LeadsService } from '../leads/leads.service';
import { LeadsGateway } from '../leads/leads.gateway';
import { CalendarService } from '../calendar/calendar.service';
import { CaregiversService } from './caregivers.service';

/** Minutos até uma solicitação sem aceite expirar e o operador ser avisado. */
const ACCEPT_TIMEOUT_MINUTES = 15;

/** Delay entre envios do broadcast (sequencial) — evita padrão de disparo em massa. */
const BROADCAST_DELAY_MS = 2000;

// TODO: substituir pelo link real do formulário cadastral do Fluxo 1 (Google Forms).
const CADASTRO_FORM_URL = 'https://forms.gle/SUBSTITUIR-LINK-FLUXO-1';

const TURNO_LABEL: Record<string, string> = {
  diurno: 'Diurno', noturno: 'Noturno', '24h': '24h',
};

// Hora de início e duração (horas) do evento no Google Calendar por turno
const TURNO_HOURS: Record<string, { start: number; duration: number }> = {
  diurno: { start: 7, duration: 12 },
  noturno: { start: 19, duration: 12 },
  '24h': { start: 7, duration: 24 },
};

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function normalizeText(s: string): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

@Injectable()
export class CareRequestsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CareRequestsService.name);
  private sender: ((phone: string, text: string) => Promise<void>) | null = null;
  private buttonSender: ((phone: string, text: string, choices: string[], footerText?: string) => Promise<void>) | null = null;

  constructor(
    @InjectRepository(CareRequest)
    private readonly requestsRepo: Repository<CareRequest>,
    @InjectRepository(WhatsappConfig)
    private readonly configRepo: Repository<WhatsappConfig>,
    private readonly caregiversService: CaregiversService,
    @Inject(forwardRef(() => LeadsService))
    private readonly leadsService: LeadsService,
    @Inject(forwardRef(() => LeadsGateway))
    private readonly leadsGateway: LeadsGateway,
    private readonly calendarService: CalendarService,
    private readonly config: ConfigService,
  ) {}

  /** Injetado pelo EvolutionController no boot (evita dependência circular com EvolutionModule). */
  setSender(fn: (phone: string, text: string) => Promise<void>) {
    this.sender = fn;
  }

  /** Injetado pelo EvolutionController — envia mensagem com botões (uazapi /send/menu). */
  setButtonSender(fn: (phone: string, text: string, choices: string[], footerText?: string) => Promise<void>) {
    this.buttonSender = fn;
  }

  onApplicationBootstrap() {
    setInterval(() => this.runTimeoutJob().catch(err =>
      this.logger.error(`[CARE] Timeout job falhou: ${err.message}`),
    ), 5 * 60 * 1000);
  }

  private async send(phone: string, text: string): Promise<void> {
    if (!this.sender) {
      this.logger.warn('[CARE] Sender não configurado — mensagem não enviada');
      return;
    }
    await this.sender(phone, text);
  }

  private operatorPhone(): string {
    const phones = (this.config.get<string>('OPERATOR_PHONES') ?? '')
      .split(',').map(p => p.replace(/\D/g, '')).filter(Boolean);
    return phones[0] ?? '5527997885752';
  }

  /** Valor do plano (centavos) conforme complexidade + turno classificados. */
  private async planValueFor(complexity: CareComplexity, turno: string): Promise<{ planValue: number; caregiverValue: number }> {
    const cfg = await this.configRepo.findOne({ where: {} });
    const table: Record<CareComplexity, Record<string, number>> = {
      simples: { diurno: cfg?.planSimplesDiurnoValue ?? 0, noturno: cfg?.planSimplesNoturnoValue ?? 0 },
      medio: { diurno: cfg?.planMedioDiurnoValue ?? 0, noturno: cfg?.planMedioNoturnoValue ?? 0, '24h': cfg?.planMedio24hValue ?? 0 },
      complexo: { diurno: cfg?.planComplexoDiurnoValue ?? 0, noturno: cfg?.planComplexoNoturnoValue ?? 0, '24h': cfg?.planComplexo24hValue ?? 0 },
    };
    const planValue = table[complexity]?.[turno] ?? 0;
    const percent = cfg?.caregiverPercent ?? 55;
    return { planValue, caregiverValue: Math.round(planValue * percent / 100) };
  }

  /**
   * Cancela o atendimento aceito de um lead (Fluxo 1) — acionado pelo operador no Kanban.
   * Muda o status para 'cancelado' (libera o cuidador nas próximas checagens de
   * disponibilidade) e remove o evento de atendimento da agenda. NÃO toca nos eventos
   * de disponibilidade marcados pela Licia.
   */
  async cancelForLead(leadId: string): Promise<CareRequest | null> {
    const request = await this.requestsRepo.findOne({
      where: { leadId, status: 'aceito' },
      order: { createdAt: 'DESC' },
    });
    if (!request) return null;

    request.status = 'cancelado';
    await this.requestsRepo.save(request);

    if (request.calendarEventId) {
      await this.calendarService.cancelAppointment(request.calendarEventId).catch(err =>
        this.logger.error(`[CARE] Falha ao remover evento do Calendar ao cancelar: ${err.message}`));
    }

    // Remove a etiqueta de cuidador designado do lead
    try {
      const lead = await this.leadsService.findOne(leadId);
      if (lead) {
        const labels = (lead.labels ?? []).filter(l => l !== 'cuidador_designado');
        await this.leadsService.update(lead.id, { labels } as any);
        const updated = await this.leadsService.findOne(lead.id);
        this.leadsGateway.emitLeadUpdated(updated);
      }
    } catch (err) {
      this.logger.error(`[CARE] Falha ao remover etiqueta ao cancelar: ${err.message}`);
    }

    this.logger.log(`[CARE] Atendimento ${request.id} cancelado (lead ${leadId})`);
    return request;
  }

  /** Já existe solicitação em aberto para este lead? (evita broadcast duplicado) */
  async hasPendingForLead(leadId: string): Promise<boolean> {
    const pending = await this.requestsRepo.findOne({
      where: { leadId, status: 'aguardando_aceite' },
    });
    return !!pending;
  }

  /**
   * Chamado após o pagamento ser confirmado (manual/PIX ou automático/InfinitPay) para
   * leads do Fluxo 1. Lê os dados do atendimento salvos em lead.aiContext.careSummaryPending
   * (guardados no momento em que a LIA pediu a forma de pagamento) e dispara o broadcast.
   * Idempotente: se já houver uma solicitação pendente para o lead, não duplica.
   */
  async triggerBroadcastAfterPayment(lead: Lead): Promise<void> {
    if (lead.activeFlow !== 'fluxo_1') return;

    const leadPhoneDigits = lead.phone.replace(/\D/g, '');

    if (await this.hasPendingForLead(lead.id)) {
      this.logger.warn(`[CARE] Broadcast já em andamento para lead ${lead.id} — ignorando`);
      return;
    }

    const pending = (lead.aiContext as any)?.careSummaryPending;
    const complexityRaw = normalizeText(pending?.complexidade ?? '');
    const complexity: CareComplexity = (['simples', 'medio', 'complexo'].includes(complexityRaw)
      ? complexityRaw : 'medio') as CareComplexity;
    const turnoValid = ['diurno', 'noturno', '24h'].includes(pending?.turno);

    if (!pending?.clientName || !pending?.tipoCuidado || !pending?.regiao || !pending?.dataAtendimento || !turnoValid) {
      this.logger.warn(`[CARE] Pagamento confirmado para lead ${lead.id} mas dados do atendimento incompletos — broadcast abortado`);
      await this.send(this.operatorPhone(),
        `⚠️ Pagamento confirmado para ${lead.name ?? leadPhoneDigits} mas faltam dados do atendimento — verifique manualmente.`
      ).catch(() => {});
      return;
    }

    const searchingMsg = 'Recebi a confirmação do pagamento 💙 Agora vou verificar os cuidadores disponíveis para o seu atendimento.';
    await this.send(leadPhoneDigits, searchingMsg).catch(err =>
      this.logger.error(`[CARE] Falha ao avisar cliente sobre busca de cuidador: ${err.message}`));
    try {
      const { conversation } = await this.leadsService.findOrCreate(lead.phone);
      await this.leadsService.saveMessage(conversation.id, 'outbound', 'system', searchingMsg);
    } catch (err) {
      this.logger.error(`[CARE] Falha ao salvar mensagem de busca: ${err.message}`);
    }

    const summary: CareRequestSummary = {
      clientName: pending.clientName,
      tipoCuidado: pending.tipoCuidado,
      regiao: pending.regiao,
      dataAtendimento: pending.dataAtendimento,
      turno: pending.turno,
    };

    const request = await this.createAndBroadcast(lead, summary, complexity);
    if (!request) {
      await this.send(this.operatorPhone(),
        `⚠️ Pagamento confirmado para ${summary.clientName} mas nenhum cuidador ativo cadastrado — atender manualmente.`
      ).catch(() => {});
    }
  }

  /**
   * Cria a solicitação e dispara o broadcast SEQUENCIAL para todos os cuidadores ativos.
   * Retorna null se não houver cuidadores ativos cadastrados.
   */
  async createAndBroadcast(lead: Lead, summary: CareRequestSummary, complexity: CareComplexity): Promise<CareRequest | null> {
    const caregivers = await this.caregiversService.findAllActive();
    if (caregivers.length === 0) {
      this.logger.warn('[CARE] Nenhum cuidador ativo cadastrado — broadcast abortado');
      return null;
    }

    const { planValue, caregiverValue } = await this.planValueFor(complexity, summary.turno);

    const request = await this.requestsRepo.save(this.requestsRepo.create({
      leadId: lead.id,
      leadPhone: lead.phone.replace(/\D/g, ''),
      summary,
      complexity,
      planValue,
      caregiverValue,
      status: 'aguardando_aceite',
      notifiedPhones: caregivers.map(c => c.phone),
      notifiedAt: new Date(),
    }));

    const complexityLabel = complexity.charAt(0).toUpperCase() + complexity.slice(1);
    const valueLine = caregiverValue > 0 ? `\n💰 Valor a receber: ${formatBRL(caregiverValue)}` : '';
    const msg = `🩺 *Nova solicitação de atendimento — Zelar*\n\n` +
      `👤 Cliente: ${summary.clientName}\n` +
      `🩹 Tipo de cuidado: ${summary.tipoCuidado}\n` +
      `📍 Região: ${summary.regiao}\n` +
      `🗓 Data: ${summary.dataAtendimento}\n` +
      `⏰ Turno: ${TURNO_LABEL[summary.turno] ?? summary.turno}\n` +
      `📊 Complexidade: ${complexityLabel}${valueLine}\n\n` +
      `O primeiro que aceitar fica com o atendimento.`;

    // Broadcast sequencial com delay entre envios — botões "Aceito"/"Recusar" (fallback: texto livre)
    for (let i = 0; i < caregivers.length; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, BROADCAST_DELAY_MS));
      try {
        if (this.buttonSender) {
          await this.buttonSender(caregivers[i].phone, msg, ['✅ Aceito|aceito', '❌ Recusar|recusar']);
        } else {
          await this.send(caregivers[i].phone, `${msg}\n\nPara aceitar, responda *ACEITO*.`);
        }
        this.logger.log(`[CARE] Broadcast ${i + 1}/${caregivers.length} → ${caregivers[i].name} (${caregivers[i].phone})`);
      } catch (err) {
        this.logger.error(`[CARE] Falha no broadcast para ${caregivers[i].phone}: ${err.message}`);
      }
    }

    return request;
  }

  /**
   * Processa resposta de um cuidador (mensagem interceptada no webhook).
   * Claim atômico: UPDATE condicionado a status='aguardando_aceite' — o primeiro vence.
   */
  async handleCaregiverReply(caregiver: Caregiver, text: string): Promise<void> {
    const normalized = normalizeText(text);
    const caregiverPhone = caregiver.phone.replace(/\D/g, '');

    // Solicitação pendente mais antiga em que este cuidador foi notificado
    const pendings = await this.requestsRepo.find({
      where: { status: 'aguardando_aceite' },
      order: { createdAt: 'ASC' },
    });
    const request = pendings.find(r => (r.notifiedPhones ?? []).includes(caregiverPhone));

    if (!request) {
      this.logger.debug(`[CARE] Mensagem de cuidador ${caregiver.name} sem solicitação pendente — ignorada`);
      return;
    }

    const accepted = /\baceito\b|\baceita\b|\baceitar\b/.test(normalized);
    const declined = /\bnao\b|\brecuso\b|\brecusar\b/.test(normalized) && !accepted;

    if (declined) {
      await this.send(caregiverPhone, 'Tudo bem, obrigada por avisar 😊');
      return;
    }

    if (!accepted) {
      this.logger.debug(`[CARE] Resposta de ${caregiver.name} não reconhecida como aceite: "${text.substring(0, 40)}"`);
      return;
    }

    // CLAIM ATÔMICO — primeiro que aceitar ganha; concorrentes recebem affected=0
    const result = await this.requestsRepo.createQueryBuilder()
      .update()
      .set({ status: 'aceito', assignedCaregiverId: caregiver.id, acceptedAt: new Date() })
      .where('id = :id AND status = :status', { id: request.id, status: 'aguardando_aceite' })
      .execute();

    if (!result.affected) {
      await this.send(caregiverPhone, 'Esse atendimento já foi preenchido por outro cuidador. Obrigada pela disponibilidade! 😊');
      return;
    }

    this.logger.log(`[CARE] ✅ ${caregiver.name} aceitou a solicitação ${request.id}`);
    await this.completeAssignment(request, caregiver);
  }

  /** Pós-aceite: confirma ao cuidador, avisa o cliente, notifica os demais e registra no Calendar. */
  private async completeAssignment(request: CareRequest, caregiver: Caregiver): Promise<void> {
    const s = request.summary;
    const caregiverPhone = caregiver.phone.replace(/\D/g, '');

    // 1. Confirma ao cuidador com o contato do cliente
    const caregiverMsg = `Ótimo, o atendimento é seu! 🎉\n\n` +
      `👤 Cliente: ${s.clientName}\n📱 WhatsApp: ${request.leadPhone}\n` +
      `🗓 ${s.dataAtendimento} — ${TURNO_LABEL[s.turno] ?? s.turno}\n📍 ${s.regiao}\n\n` +
      `Entre em contato com o cliente para combinar os detalhes.`;
    await this.send(caregiverPhone, caregiverMsg).catch(err =>
      this.logger.error(`[CARE] Falha ao confirmar ao cuidador: ${err.message}`));

    // 2. Avisa o cliente no chat da LIA + envia o formulário cadastral
    const clientMsg = `Boa notícia! 🎉 Encontramos um cuidador para o seu atendimento.\n\n` +
      `🩺 ${caregiver.name}\n📱 Contato: ${caregiverPhone}\n\n` +
      `Você também pode aguardar que ele(a) vai entrar em contato com você para combinar os detalhes 😊`;
    const formMsg = `Pra finalizar, preciso que você preencha nossa ficha cadastral:\n📋 ${CADASTRO_FORM_URL}\n\nAssim que concluir, me avisa por aqui 😊`;
    try {
      await this.send(request.leadPhone, clientMsg);
      const { conversation } = await this.leadsService.findOrCreate(request.leadPhone);
      await this.leadsService.saveMessage(conversation.id, 'outbound', 'system', clientMsg);
      await new Promise(r => setTimeout(r, 1200));
      await this.send(request.leadPhone, formMsg);
      await this.leadsService.saveMessage(conversation.id, 'outbound', 'system', formMsg);
      // Reativa a IA para que o cliente possa avisar quando preencher o formulário
      await this.leadsService.toggleAi(request.leadId, true);
    } catch (err) {
      this.logger.error(`[CARE] Falha ao avisar o cliente ${request.leadPhone}: ${err.message}`);
    }

    // 3. Notifica os demais cuidadores que a vaga foi preenchida (sequencial)
    const others = (request.notifiedPhones ?? []).filter(p => p !== caregiverPhone);
    for (const phone of others) {
      await new Promise(r => setTimeout(r, BROADCAST_DELAY_MS));
      await this.send(phone, 'O atendimento divulgado há pouco já foi preenchido. Obrigada! 😊').catch(err =>
        this.logger.error(`[CARE] Falha ao avisar ${phone}: ${err.message}`));
    }

    // 4. Etiqueta o lead como atendido por cuidador
    try {
      const lead = await this.leadsService.findOne(request.leadId);
      if (lead) {
        const labels = Array.from(new Set([...(lead.labels ?? []), 'cuidador_designado']));
        await this.leadsService.update(lead.id, { labels } as any);
        const updated = await this.leadsService.findOne(lead.id);
        this.leadsGateway.emitLeadUpdated(updated);
      }
    } catch (err) {
      this.logger.error(`[CARE] Falha ao etiquetar lead: ${err.message}`);
    }

    // 5. Registra a atividade no Google Calendar (opcional — degrada graciosamente)
    try {
      const start = this.parseStartDate(s.dataAtendimento, s.turno);
      if (start) {
        const duration = TURNO_HOURS[s.turno]?.duration ?? 4;
        const event = await this.calendarService.createCareEvent({
          caregiverName: caregiver.name,
          caregiverPhone,
          clientName: s.clientName,
          clientPhone: request.leadPhone,
          tipoCuidado: s.tipoCuidado,
          regiao: s.regiao,
          start,
          durationHours: duration,
        });
        if (event) {
          await this.requestsRepo.update(request.id, { calendarEventId: event.id });
        }
      } else {
        this.logger.warn(`[CARE] Data "${s.dataAtendimento}" não parseável — evento no Calendar não criado`);
      }
    } catch (err) {
      this.logger.error(`[CARE] Falha ao criar evento no Calendar: ${err.message}`);
    }

    // 6. Notifica a operadora do resultado
    const opMsg = `✅ *Atendimento designado*\n\n🩺 Cuidador(a): ${caregiver.name} (${caregiverPhone})\n` +
      `👤 Cliente: ${s.clientName} (${request.leadPhone})\n🗓 ${s.dataAtendimento} — ${TURNO_LABEL[s.turno] ?? s.turno}\n📍 ${s.regiao}`;
    await this.send(this.operatorPhone(), opMsg).catch(err =>
      this.logger.error(`[CARE] Falha ao notificar operadora: ${err.message}`));
  }

  /** DD/MM/AAAA + turno → Date de início no fuso de São Paulo. Null se inválida. */
  private parseStartDate(dataAtendimento: string, turno: string): Date | null {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((dataAtendimento ?? '').trim());
    if (!m) return null;
    const [, dd, mm, yyyy] = m;
    const startHour = TURNO_HOURS[turno]?.start ?? 8;
    const date = new Date(`${yyyy}-${mm}-${dd}T${String(startHour).padStart(2, '0')}:00:00-03:00`);
    return isNaN(date.getTime()) ? null : date;
  }

  /** Expira solicitações sem aceite após o timeout e avisa operadora + cliente. */
  private async runTimeoutJob(): Promise<void> {
    const cutoff = new Date(Date.now() - ACCEPT_TIMEOUT_MINUTES * 60 * 1000);
    const expired = await this.requestsRepo.find({
      where: { status: 'aguardando_aceite', notifiedAt: LessThan(cutoff) },
    });

    for (const request of expired) {
      // Claim atômico também aqui — se um aceite chegar em paralelo, ele vence
      const result = await this.requestsRepo.createQueryBuilder()
        .update()
        .set({ status: 'expirado' })
        .where('id = :id AND status = :status', { id: request.id, status: 'aguardando_aceite' })
        .execute();
      if (!result.affected) continue;

      const s = request.summary;
      this.logger.warn(`[CARE] Solicitação ${request.id} expirou sem aceite (${ACCEPT_TIMEOUT_MINUTES}min)`);

      const opMsg = `⚠️ *Nenhum cuidador aceitou em ${ACCEPT_TIMEOUT_MINUTES} min*\n\n` +
        `👤 Cliente: ${s.clientName} (${request.leadPhone})\n🗓 ${s.dataAtendimento} — ${TURNO_LABEL[s.turno] ?? s.turno}\n` +
        `📍 ${s.regiao}\n\nEntre em contato com o cliente para resolver manualmente.`;
      await this.send(this.operatorPhone(), opMsg).catch(err =>
        this.logger.error(`[CARE] Falha ao notificar operadora (timeout): ${err.message}`));

      const clientMsg = 'Nossa equipe está finalizando a busca pelo cuidador ideal para você e já te retorna por aqui 😊';
      await this.send(request.leadPhone, clientMsg).catch(err =>
        this.logger.error(`[CARE] Falha ao avisar cliente (timeout): ${err.message}`));
    }
  }
}
