import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, IsNull, Repository } from 'typeorm';
import { Lead, LeadStage } from '../common/entities/lead.entity';
import { Conversation } from '../common/entities/conversation.entity';
import { Message } from '../common/entities/message.entity';
import { LeadStageHistory } from '../common/entities/lead-stage-history.entity';
import { DeletedLead } from '../common/entities/deleted-lead.entity';
import { Appointment } from '../common/entities/appointment.entity';
import { WhatsappConfig } from '../common/entities/whatsapp-config.entity';

@Injectable()
export class LeadsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LeadsService.name);
  private followupSender: ((phone: string, message: string) => Promise<void>) | null = null;

  setFollowupSender(fn: (phone: string, message: string) => Promise<void>) {
    this.followupSender = fn;
  }

  constructor(
    @InjectRepository(Lead)
    private leadsRepo: Repository<Lead>,
    @InjectRepository(Conversation)
    private conversationsRepo: Repository<Conversation>,
    @InjectRepository(Message)
    private messagesRepo: Repository<Message>,
    @InjectRepository(LeadStageHistory)
    private historyRepo: Repository<LeadStageHistory>,
    @InjectRepository(DeletedLead)
    private deletedLeadsRepo: Repository<DeletedLead>,
    @InjectRepository(Appointment)
    private appointmentsRepo: Repository<Appointment>,
    @InjectRepository(WhatsappConfig)
    private whatsappConfigRepo: Repository<WhatsappConfig>,
  ) {}

  async onApplicationBootstrap() {
    setInterval(() => this.runFollowupJob(), 5 * 60 * 1000);

    await this.leadsRepo.query(`
      UPDATE leads l
      SET last_message_direction = (
        SELECT m.direction
        FROM messages m
        INNER JOIN conversations c ON c.id = m.conversation_id
        WHERE c.lead_id = l.id
        ORDER BY m.created_at DESC
        LIMIT 1
      )
      WHERE l.last_message_direction IS NULL
    `);
  }

  async findOrCreate(phone: string): Promise<{ lead: Lead; conversation: Conversation; isNew: boolean }> {
    // Upsert para evitar race condition em webhooks duplicados
    const upsertResult = await this.leadsRepo.upsert(
      { phone, stage: 'novo_lead' },
      { conflictPaths: ['phone'] },
    );

    let isNew = false;
    let lead = await this.leadsRepo.findOne({ where: { phone } });

    // Se foi inserido (não existia antes), cria histórico
    if (upsertResult.identifiers.length > 0 && !isNew) {
      const recentHistory = await this.historyRepo.findOne({
        where: { leadId: lead!.id },
        order: { createdAt: 'DESC' },
      });
      if (!recentHistory) {
        isNew = true;
        await this.historyRepo.save({
          leadId: lead!.id,
          fromStage: null,
          toStage: 'novo_lead',
          changedBy: 'system',
        });
      }
    }

    // Upsert conversation também para evitar race condition
    await this.conversationsRepo.upsert(
      { leadId: lead!.id, aiEnabled: true },
      { conflictPaths: ['leadId'] },
    );
    const conversation = await this.conversationsRepo.findOne({ where: { leadId: lead!.id } });

    return { lead: lead!, conversation: conversation!, isNew };
  }

  async saveMessage(
    conversationId: string,
    direction: 'inbound' | 'outbound',
    sender: string,
    content: string,
    evolutionId?: string,
  ): Promise<Message> {
    const msg = this.messagesRepo.create({
      conversationId,
      direction,
      sender,
      content,
      evolutionId,
    });
    const saved = await this.messagesRepo.save(msg);

    await this.leadsRepo.createQueryBuilder()
      .update()
      .set({ lastMessageAt: new Date(), lastMessageDirection: direction })
      .where('id = (SELECT lead_id FROM conversations WHERE id = :cId)', { cId: conversationId })
      .execute();

    return saved;
  }

  async updateStage(leadId: string, toStage: LeadStage, changedBy: string): Promise<Lead> {
    const lead = await this.leadsRepo.findOneOrFail({ where: { id: leadId } });
    const fromStage = lead.stage;

    lead.stage = toStage;
    await this.leadsRepo.save(lead);

    await this.historyRepo.save({ leadId, fromStage, toStage, changedBy });

    return lead;
  }

  async update(leadId: string, data: Partial<Lead>): Promise<Lead> {
    await this.leadsRepo.update(leadId, data);
    return this.leadsRepo.findOneOrFail({ where: { id: leadId } });
  }

  async findAll(): Promise<Lead[]> {
    return this.leadsRepo.find({ order: { lastMessageAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Lead | null> {
    return this.leadsRepo.findOne({ where: { id } });
  }

  async findByPhones(phones: string[]): Promise<Map<string, string>> {
    if (!phones.length) return new Map();
    // Compara só dígitos — o phone no banco pode ter +, espaços, traços
    // regexp_replace remove tudo que não é dígito para comparar
    const leads = await this.leadsRepo.createQueryBuilder('lead')
      .select(['lead.phone', 'lead.name'])
      .where(
        `regexp_replace(lead.phone, '\\D', '', 'g') IN (:...phones)
         OR regexp_replace(lead.phone, '\\D', '', 'g') IN (:...phonesNoPrefix)`,
        {
          phones,
          phonesNoPrefix: phones.map(p => p.startsWith('55') && p.length > 11 ? p.slice(2) : p),
        },
      )
      .getMany();
    // Indexa por dígitos normalizados para facilitar o match
    const result = new Map<string, string>();
    for (const lead of leads) {
      const digits = lead.phone.replace(/\D/g, '');
      result.set(digits, lead.name ?? '');
      if (!digits.startsWith('55')) result.set(`55${digits}`, lead.name ?? '');
      else result.set(digits.slice(2), lead.name ?? '');
    }
    return result;
  }

  async getConversationWithMessages(leadId: string) {
    return this.conversationsRepo.findOne({
      where: { leadId },
      relations: ['messages'],
      order: { messages: { createdAt: 'ASC' } } as any,
    });
  }

  async getHistory(leadId: string) {
    return this.historyRepo.find({
      where: { leadId },
      order: { createdAt: 'ASC' },
    });
  }

  async toggleAi(leadId: string, enabled: boolean): Promise<void> {
    const conversation = await this.conversationsRepo.findOne({ where: { leadId } });
    if (conversation) {
      conversation.aiEnabled = enabled;
      await this.conversationsRepo.save(conversation);
    }
  }

  async updateName(leadId: string, name: string): Promise<Lead> {
    const lead = await this.leadsRepo.findOneOrFail({ where: { id: leadId } });
    lead.name = name.trim() || null;
    return this.leadsRepo.save(lead);
  }

  async getAiEnabled(leadId: string): Promise<boolean> {
    const conversation = await this.conversationsRepo.findOne({ where: { leadId } });
    return conversation?.aiEnabled ?? true;
  }

  async deleteLead(leadId: string, reason: string): Promise<void> {
    const lead = await this.leadsRepo.findOne({ where: { id: leadId } });
    if (!lead) return;

    const conversation = await this.conversationsRepo.findOne({ where: { leadId } });
    let messagesSnapshot: any[] = [];
    if (conversation) {
      messagesSnapshot = await this.messagesRepo.find({
        where: { conversationId: conversation.id },
        order: { createdAt: 'ASC' },
      });
    }
    const historySnapshot = await this.historyRepo.find({ where: { leadId }, order: { createdAt: 'ASC' } });

    await this.deletedLeadsRepo.save({
      originalLeadId: lead.id,
      phone: lead.phone,
      name: lead.name,
      stage: lead.stage,
      deletionReason: reason || 'Sem motivo informado',
      leadSnapshot: {
        lead,
        conversation,
        messages: messagesSnapshot,
        stageHistory: historySnapshot,
      },
    });

    if (conversation) {
      await this.messagesRepo.delete({ conversationId: conversation.id });
      await this.conversationsRepo.delete({ leadId });
    }
    await this.historyRepo.delete({ leadId });
    await this.leadsRepo.delete(leadId);
  }

  async runFollowupJob() {
    if (!this.followupSender) return;
    const config = await this.whatsappConfigRepo.findOne({ where: {} });
    if (!config?.followupDelayMinutes || !config?.followupMessage) return;

    const cutoff = new Date(Date.now() - config.followupDelayMinutes * 60 * 1000);
    const leads = await this.leadsRepo.find({
      where: { stage: 'pagamento_confirmado' as LeadStage, followupSentAt: IsNull() },
    });

    for (const lead of leads) {
      const stageHistory = await this.historyRepo.findOne({
        where: { leadId: lead.id, toStage: 'pagamento_confirmado' as LeadStage },
        order: { createdAt: 'DESC' },
      });
      if (!stageHistory || stageHistory.createdAt > cutoff) continue;

      try {
        await this.followupSender(lead.phone, config.followupMessage);
        await this.leadsRepo.update(lead.id, { followupSentAt: new Date() });
        this.logger.log(`[FOLLOWUP] Enviado para ${lead.phone}`);
      } catch (err) {
        this.logger.error(`[FOLLOWUP] Falha para ${lead.phone}: ${err.message}`);
      }
    }
  }

  async updateFollowupConfig(delayMinutes: number, message: string): Promise<void> {
    const config = await this.whatsappConfigRepo.findOne({ where: {} });
    if (config) {
      await this.whatsappConfigRepo.update(config.id, { followupDelayMinutes: delayMinutes, followupMessage: message });
    }
  }

  async getFollowupConfig(): Promise<{ delayMinutes: number; message: string }> {
    const config = await this.whatsappConfigRepo.findOne({ where: {} });
    return {
      delayMinutes: config?.followupDelayMinutes ?? 60,
      message: config?.followupMessage ?? 'Olá! Já conseguiu preencher o formulário de matrícula? 😊',
    };
  }

  async findDeleted(): Promise<DeletedLead[]> {
    return this.deletedLeadsRepo.find({ order: { deletedAt: 'DESC' } });
  }

  async findOneDeleted(id: string): Promise<DeletedLead | null> {
    return this.deletedLeadsRepo.findOne({ where: { id } });
  }

  async getDashboard(period: '7' | '30' | '90' | 'all' = 'all') {
    // Calcula data de corte
    const now = new Date();
    let since: Date | null = null;
    if (period !== 'all') {
      const days = parseInt(period, 10);
      since = new Date(now.getTime() - days * 86400000);
    }

    // 1. Carrega leads do período (filtrados por createdAt se aplicável)
    const leads = since
      ? await this.leadsRepo.createQueryBuilder('lead')
          .where('lead.createdAt >= :since', { since })
          .getMany()
      : await this.leadsRepo.find();

    // 2. Funil — contagem por stage
    const stages: LeadStage[] = ['novo_lead', 'em_atendimento', 'aguardando_pagamento', 'pagamento_confirmado', 'matriculado', 'perdido'];
    const byStage: Record<string, number> = {};
    for (const s of stages) byStage[s] = 0;
    for (const lead of leads) {
      if (byStage[lead.stage] !== undefined) byStage[lead.stage]++;
    }

    const total = leads.length;
    const agendadoCount = byStage['pagamento_confirmado'] + byStage['matriculado'];
    const perdidoCount = byStage['perdido'];
    const conversionRate = total > 0 ? +(agendadoCount / total * 100).toFixed(1) : 0;
    const lossRate = total > 0 ? +(perdidoCount / total * 100).toFixed(1) : 0;

    // 3. Qualificados — leads com tag "qualificado"
    let qualifiedCount = 0;
    for (const lead of leads) {
      if ((lead.labels ?? []).includes('qualificado')) qualifiedCount++;
    }
    const qualifiedRate = total > 0 ? +(qualifiedCount / total * 100).toFixed(1) : 0;

    // 4. Tempo médio por stage usando lead_stage_history
    const leadIds = leads.map(l => l.id);
    const histories = leadIds.length > 0
      ? await this.historyRepo.createQueryBuilder('h')
          .where('h.leadId IN (:...ids)', { ids: leadIds })
          .orderBy('h.leadId', 'ASC')
          .addOrderBy('h.createdAt', 'ASC')
          .getMany()
      : [];

    const historyByLead = new Map<string, LeadStageHistory[]>();
    for (const h of histories) {
      const list = historyByLead.get(h.leadId) ?? [];
      list.push(h);
      historyByLead.set(h.leadId, list);
    }

    const stageTimeSum: Record<string, number> = {};
    const stageTimeCount: Record<string, number> = {};
    for (const s of stages) { stageTimeSum[s] = 0; stageTimeCount[s] = 0; }

    for (const lead of leads) {
      const leadHistory = historyByLead.get(lead.id) ?? [];
      if (leadHistory.length === 0) continue;

      for (let i = 0; i < leadHistory.length; i++) {
        const current = leadHistory[i];
        const next = leadHistory[i + 1];
        const enteredAt = current.createdAt.getTime();
        const exitedAt = next ? next.createdAt.getTime() : now.getTime();
        const hours = (exitedAt - enteredAt) / (1000 * 60 * 60);
        const stage = current.toStage;
        if (stageTimeSum[stage] !== undefined) {
          stageTimeSum[stage] += hours;
          stageTimeCount[stage]++;
        }
      }
    }

    const avgTimePerStage: Record<string, string> = {};
    for (const s of stages) {
      if (stageTimeCount[s] === 0) {
        avgTimePerStage[s] = '—';
      } else {
        const avgHours = stageTimeSum[s] / stageTimeCount[s];
        avgTimePerStage[s] = formatDuration(avgHours);
      }
    }

    // 5. Leads esfriando — novo_lead sem mensagem há mais de 2 dias
    const activeLeads = await this.leadsRepo.find({
      where: [{ stage: 'novo_lead' as LeadStage }, { stage: 'em_atendimento' as LeadStage }],
    });

    const coolingLeads = activeLeads
      .filter((lead) => {
        const lastContact = lead.lastMessageAt ?? lead.createdAt;
        const hoursSince = (now.getTime() - new Date(lastContact).getTime()) / (1000 * 60 * 60);
        return hoursSince >= 48;
      })
      .map((lead) => {
        const lastContact = lead.lastMessageAt ?? lead.createdAt;
        const hoursSince = (now.getTime() - new Date(lastContact).getTime()) / (1000 * 60 * 60);
        return {
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
          stage: lead.stage,
          lastContactAt: lastContact,
          daysSince: Math.floor(hoursSince / 24),
        };
      })
      .sort((a, b) => b.daysSince - a.daysSince);

    // 6. Agendamentos de hoje (timezone São Paulo)
    const todayStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    const startOfDay = new Date(`${todayStr}T00:00:00-03:00`);
    const endOfDay = new Date(`${todayStr}T23:59:59-03:00`);

    const todayAppointmentsRaw = await this.appointmentsRepo.find({
      where: { startDateTime: Between(startOfDay, endOfDay) },
      order: { startDateTime: 'ASC' },
    });

    const todayAppointments = todayAppointmentsRaw.map((a) => ({
      id: a.id,
      clientName: a.clientName,
      clientPhone: a.clientPhone,
      service: a.service,
      status: a.status,
      startDateTime: a.startDateTime,
    }));

    // 7. Leads sem resposta — última mensagem foi enviada por nós há mais de 8h
    const noReplyThreshold = new Date(now.getTime() - 1 * 60 * 60 * 1000);
    const activeStagesForNoReply: LeadStage[] = ['novo_lead', 'em_atendimento'];

    const activeForNoReply = await this.leadsRepo.find({
      where: activeStagesForNoReply.map((s) => ({ stage: s })),
    });

    const noReplyLeads: any[] = [];
    if (activeForNoReply.length > 0) {
      const conversations = await this.conversationsRepo
        .createQueryBuilder('conv')
        .where('conv.leadId IN (:...ids)', { ids: activeForNoReply.map((l) => l.id) })
        .getMany();
      const convByLead = new Map(conversations.map((c) => [c.leadId, c]));

      for (const lead of activeForNoReply) {
        const conv = convByLead.get(lead.id);
        if (!conv) continue;
        const lastMsg = await this.messagesRepo.findOne({
          where: { conversationId: conv.id },
          order: { createdAt: 'DESC' },
        });
        if (!lastMsg) continue;
        if (lastMsg.direction !== 'outbound') continue;
        if (lastMsg.createdAt >= noReplyThreshold) continue;

        const hoursSince = (now.getTime() - new Date(lastMsg.createdAt).getTime()) / (1000 * 60 * 60);
        noReplyLeads.push({
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
          stage: lead.stage,
          lastSentAt: lastMsg.createdAt,
          hoursSince: Math.floor(hoursSince),
        });
      }
      noReplyLeads.sort((a, b) => b.hoursSince - a.hoursSince);
    }

    return {
      period,
      total,
      byStage,
      conversionRate,
      lossRate,
      qualifiedCount,
      qualifiedRate,
      avgTimePerStage,
      coolingLeads,
      todayAppointments,
      noReplyLeads,
    };
  }
}

function formatDuration(hours: number): string {
  if (hours < 1) {
    const mins = Math.round(hours * 60);
    return `${mins}min`;
  }
  if (hours < 24) {
    return `${hours.toFixed(1)}h`;
  }
  const days = Math.floor(hours / 24);
  const remainder = Math.round(hours - days * 24);
  if (remainder === 0) return `${days} ${days === 1 ? 'dia' : 'dias'}`;
  return `${days} ${days === 1 ? 'dia' : 'dias'} ${remainder}h`;
}
