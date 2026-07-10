import { Inject, Injectable } from '@nestjs/common';
import type { IWhatsAppProvider } from './providers/whatsapp-provider.interface';

@Injectable()
export class EvolutionService {
  constructor(
    @Inject('WHATSAPP_PROVIDER') private readonly provider: IWhatsAppProvider,
  ) {}

  sendTextMessage(phone: string, text: string): Promise<void> {
    return this.provider.sendTextMessage(phone, text);
  }

  sendAudioMessage(phone: string, buffer: Buffer): Promise<void> {
    return this.provider.sendAudioMessage(phone, buffer);
  }

  sendTypingIndicator(phone: string, durationMs?: number): Promise<void> {
    return this.provider.sendTypingIndicator(phone, durationMs);
  }

  transcribeAudio(mediaId: string): Promise<string> {
    return this.provider.transcribeAudio(mediaId);
  }

  sendButtonMessage(phone: string, text: string, choices: string[], footerText?: string): Promise<void> {
    if (!this.provider.sendButtonMessage) return Promise.resolve();
    return this.provider.sendButtonMessage(phone, text, choices, footerText);
  }
}
