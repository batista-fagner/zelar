import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Caregiver } from '../common/entities/caregiver.entity';
import { CareRequest } from '../common/entities/care-request.entity';
import { WhatsappConfig } from '../common/entities/whatsapp-config.entity';
import { CaregiversService } from './caregivers.service';
import { CaregiversController } from './caregivers.controller';
import { CareRequestsService } from './care-requests.service';
import { LeadsModule } from '../leads/leads.module';
import { CalendarModule } from '../calendar/calendar.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Caregiver, CareRequest, WhatsappConfig]),
    forwardRef(() => LeadsModule),
    CalendarModule,
  ],
  providers: [CaregiversService, CareRequestsService],
  controllers: [CaregiversController],
  exports: [CaregiversService, CareRequestsService],
})
export class CareModule {}
