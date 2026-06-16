import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InfinitpayService } from './infinitpay.service';

@Module({
  imports: [ConfigModule],
  providers: [InfinitpayService],
  exports: [InfinitpayService],
})
export class InfinitpayModule {}
