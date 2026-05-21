import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lead } from './common/entities/lead.entity';
import { Conversation } from './common/entities/conversation.entity';
import { Message } from './common/entities/message.entity';
import { LeadStageHistory } from './common/entities/lead-stage-history.entity';
import { Campaign } from './common/entities/campaign.entity';
import { WhatsappConfig } from './common/entities/whatsapp-config.entity';
import { MediaFile } from './common/entities/media-file.entity';
import { Appointment } from './common/entities/appointment.entity';
import { DeletedLead } from './common/entities/deleted-lead.entity';
import { EvolutionModule } from './evolution/evolution.module';
import { LeadsModule } from './leads/leads.module';
import { CalendarModule } from './calendar/calendar.module';
import { BulkMessageModule } from './bulk-message/bulk-message.module';
import { MediaModule } from './media/media.module';
import { AppointmentsModule } from './appointments/appointments.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get('SUPABASE_DATABASE_URL'),
        ssl: { rejectUnauthorized: false },
        entities: [Lead, Conversation, Message, LeadStageHistory, Campaign, WhatsappConfig, MediaFile, Appointment, DeletedLead],
        synchronize: true, // apenas dev — gera tabelas automaticamente
        logging: false,
      }),
    }),
    EvolutionModule,
    LeadsModule,
    CalendarModule,
    BulkMessageModule,
    MediaModule,
    AppointmentsModule,
  ],
})
export class AppModule {}
