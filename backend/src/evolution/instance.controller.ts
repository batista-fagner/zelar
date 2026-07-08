import { Controller, Post, Get, Delete, Body, Patch } from '@nestjs/common';
import { UazapiProvider } from './providers/uazapi.provider';
import { WhatsappConfigService } from './whatsapp-config.service';
import { AiService } from '../ai/ai.service';

@Controller('instance')
export class InstanceController {
  constructor(
    private readonly uazapi: UazapiProvider,
    private readonly whatsappConfigService: WhatsappConfigService,
    private readonly aiService: AiService,
  ) {}

  @Post('connect')
  async connect(@Body() body: { phone?: string }) {
    return this.uazapi.connectInstance(body.phone);
  }

  @Get('status')
  async status() {
    return this.uazapi.getInstanceStatus();
  }

  @Post('disconnect')
  async disconnect() {
    return this.uazapi.disconnectInstance();
  }

  @Post('reset')
  async reset() {
    return this.uazapi.resetInstance();
  }

  @Delete()
  async delete() {
    let result: any = { response: 'Instance Deleted' };
    try {
      result = await this.uazapi.deleteInstance();
    } catch {
      // instância pode já ter sido removida da uazapi — limpa o banco de qualquer forma
    }
    await this.whatsappConfigService.deleteRecord();
    return result;
  }

  @Post('setup-webhook')
  async setupWebhook() {
    return this.whatsappConfigService.setupAfterConnect();
  }

  @Get('config')
  async getConfig() {
    return this.whatsappConfigService.get();
  }

  @Patch('config')
  async updateConfig(@Body() body: {
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
  }) {
    return this.whatsappConfigService.updateConfig(body);
  }

  @Get('default-prompts')
  async getDefaultPrompts() {
    return this.aiService.getDefaultPrompts();
  }
}
