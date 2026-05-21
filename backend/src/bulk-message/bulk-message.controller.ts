import { Controller, Post, Get, Body, Param, BadRequestException, NotFoundException } from '@nestjs/common';
import { BulkMessageService } from './bulk-message.service';

@Controller('bulk-message')
export class BulkMessageController {
  constructor(private readonly bulkMessageService: BulkMessageService) {}

  @Post()
  async send(
    @Body()
    body: {
      mode: 'manual' | 'system';
      numbers?: string[];
      leadIds?: string[];
      message: string;
      campaignName?: string;
      delayMin?: number;
      delayMax?: number;
    },
  ) {
    if (!body.message?.trim()) {
      throw new BadRequestException('Mensagem não pode ser vazia');
    }
    if (body.mode === 'manual' && !body.numbers?.length) {
      throw new BadRequestException('Nenhum número fornecido');
    }
    if (body.mode === 'system' && !body.leadIds?.length) {
      throw new BadRequestException('Nenhum lead selecionado');
    }
    return this.bulkMessageService.sendBulk(body);
  }

  @Get('campaigns')
  async listCampaigns() {
    return this.bulkMessageService.getCampaigns();
  }

  @Get('campaigns/:id')
  async getCampaign(@Param('id') id: string) {
    const campaign = await this.bulkMessageService.getCampaignById(id);
    if (!campaign) throw new NotFoundException('Campanha não encontrada');
    return campaign;
  }

  @Get('campaigns/:id/messages')
  async getCampaignMessages(@Param('id') id: string) {
    const campaign = await this.bulkMessageService.getCampaignById(id);
    if (!campaign) throw new NotFoundException('Campanha não encontrada');
    if (!campaign.folderId) return { messages: [], note: 'folder_id não disponível para esta campanha' };
    return this.bulkMessageService.getCampaignMessages(campaign.folderId);
  }

  @Post('campaigns/:id/action')
  async controlCampaign(
    @Param('id') id: string,
    @Body() body: { action: 'stop' | 'continue' | 'delete' },
  ) {
    if (!['stop', 'continue', 'delete'].includes(body.action)) {
      throw new BadRequestException('Ação inválida. Use: stop, continue ou delete');
    }
    const campaign = await this.bulkMessageService.getCampaignById(id);
    if (!campaign) throw new NotFoundException('Campanha não encontrada');
    if (!campaign.folderId) throw new BadRequestException('Campanha sem folder_id — controle não disponível');
    return this.bulkMessageService.controlCampaign(campaign.folderId, body.action);
  }
}
