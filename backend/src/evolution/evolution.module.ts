import { Module, forwardRef } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EvolutionController } from './evolution.controller';
import { InstanceController } from './instance.controller';
import { AdminController } from './admin.controller';
import { EvolutionService } from './evolution.service';
import { MessageQueueService } from './message-queue.service';
import { WhatsappConfigService } from './whatsapp-config.service';
import { UazapiProvider } from './providers/uazapi.provider';
import { MetaProvider } from './providers/meta.provider';
import { WhatsappConfig } from '../common/entities/whatsapp-config.entity';
import { LeadsModule } from '../leads/leads.module';
import { AiModule } from '../ai/ai.module';
import { CalendarModule } from '../calendar/calendar.module';
import { AudioModule } from '../audio/audio.module';
import { MediaModule } from '../media/media.module';
import { AppointmentsModule } from '../appointments/appointments.module';
import { InfinitpayModule } from '../infinitpay/infinitpay.module';
import { CareModule } from '../care/care.module';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 3,
    }),
    ConfigModule,
    TypeOrmModule.forFeature([WhatsappConfig]),
    forwardRef(() => LeadsModule),
    AiModule,
    CalendarModule,
    AudioModule,
    MediaModule,
    AppointmentsModule,
    InfinitpayModule,
    CareModule,
  ],
  controllers: [EvolutionController, InstanceController, AdminController],
  providers: [
    UazapiProvider,
    MetaProvider,
    WhatsappConfigService,
    {
      provide: 'WHATSAPP_PROVIDER',
      useFactory: (config: ConfigService, uazapi: UazapiProvider, meta: MetaProvider) => {
        const provider = config.get('WHATSAPP_PROVIDER') ?? 'uazapi';
        return provider === 'meta' ? meta : uazapi;
      },
      inject: [ConfigService, UazapiProvider, MetaProvider],
    },
    EvolutionService,
    MessageQueueService,
  ],
  exports: [EvolutionService, WhatsappConfigService],
})
export class EvolutionModule {}
