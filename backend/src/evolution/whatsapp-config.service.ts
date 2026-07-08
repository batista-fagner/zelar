import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { WhatsappConfig } from '../common/entities/whatsapp-config.entity';
import { UazapiProvider } from './providers/uazapi.provider';

@Injectable()
export class WhatsappConfigService {
  private readonly logger = new Logger(WhatsappConfigService.name);

  constructor(
    @InjectRepository(WhatsappConfig)
    private readonly repo: Repository<WhatsappConfig>,
    private readonly uazapi: UazapiProvider,
    private readonly config: ConfigService,
  ) {}

  async get(): Promise<WhatsappConfig | null> {
    const configs = await this.repo.find({ order: { createdAt: 'DESC' } });
    return configs[0] ?? null;
  }

  async listAll(): Promise<WhatsappConfig[]> {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  async getActiveToken(): Promise<string> {
    const record = await this.get();
    return record?.instanceToken || this.config.get('UAZAPI_TOKEN') || '';
  }

  async createNewInstance(name: string, adminField01?: string, adminField02?: string): Promise<WhatsappConfig> {
    const result = await this.uazapi.createInstance(name, adminField01, adminField02);

    const instance = result?.instance ?? {};
    const instanceToken = instance.token ?? result?.token;

    if (!instanceToken) {
      throw new Error('uazapi não retornou token da nova instância');
    }

    // Configura webhook desta instância automaticamente
    const serverUrl = this.config.get('SERVER_URL') ?? 'http://localhost:3000';
    const webhookUrl = `${serverUrl}/webhooks/uazapi`;

    let webhookConfigured = false;
    try {
      await this.uazapi.configureWebhook(webhookUrl, instanceToken);
      webhookConfigured = true;
      this.logger.log(`Webhook configurado para nova instância "${name}": ${webhookUrl}`);
    } catch (err) {
      this.logger.error(`Erro ao configurar webhook da nova instância "${name}": ${err.message}`);
    }

    const record = this.repo.create();
    record.instanceToken = instanceToken;
    record.profileName = instance.name ?? name;
    record.profilePicUrl = instance.profilePicUrl ?? null;
    record.connected = false;
    record.webhookConfigured = webhookConfigured;
    record.webhookUrl = webhookUrl;

    return this.repo.save(record);
  }

  async setupAfterConnect(): Promise<WhatsappConfig> {
    // 1. Identifica a instância ativa (mais recente no banco)
    let record = await this.get();
    const token = record?.instanceToken;

    // 2. Busca dados atuais da instância usando o token dela
    const statusData = await this.uazapi.getInstanceStatus(token);
    const instance = statusData?.instance;

    const instanceToken = instance?.token ?? token ?? this.config.get('UAZAPI_TOKEN');
    const profileName = instance?.profileName ?? null;
    const phone = statusData?.status?.jid?.replace('@s.whatsapp.net', '').replace(/:\d+$/, '') ?? null;
    const profilePicUrl = instance?.profilePicUrl ?? null;

    // 3. Configura webhook se ainda não foi configurado (instâncias legadas via env)
    const serverUrl = this.config.get('SERVER_URL') ?? 'http://localhost:3000';
    const webhookUrl = `${serverUrl}/webhooks/uazapi`;
    const autoConfigureWebhook = this.config.get('WEBHOOK_AUTO_CONFIGURE') !== 'false';

    let webhookConfigured = record?.webhookConfigured ?? false;
    if (autoConfigureWebhook && !webhookConfigured) {
      try {
        await this.uazapi.configureWebhook(webhookUrl, instanceToken);
        webhookConfigured = true;
        this.logger.log(`Webhook configurado: ${webhookUrl}`);
      } catch (err) {
        this.logger.error(`Erro ao configurar webhook: ${err.message}`);
      }
    }

    // 4. Salva/atualiza config no banco
    if (!record) {
      record = this.repo.create();
    }

    record.instanceToken = instanceToken;
    record.profileName = profileName;
    record.phone = phone;
    record.profilePicUrl = profilePicUrl;
    record.connected = true;
    record.webhookConfigured = webhookConfigured;
    record.webhookUrl = webhookUrl;

    return this.repo.save(record);
  }

  async markDisconnected(): Promise<void> {
    const record = await this.get();
    if (record) {
      record.connected = false;
      await this.repo.save(record);
    }
  }

  async updateConfig(fields: {
    customPromptLia?: string | null;
    promptRoteador?: string | null;
    promptFluxo1?: string | null;
    promptFluxo2?: string | null;
    promptFluxo3?: string | null;
    promptFluxo4?: string | null;
    planSimplesValue?: number;
    planMedioValue?: number;
    planComplexoValue?: number;
    caregiverPercent?: number;
  }): Promise<WhatsappConfig> {
    let record = await this.get();
    if (!record) record = this.repo.create();
    if ('customPromptLia' in fields) record.customPromptLia = fields.customPromptLia ?? null;
    if ('promptRoteador' in fields) record.promptRoteador = fields.promptRoteador ?? null;
    if ('promptFluxo1' in fields) record.promptFluxo1 = fields.promptFluxo1 ?? null;
    if ('promptFluxo2' in fields) record.promptFluxo2 = fields.promptFluxo2 ?? null;
    if ('promptFluxo3' in fields) record.promptFluxo3 = fields.promptFluxo3 ?? null;
    if ('promptFluxo4' in fields) record.promptFluxo4 = fields.promptFluxo4 ?? null;
    // Fluxo 1 — valores dos planos (centavos) e percentual do cuidador
    const toNonNegativeInt = (v: any) => Math.max(0, Math.round(Number(v) || 0));
    if ('planSimplesValue' in fields) record.planSimplesValue = toNonNegativeInt(fields.planSimplesValue);
    if ('planMedioValue' in fields) record.planMedioValue = toNonNegativeInt(fields.planMedioValue);
    if ('planComplexoValue' in fields) record.planComplexoValue = toNonNegativeInt(fields.planComplexoValue);
    if ('caregiverPercent' in fields) {
      record.caregiverPercent = Math.min(100, toNonNegativeInt(fields.caregiverPercent)) || 55;
    }
    return this.repo.save(record);
  }

  async deleteRecord(): Promise<void> {
    const record = await this.get();
    if (record) {
      await this.repo.remove(record);
    }
  }
}
