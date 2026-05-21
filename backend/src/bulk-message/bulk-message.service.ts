import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { LeadsService } from '../leads/leads.service';
import { Campaign } from '../common/entities/campaign.entity';
import { WhatsappConfig } from '../common/entities/whatsapp-config.entity';

interface BulkMessageDto {
  mode: 'manual' | 'system';
  numbers?: string[];
  leadIds?: string[];
  message: string;
  campaignName?: string;
  delayMin?: number;
  delayMax?: number;
}

@Injectable()
export class BulkMessageService {
  private readonly logger = new Logger(BulkMessageService.name);
  private readonly uazapiBaseUrl: string;
  private readonly envToken: string;

  constructor(
    private http: HttpService,
    private config: ConfigService,
    private leadsService: LeadsService,
    @InjectRepository(Campaign)
    private campaignRepo: Repository<Campaign>,
    @InjectRepository(WhatsappConfig)
    private configRepo: Repository<WhatsappConfig>,
  ) {
    this.uazapiBaseUrl = config.get('UAZAPI_BASE_URL') ?? '';
    this.envToken = config.get('UAZAPI_TOKEN') ?? '';
  }

  private async getHeaders(): Promise<{ token: string }> {
    const record = await this.configRepo.findOne({ where: {}, order: { createdAt: 'DESC' } });
    const token = record?.instanceToken || this.envToken;
    return { token };
  }

  private interpolate(template: string, vars: { nome: string; telefone: string }): string {
    return template
      .replace(/\{nome\}/gi, vars.nome)
      .replace(/\{telefone\}/gi, vars.telefone);
  }

  private normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    return digits.startsWith('55') ? digits : `55${digits}`;
  }

  async sendBulk(dto: BulkMessageDto): Promise<{ queued: number; campaignId: string }> {
    const { message, delayMin = 5, delayMax = 15 } = dto;
    const campaignName = dto.campaignName || `Campanha ${new Date().toLocaleDateString('pt-BR')}`;
    const messages: Array<{ number: string; type: string; text: string }> = [];

    if (dto.mode === 'manual' && dto.numbers?.length) {
      for (const raw of dto.numbers) {
        const phone = this.normalizePhone(raw);
        messages.push({
          number: phone,
          type: 'text',
          text: this.interpolate(message, { nome: phone, telefone: phone }),
        });
      }
    }

    if (dto.mode === 'system' && dto.leadIds?.length) {
      for (const id of dto.leadIds) {
        const lead = await this.leadsService.findOne(id);
        if (!lead) continue;
        const phone = this.normalizePhone(lead.phone);
        const nome = lead.name || phone;
        messages.push({
          number: phone,
          type: 'text',
          text: this.interpolate(message, { nome, telefone: phone }),
        });
      }
    }

    if (!messages.length) {
      throw new Error('Nenhum destinatário válido encontrado');
    }

    this.logger.log(`Enviando campanha "${campaignName}" para ${messages.length} destinatário(s)...`);

    const res = await firstValueFrom(
      this.http.post(
        `${this.uazapiBaseUrl}/sender/advanced`,
        { delayMin, delayMax, scheduled_for: 1, info: campaignName, messages },
        { headers: await this.getHeaders() },
      ),
    );

    // Extrai folder_id da resposta da uazapi (pode vir em diferentes formatos)
    const responseData = res.data as any;
    const folderId: string | undefined =
      responseData?.folder_id ?? responseData?.id ?? responseData?.folderId ?? undefined;

    // Salva no banco
    const campaign = this.campaignRepo.create({
      campaignName,
      message,
      mode: dto.mode,
      totalRecipients: messages.length,
      folderId,
      status: 'sending',
    });
    const saved = await this.campaignRepo.save(campaign);

    this.logger.log(`Campanha salva no banco: ${saved.id} (folder_id: ${folderId ?? 'N/A'})`);
    return { queued: messages.length, campaignId: saved.id };
  }

  // Lista campanhas do banco + sincroniza status com a uazapi
  async getCampaigns(): Promise<Campaign[]> {
    const campaigns = await this.campaignRepo.find({ order: { createdAt: 'DESC' } });

    // Sincroniza status das campanhas que ainda não estão concluídas
    const activeCampaigns = campaigns.filter(c => c.folderId && c.status !== 'done' && c.status !== 'deleting');
    if (activeCampaigns.length > 0) {
      try {
        const res = await firstValueFrom(
          this.http.get(`${this.uazapiBaseUrl}/sender/listfolders`, { headers: await this.getHeaders() }),
        );
        const folders: any[] = Array.isArray(res.data) ? res.data : (res.data?.folders ?? res.data?.data ?? []);

        for (const campaign of activeCampaigns) {
          const folder = folders.find((f: any) => f.folder_id === campaign.folderId || f.id === campaign.folderId);
          if (folder && folder.status && folder.status !== campaign.status) {
            await this.campaignRepo.update(campaign.id, { status: folder.status });
            campaign.status = folder.status;
          }
        }
      } catch (err) {
        this.logger.warn(`Não foi possível sincronizar status com uazapi: ${err.message}`);
      }
    }

    return campaigns;
  }

  async getCampaignMessages(folderId: string, limit = 100, offset = 0): Promise<any> {
    try {
      const res = await firstValueFrom(
        this.http.post(
          `${this.uazapiBaseUrl}/sender/listmessages`,
          { folder_id: folderId, limit, offset },
          { headers: await this.getHeaders() },
        ),
      );
      const messages: any[] = Array.isArray(res.data) ? res.data : (res.data?.messages ?? []);

      // Enriquece com nome do lead (se cadastrado no sistema)
      const phones = messages
        .map(m => m.chatid?.replace('@s.whatsapp.net', '').replace('@g.us', ''))
        .filter(Boolean);
      const nameMap = await this.leadsService.findByPhones(phones);
      const enriched = messages.map(m => {
        const phone = m.chatid?.replace('@s.whatsapp.net', '').replace('@g.us', '');
        return { ...m, leadName: nameMap.get(phone) || null };
      });

      return Array.isArray(res.data) ? enriched : { ...res.data, messages: enriched };
    } catch (err) {
      this.logger.error(`Erro ao buscar mensagens da campanha ${folderId}: ${err.message}`);
      return null;
    }
  }

  async controlCampaign(folderId: string, action: 'stop' | 'continue' | 'delete'): Promise<any> {
    const res = await firstValueFrom(
      this.http.post(
        `${this.uazapiBaseUrl}/sender/edit`,
        { folder_id: folderId, action },
        { headers: await this.getHeaders() },
      ),
    );

    // Atualiza status no banco
    const newStatus = action === 'stop' ? 'paused' : action === 'continue' ? 'scheduled' : 'deleting';
    await this.campaignRepo.update({ folderId }, { status: newStatus });

    this.logger.log(`Ação "${action}" executada na campanha ${folderId}`);
    return res.data;
  }

  // Retorna campanha do banco pelo ID (inclui a mensagem enviada)
  async getCampaignById(id: string): Promise<Campaign | null> {
    return this.campaignRepo.findOne({ where: { id } });
  }
}
