import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import FormData = require('form-data');
import { IWhatsAppProvider } from './whatsapp-provider.interface';

@Injectable()
export class MetaProvider implements IWhatsAppProvider {
  private readonly logger = new Logger(MetaProvider.name);
  private readonly token: string;
  private readonly phoneNumberId: string;
  private readonly apiBase = 'https://graph.facebook.com/v20.0';

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.token = config.get('WHATSAPP_TOKEN') ?? '';
    this.phoneNumberId = config.get('WHATSAPP_PHONE_NUMBER_ID') ?? '';
  }

  private get headers() {
    return { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' };
  }

  // wa_id brasileiro às vezes vem com 12 dígitos (sem o 9 do celular) — corrige para 13
  private normalizePhone(phone: string): string {
    if (phone.startsWith('55') && phone.length === 12) {
      return phone.slice(0, 4) + '9' + phone.slice(4);
    }
    return phone;
  }

  async sendTextMessage(phone: string, text: string): Promise<void> {
    phone = this.normalizePhone(phone);
    try {
      await firstValueFrom(
        this.http.post(
          `${this.apiBase}/${this.phoneNumberId}/messages`,
          { messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: text } },
          { headers: this.headers },
        ),
      );
    } catch (err) {
      this.logger.error(`Erro ao enviar mensagem para ${phone}: ${err.message}`);
    }
  }

  async sendAudioMessage(phone: string, audioBuffer: Buffer): Promise<void> {
    phone = this.normalizePhone(phone);
    try {
      // Passo 1: upload do áudio
      const form = new FormData();
      form.append('messaging_product', 'whatsapp');
      form.append('file', audioBuffer, { filename: 'audio.ogg', contentType: 'audio/ogg' });

      const uploadResponse = await firstValueFrom(
        this.http.post(
          `${this.apiBase}/${this.phoneNumberId}/media`,
          form,
          { headers: { Authorization: `Bearer ${this.token}`, ...form.getHeaders() } },
        ),
      );

      const mediaId = (uploadResponse.data as any).id;

      // Passo 2: enviar usando o media_id
      await firstValueFrom(
        this.http.post(
          `${this.apiBase}/${this.phoneNumberId}/messages`,
          { messaging_product: 'whatsapp', to: phone, type: 'audio', audio: { id: mediaId } },
          { headers: this.headers },
        ),
      );
    } catch (err) {
      this.logger.error(`Erro ao enviar áudio para ${phone}: ${err.message}`);
    }
  }

  // Meta não suporta typing indicator — silenciosamente ignora
  async sendTypingIndicator(_phone: string, _durationMs?: number): Promise<void> {
    return;
  }

  async transcribeAudio(mediaId: string): Promise<string> {
    // Passo 1: pegar URL do media
    const mediaResponse = await firstValueFrom(
      this.http.get(`${this.apiBase}/${mediaId}`, { headers: this.headers }),
    );
    const mediaUrl: string = (mediaResponse.data as any).url;

    // Passo 2: baixar o arquivo de áudio
    const audioResponse = await firstValueFrom(
      this.http.get(mediaUrl, {
        headers: { Authorization: `Bearer ${this.token}` },
        responseType: 'arraybuffer',
      }),
    );
    const audioBuffer = Buffer.from(audioResponse.data as ArrayBuffer);

    // Passo 3: transcrever via OpenAI Whisper
    const form = new FormData();
    form.append('file', audioBuffer, { filename: 'audio.ogg', contentType: 'audio/ogg' });
    form.append('model', 'whisper-1');
    form.append('language', 'pt');

    const whisperResponse = await firstValueFrom(
      this.http.post('https://api.openai.com/v1/audio/transcriptions', form, {
        headers: { Authorization: `Bearer ${this.config.get('OPENAI_API_KEY')}`, ...form.getHeaders() },
      }),
    );

    return (whisperResponse.data as any).text ?? '';
  }
}
