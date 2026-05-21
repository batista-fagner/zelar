import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lead } from '../common/entities/lead.entity';
import { Conversation } from '../common/entities/conversation.entity';
import { Message } from '../common/entities/message.entity';
import { LeadStageHistory } from '../common/entities/lead-stage-history.entity';
import { DeletedLead } from '../common/entities/deleted-lead.entity';
import { Appointment } from '../common/entities/appointment.entity';
import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';
import { LeadsGateway } from './leads.gateway';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([Lead, Conversation, Message, LeadStageHistory, DeletedLead, Appointment])],
  providers: [LeadsService, LeadsGateway],
  controllers: [LeadsController],
  exports: [LeadsService, LeadsGateway],
})
export class LeadsModule {}
