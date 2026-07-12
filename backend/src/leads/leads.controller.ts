import { Controller, Get, Param, Patch, Post, Delete, Body, Query, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { LeadsService } from './leads.service';
import { LeadsGateway } from './leads.gateway';
import { EvolutionService } from '../evolution/evolution.service';
import { WhatsappConfigService } from '../evolution/whatsapp-config.service';
import { AiService } from '../ai/ai.service';
import { CareRequestsService } from '../care/care-requests.service';
import { CaregiversService } from '../care/caregivers.service';

@Controller('leads')
export class LeadsController {
  constructor(
    private readonly leadsService: LeadsService,
    private readonly leadsGateway: LeadsGateway,
    private readonly configService: ConfigService,
    private readonly evolutionService: EvolutionService,
    private readonly whatsappConfigService: WhatsappConfigService,
    private readonly aiService: AiService,
    @Inject(forwardRef(() => CareRequestsService))
    private readonly careRequestsService: CareRequestsService,
    @Inject(forwardRef(() => CaregiversService))
    private readonly caregiversService: CaregiversService,
  ) {}

  @Get()
  findAll() {
    return this.leadsService.findAll();
  }

  @Get('deleted')
  findDeleted() {
    return this.leadsService.findDeleted();
  }

  @Get('dashboard')
  getDashboard(@Query('period') period?: string) {
    const valid = ['7', '30', '90', 'all'];
    const p = valid.includes(period ?? '') ? period : 'all';
    return this.leadsService.getDashboard(p as any);
  }

  @Get('deleted/:id')
  findOneDeleted(@Param('id') id: string) {
    return this.leadsService.findOneDeleted(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.leadsService.findOne(id);
  }

  @Get(':id/conversation')
  getConversation(@Param('id') id: string) {
    return this.leadsService.getConversationWithMessages(id);
  }

  @Get(':id/history')
  getHistory(@Param('id') id: string) {
    return this.leadsService.getHistory(id);
  }

  @Patch(':id/stage')
  async updateStage(@Param('id') id: string, @Body() body: { stage: string }) {
    const lead = await this.leadsService.updateStage(id, body.stage as any, 'operator');
    this.leadsGateway.emitLeadUpdated(lead);
    return lead;
  }

  @Patch(':id/name')
  async updateName(@Param('id') id: string, @Body() body: { name: string }) {
    const lead = await this.leadsService.updateName(id, body.name);
    this.leadsGateway.emitLeadUpdated(lead);
    return lead;
  }

  @Patch(':id/ai')
  async toggleAi(@Param('id') id: string, @Body() body: { enabled: boolean }) {
    await this.leadsService.toggleAi(id, body.enabled);
    return { ok: true };
  }

  @Post(':id/confirm-payment')
  async confirmPayment(@Param('id') id: string) {
    const lead = await this.leadsService.findOne(id);
    if (!lead) return { ok: false, error: 'Lead não encontrado' };

    // Atualiza stage e reativa IA
    await this.leadsService.updateStage(id, 'pagamento_confirmado' as any, 'operator');
    await this.leadsService.toggleAi(id, true);

    const updatedLead = await this.leadsService.findOne(id);
    if (!updatedLead) return { ok: false };

    // FLUXO 1 — pagamento confirmado dispara o broadcast pros cuidadores (não envia formulário de curso)
    if (updatedLead.activeFlow === 'fluxo_1') {
      await this.careRequestsService.triggerBroadcastAfterPayment(updatedLead);
      const finalLead = await this.leadsService.findOne(id);
      this.leadsGateway.emitLeadUpdated(finalLead);
      return { ok: true };
    }

    // LIA retoma automaticamente com a confirmação
    const instanceConfig = await this.whatsappConfigService.get();
    const confirmationMsg = '[Sistema] O operador confirmou o pagamento. Retome a conversa enviando o link do formulário de matrícula conforme o PASSO 5.';

    const aiResponse = await this.aiService.processFlow(
      updatedLead,
      confirmationMsg,
      'fluxo_3',
      instanceConfig?.promptFluxo3 ?? instanceConfig?.customPromptLia ?? undefined,
    );

    if (aiResponse.success && aiResponse.reply) {
      await this.evolutionService.sendTextMessage(lead.phone, aiResponse.reply);
      const context = this.aiService.buildUpdatedContext(updatedLead, 'fluxo_3', confirmationMsg, aiResponse.rawJson!);
      await this.leadsService.update(id, { aiContext: context } as any);
    }

    const finalLead = await this.leadsService.findOne(id);
    this.leadsGateway.emitLeadUpdated(finalLead);
    return { ok: true };
  }

  @Post(':id/cancel-care')
  async cancelCare(@Param('id') id: string) {
    const request = await this.careRequestsService.cancelForLead(id);
    if (!request) return { ok: false, error: 'Nenhum atendimento aceito encontrado para este lead' };
    return { ok: true };
  }

  /**
   * Log visual de entrega do broadcast pros cuidadores (quem recebeu, status, quem aceitou)
   * + resumo do atendimento (idade/locomoção/banho/medicação/diagnóstico/data/turno) pro
   * operador não confirmar pagamento às cegas. Reconsulta ao vivo entregas ainda "enviado".
   */
  @Get(':id/care-broadcast')
  async getCareBroadcast(@Param('id') id: string) {
    let request = await this.careRequestsService.getLatestForLead(id);

    if (!request) {
      const lead = await this.leadsService.findOne(id);
      const pending = (lead?.aiContext as any)?.careSummaryPending ?? null;
      if (!pending) return null;
      return {
        status: null,
        complexity: null,
        notifiedAt: null,
        acceptedAt: null,
        broadcastLog: [],
        assignedCaregiverId: null,
        assignedCaregiverName: null,
        summary: pending,
      };
    }

    request = await this.careRequestsService.refreshPendingDeliveryStatuses(request);

    let assignedCaregiverName: string | null = null;
    if (request.assignedCaregiverId) {
      const caregivers = await this.caregiversService.findAll();
      assignedCaregiverName = caregivers.find(c => c.id === request.assignedCaregiverId)?.name ?? null;
    }

    return {
      status: request.status,
      complexity: request.complexity,
      notifiedAt: request.notifiedAt,
      acceptedAt: request.acceptedAt,
      broadcastLog: request.broadcastLog ?? [],
      assignedCaregiverId: request.assignedCaregiverId,
      assignedCaregiverName,
      summary: request.summary,
    };
  }

  /** Reenvia o broadcast reusando o summary da última solicitação expirada/cancelada. */
  @Post(':id/rebroadcast')
  async rebroadcast(@Param('id') id: string) {
    try {
      const request = await this.careRequestsService.rebroadcast(id);
      if (!request) return { ok: false, error: 'Já existe uma solicitação em andamento para este lead' };
      const updatedLead = await this.leadsService.findOne(id);
      this.leadsGateway.emitLeadUpdated(updatedLead);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  @Patch(':id/observations')
  async updateObservations(@Param('id') id: string, @Body() body: { observations: string }) {
    const lead = await this.leadsService.update(id, { observations: body.observations } as any);
    this.leadsGateway.emitLeadUpdated(lead);
    return lead;
  }

  @Get('followup/config')
  getFollowupConfig() {
    return this.leadsService.getFollowupConfig();
  }

  @Post('followup/config')
  async updateFollowupConfig(@Body() body: { delayMinutes: number; message: string }) {
    await this.leadsService.updateFollowupConfig(body.delayMinutes, body.message);
    return { ok: true };
  }

  @Delete(':id')
  async deleteLead(@Param('id') id: string, @Body() body: { reason?: string } = {}) {
    await this.leadsService.deleteLead(id, body.reason ?? '');
    this.leadsGateway.emitLeadDeleted(id);
    return { ok: true };
  }

  @Delete(':id/labels/:label')
  async removeLabel(@Param('id') id: string, @Param('label') label: string) {
    const lead = await this.leadsService.findOne(id);
    if (!lead) return { ok: false };

    // Remove do banco
    const updatedLabels = (lead.labels ?? []).filter((l) => l !== label);
    await this.leadsService.update(id, { labels: updatedLabels } as any);

    // Remove da uazapi
    const uazapiUrl = this.configService.get('UAZAPI_BASE_URL') || 'https://labsai.uazapi.com';
    const uazapiToken = this.configService.get('UAZAPI_TOKEN');

    if (uazapiToken) {
      try {
        // Busca ID da etiqueta pelo nome
        const labelsRes = await axios.get(`${uazapiUrl}/labels`, {
          headers: { token: uazapiToken, Accept: 'application/json' },
        });
        const found = (labelsRes.data || []).find((l: any) => l.name.toLowerCase() === label.toLowerCase());
        if (found) {
          await axios.post(
            `${uazapiUrl}/chat/labels`,
            { number: lead.phone, remove_labelid: found.id },
            { headers: { token: uazapiToken, 'Content-Type': 'application/json' } },
          );
        }
      } catch {
        // Falha silenciosa — etiqueta já foi removida do banco
      }
    }

    const updatedLead = await this.leadsService.findOne(id);
    this.leadsGateway.emitLeadUpdated(updatedLead);
    return updatedLead;
  }
}
