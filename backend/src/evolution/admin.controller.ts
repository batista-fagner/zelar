import { Controller, Post, Get, Delete, Body } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UazapiProvider } from './providers/uazapi.provider';
import { WhatsappConfigService } from './whatsapp-config.service';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly uazapi: UazapiProvider,
    private readonly whatsappConfigService: WhatsappConfigService,
    private readonly config: ConfigService,
  ) {}

  @Post('instance')
  async createInstance(@Body() body: { name: string; adminField01?: string; adminField02?: string }) {
    if (!body?.name) {
      return { error: 'name é obrigatório' };
    }
    return this.whatsappConfigService.createNewInstance(body.name, body.adminField01, body.adminField02);
  }

  @Get('instances')
  async listInstances() {
    return this.whatsappConfigService.listAll();
  }

  @Get('global-webhook')
  async getGlobalWebhook() {
    return this.uazapi.getGlobalWebhook();
  }

  @Delete('global-webhook')
  async disableGlobalWebhook() {
    return this.uazapi.disableGlobalWebhook();
  }

  @Post('global-webhook')
  async configureGlobalWebhook(@Body() body: { url?: string; events?: string[]; excludeMessages?: string[] }) {
    const serverUrl = this.config.get('SERVER_URL') ?? 'http://localhost:3000';
    const url = body?.url ?? `${serverUrl}/webhooks/uazapi`;
    const events = body?.events ?? ['messages', 'connection'];
    const excludeMessages = body?.excludeMessages ?? ['wasSentByApi', 'isGroupYes'];

    return this.uazapi.configureGlobalWebhook(url, events, excludeMessages);
  }
}
