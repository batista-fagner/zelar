import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BulkMessageController } from './bulk-message.controller';
import { BulkMessageService } from './bulk-message.service';
import { LeadsModule } from '../leads/leads.module';
import { Campaign } from '../common/entities/campaign.entity';
import { WhatsappConfig } from '../common/entities/whatsapp-config.entity';

@Module({
  imports: [HttpModule, TypeOrmModule.forFeature([Campaign, WhatsappConfig]), LeadsModule],
  controllers: [BulkMessageController],
  providers: [BulkMessageService],
})
export class BulkMessageModule {}
