import { Injectable, Logger, OnApplicationBootstrap, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { CareRequest, CareRequestSummary, CareComplexity, CareBroadcastEntry } from '../common/entities/care-request.entity';
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

const CADASTRO_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSc0qktonC3kij2cDiJTIo2bcyd7z6s2FgCGE8dTtMwZKIxoNg/viewform?usp=preview';

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

/** Resumo do paciente (ramo domiciliar) pro cuidador saber o que vai encontrar antes de aceitar. */
function buildPatientSummaryLine(s: CareRequestSummary): string {
  const parts: string[] = [];
  if (s.idade) parts.push(`Idade: ${s.idade}`);
  if (s.locomocao) parts.push(`Locomoção: ${s.locomocao}`);
  if (s.banho) parts.push(`Banho: ${s.banho}`);
  if (s.medicacao) parts.push(`Medicação: ${s.medicacao}`);
  if (s.diagnostico) parts.push(`Diagnóstico: ${s.diagnostico}`);
  return parts.length > 0 ? `\n🧑‍⚕️ Resumo do paciente:\n${parts.map(p => `• ${p}`).join('\n')}\n` : '';
}

function normalizeText(s: string): string {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

/** DD/MM/AAAA e anterior a data de hoje em America/Sao Paulo? Formato invalido - false (nao bloqueia). */
function isPastDate(ddmmyyyy: string): boolean {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((ddmmyyyy ?? '').trim());
  if (!m) return false;
  const [, dd, mm, yyyy] = m;
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  return `${yyyy}-${mm}-${dd}` < todayStr;
}

@Injectable()
export class CareRequestsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CareRequestsService.name);
  private sender: ((phone: string, text: string) => Promise<void>) | null = null;
  private buttonSender: ((phone: string, text: string, choices: string[], footerText?: string) => Promise<string | null>) | null = null;
  private statusChecker: ((messageid: string) => Promise<string | null>) | null = null;

  /** Status brutos da uazapi que consideramos "entregue" no log visual. */
  private static readonly DELIVERED_STATUSES = new Set(['DELIVERY_ACK', 'READ', 'PLAYED']);
  private static readonly FAILED_STATUSES = new Set(['ERROR', 'FAILED']);

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
  setButtonSender(fn: (phone: string, text: string, choices: string[], footerText?: string) => Promise<string | null>) {
    this.buttonSender = fn;
  }

  /** Injetado pelo EvolutionController — reconsulta status de entrega de uma mensagem. */
  setStatusChecker(fn: (messageid: string) => Promise<string | null>) {
    this.statusChecker = fn;
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

  /**
   * Adiciona/remove etiquetas do lead e emite a atualização via WebSocket. Usado para
   * refletir o status do broadcast no card do Kanban (buscando_cuidador, broadcast_expirado,
   * cuidador_designado) sem custo extra de rede no frontend (as labels já vêm com o lead).
   */
  private async updateLeadLabels(leadId: string, add: string[], remove: string[]): Promise<void> {
    try {
      const lead = await this.leadsService.findOne(leadId);
      if (!lead) return;
      const labels = new Set(lead.labels ?? []);
      remove.forEach(l => labels.delete(l));
      add.forEach(l => labels.add(l));
      await this.leadsService.update(lead.id, { labels: Array.from(labels) } as any);
      const updated = await this.leadsService.findOne(lead.id);
      this.leadsGateway.emitLeadUpdated(updated);
    } catch (err) {
      this.logger.error(`[CARE] Falha ao atualizar etiquetas do lead ${leadId}: ${err.message}`);
    }
  }

  /**
   * Valor do plano (centavos) conforme tipo de cuidado. Hospitalar tem tabela própria
   * (só diurno/noturno, sem complexidade nem 24h) — não usa a tabela de "médio" domiciliar.
   */
  private async planValueFor(complexity: CareComplexity, turno: string, tipoCuidado?: string): Promise<{ planValue: number; caregiverValue: number }> {
    const cfg = await this.configRepo.findOne({ where: {} });

    let planValue: number;
    if (normalizeText(tipoCuidado ?? '') === 'hospitalar') {
      const hospitalarTable: Record<string, number> = {
        diurno: cfg?.planHospitalarDiurnoValue ?? 0,
        noturno: cfg?.planHospitalarNoturnoValue ?? 0,
      };
      planValue = hospitalarTable[turno] ?? 0;
    } else {
      const table: Record<CareComplexity, Record<string, number>> = {
        simples: { diurno: cfg?.planSimplesDiurnoValue ?? 0, noturno: cfg?.planSimplesNoturnoValue ?? 0 },
        medio: { diurno: cfg?.planMedioDiurnoValue ?? 0, noturno: cfg?.planMedioNoturnoValue ?? 0, '24h': cfg?.planMedio24hValue ?? 0 },
        complexo: { diurno: cfg?.planComplexoDiurnoValue ?? 0, noturno: cfg?.planComplexoNoturnoValue ?? 0, '24h': cfg?.planComplexo24hValue ?? 0 },
      };
      planValue = table[complexity]?.[turno] ?? 0;
    }

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

    // Avisa o cuidador designado — sem isso ele continua achando que o atendimento é dele
    if (request.assignedCaregiverId) {
      const caregiver = await this.caregiversService.findOne(request.assignedCaregiverId);
      if (caregiver) {
        const s = request.summary;
        const msg = `O atendimento de ${s.clientName} em ${s.dataAtendimento} foi cancelado pela Zelar. Obrigada!`;
        await this.send(caregiver.phone, msg).catch(err =>
          this.logger.error(`[CARE] Falha ao avisar cuidador do cancelamento: ${err.message}`));
      }
    }

    await this.updateLeadLabels(leadId, [], ['cuidador_designado', 'buscando_cuidador', 'broadcast_expirado']);

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
    const dataIsPast = isPastDate(pending?.dataAtendimento ?? '');

    if (!pending?.clientName || !pending?.tipoCuidado || !pending?.regiao || !pending?.dataAtendimento || !turnoValid || dataIsPast) {
      const motivo = dataIsPast ? ' (data do atendimento já passou)' : '';
      this.logger.warn(`[CARE] Pagamento confirmado para lead ${lead.id} mas dados do atendimento incompletos${motivo} — broadcast abortado`);
      await this.send(this.operatorPhone(),
        `⚠️ Pagamento confirmado para ${lead.name ?? leadPhoneDigits} mas faltam dados do atendimento${motivo} — verifique manualmente.`
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
      idade: pending.idade ?? null,
      locomocao: pending.locomocao ?? null,
      banho: pending.banho ?? null,
      medicacao: pending.medicacao ?? null,
      diagnostico: pending.diagnostico ?? null,
    };

    const request = await this.createAndBroadcast(lead, summary, complexity);
    if (!request) {
      await this.send(this.operatorPhone(),
        `⚠️ Pagamento confirmado para ${summary.clientName} mas nenhum cuidador ativo cadastrado — atender manualmente.`
      ).catch(() => {});
      return;
    }

    // Limpa os dados acumulados agora que já estão gravados em CareRequest.summary — evita
    // misturar com uma eventual 2ª solicitação futura do mesmo lead.
    try {
      const freshLead = await this.leadsService.findOne(lead.id);
      const ctx = { ...((freshLead?.aiContext as any) ?? {}) };
      delete ctx.careSummaryPending;
      await this.leadsService.update(lead.id, { aiContext: ctx } as any);
    } catch (err) {
      this.logger.error(`[CARE] Falha ao limpar careSummaryPending: ${err.message}`);
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

    const { planValue, caregiverValue } = await this.planValueFor(complexity, summary.turno, summary.tipoCuidado);

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
    const patientSummary = buildPatientSummaryLine(summary);
    const msg = `🩺 *Nova solicitação de atendimento — Zelar*\n\n` +
      `👤 Cliente: ${summary.clientName}\n` +
      `🩹 Tipo de cuidado: ${summary.tipoCuidado}\n` +
      `📍 Região: ${summary.regiao}\n` +
      `🗓 Data: ${summary.dataAtendimento}\n` +
      `⏰ Turno: ${TURNO_LABEL[summary.turno] ?? summary.turno}\n` +
      `📊 Complexidade: ${complexityLabel}${valueLine}\n${patientSummary}\n` +
      `O primeiro que aceitar fica com o atendimento.`;

    // Broadcast sequencial com delay entre envios — botões "Aceito"/"Recusar" (fallback: texto livre)
    const broadcastLog: CareBroadcastEntry[] = [];
    for (let i = 0; i < caregivers.length; i++) {
      if (i > 0) await new Promise(r => setTimeout(r, BROADCAST_DELAY_MS));
      const sentAt = new Date().toISOString();
      let messageId: string | null = null;
      try {
        if (this.buttonSender) {
          messageId = await this.buttonSender(caregivers[i].phone, msg, ['✅ Aceito|aceito', '❌ Recusar|recusar']);
        } else {
          await this.send(caregivers[i].phone, `${msg}\n\nPara aceitar, responda *ACEITO*.`);
        }
        this.logger.log(`[CARE] Broadcast ${i + 1}/${caregivers.length} → ${caregivers[i].name} (${caregivers[i].phone})`);
        broadcastLog.push({ phone: caregivers[i].phone, name: caregivers[i].name, status: 'enviado', messageId, sentAt });
      } catch (err) {
        this.logger.error(`[CARE] Falha no broadcast para ${caregivers[i].phone}: ${err.message}`);
        broadcastLog.push({ phone: caregivers[i].phone, name: caregivers[i].name, status: 'falhou', messageId: null, sentAt });
      }
    }

    request.broadcastLog = broadcastLog;
    await this.requestsRepo.save(request);
    this.scheduleDeliveryChecks(request.id, broadcastLog);
    await this.updateLeadLabels(lead.id, ['buscando_cuidador'], ['broadcast_expirado']);

    return request;
  }

  /** 20s após o broadcast, reconsulta o status de cada mensagem e atualiza o log visual. */
  private scheduleDeliveryChecks(requestId: string, entries: CareBroadcastEntry[]) {
    if (!this.statusChecker) return;
    for (const entry of entries) {
      if (!entry.messageId) continue;
      setTimeout(async () => {
        try {
          const rawStatus = await this.statusChecker!(entry.messageId!);
          if (!rawStatus) return;
          const status: CareBroadcastEntry['status'] = CareRequestsService.FAILED_STATUSES.has(rawStatus)
            ? 'falhou'
            : CareRequestsService.DELIVERED_STATUSES.has(rawStatus) ? 'entregue' : 'enviado';

          const fresh = await this.requestsRepo.findOne({ where: { id: requestId } });
          if (!fresh) return;
          const updatedLog = (fresh.broadcastLog ?? []).map(e =>
            e.messageId === entry.messageId ? { ...e, status, deliveredAt: status === 'entregue' ? new Date().toISOString() : e.deliveredAt } : e,
          );
          await this.requestsRepo.update(requestId, { broadcastLog: updatedLog });
        } catch (err) {
          this.logger.warn(`[CARE] Falha ao atualizar log de entrega (${entry.phone}): ${err.message}`);
        }
      }, 20000);
    }
  }

  /** Última solicitação (qualquer status) criada para o lead — usada pro log visual no Kanban. */
  async getLatestForLead(leadId: string): Promise<CareRequest | null> {
    return this.requestsRepo.findOne({ where: { leadId }, order: { createdAt: 'DESC' } });
  }

  /**
   * Reconsulta ao vivo o status das entradas do broadcast ainda em "enviado" — cobre o caso
   * em que o `setTimeout` de 20s do scheduleDeliveryChecks se perde num restart do Railway
   * (o status ficaria travado em "Enviado" para sempre). Chamado ao abrir o modal no Kanban.
   */
  async refreshPendingDeliveryStatuses(request: CareRequest): Promise<CareRequest> {
    if (!this.statusChecker) return request;
    const log = request.broadcastLog ?? [];
    const hasPending = log.some(e => e.status === 'enviado' && e.messageId);
    if (!hasPending) return request;

    let changed = false;
    const updatedLog = await Promise.all(log.map(async (entry) => {
      if (entry.status !== 'enviado' || !entry.messageId) return entry;
      try {
        const rawStatus = await this.statusChecker!(entry.messageId);
        if (!rawStatus) return entry;
        const status: CareBroadcastEntry['status'] = CareRequestsService.FAILED_STATUSES.has(rawStatus)
          ? 'falhou'
          : CareRequestsService.DELIVERED_STATUSES.has(rawStatus) ? 'entregue' : 'enviado';
        if (status === entry.status) return entry;
        changed = true;
        return { ...entry, status, deliveredAt: status === 'entregue' ? new Date().toISOString() : entry.deliveredAt };
      } catch (err) {
        this.logger.warn(`[CARE] Falha ao reconsultar entrega (${entry.phone}): ${err.message}`);
        return entry;
      }
    }));

    if (changed) {
      await this.requestsRepo.update(request.id, { broadcastLog: updatedLog });
      request.broadcastLog = updatedLog;
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
      `🗓 ${s.dataAtendimento} — ${TURNO_LABEL[s.turno] ?? s.turno}\n📍 ${s.regiao}\n` +
      `${buildPatientSummaryLine(s)}\n` +
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
    await this.updateLeadLabels(request.leadId, ['cuidador_designado'], ['buscando_cuidador', 'broadcast_expirado']);

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

      await this.updateLeadLabels(request.leadId, ['broadcast_expirado'], ['buscando_cuidador']);
    }
  }

  /**
   * Redispara o broadcast reusando o summary/complexidade de uma solicitação expirada ou
   * cancelada — evita a gambiarra de cancelar + reconfirmar pagamento para tentar de novo.
   * Retorna null se já houver uma solicitação em andamento (idempotência).
   */
  async rebroadcast(leadId: string): Promise<CareRequest | null> {
    const last = await this.getLatestForLead(leadId);
    if (!last || !['expirado', 'cancelado'].includes(last.status)) {
      throw new Error('Só é possível reenviar quando a última solicitação expirou ou foi cancelada');
    }
    if (await this.hasPendingForLead(leadId)) return null;

    const lead = await this.leadsService.findOne(leadId);
    if (!lead) throw new Error('Lead não encontrado');

    return this.createAndBroadcast(lead, last.summary, last.complexity);
  }
}
