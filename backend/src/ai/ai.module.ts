import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiService } from './ai.service';
import { WhatsappConfig } from '../common/entities/whatsapp-config.entity';

@Module({
  imports: [TypeOrmModule.forFeature([WhatsappConfig])],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
