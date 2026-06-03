import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI, { toFile } from 'openai';

@Injectable()
export class AudioService {
  private readonly logger = new Logger(AudioService.name);
  private readonly openai: OpenAI;

  constructor(private config: ConfigService) {
    this.openai = new OpenAI({
      apiKey: config.get('OPENAI_API_KEY') ?? '',
      timeout: 15000,
      maxRetries: 1,
    });
  }

  async transcribe(base64Audio: string): Promise<string> {
    const buffer = Buffer.from(base64Audio, 'base64');
    const file = await toFile(buffer, 'audio.ogg', { type: 'audio/ogg; codecs=opus' });
    const transcription = await this.openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'pt',
    });
    return transcription.text;
  }

  private readonly MESES = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ];

  private prepareTextForTts(text: string): string {
    // 1. Remove emojis
    let t = text.replace(
      /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{27BF}]|[\u{1F000}-\u{1F02F}]|[\u{1F0A0}-\u{1F0FF}]/gu,
      '',
    );

    // 2. Abreviações comuns do chat → forma falada
    t = t.replace(/\bvc\b/gi, 'você');
    t = t.replace(/\bpq\b/gi, 'porque');
    t = t.replace(/\btbm\b/gi, 'também');
    t = t.replace(/\bblz\b/gi, 'beleza');

    // 3. Datas dd/mm/aaaa → "4 de abril de 2026"
    t = t.replace(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g, (_, d, m, a) => {
      const mes = this.MESES[parseInt(m, 10) - 1] ?? m;
      return `${parseInt(d, 10)} de ${mes} de ${a}`;
    });

    // 3. Datas dd/mm → "4 de abril"
    t = t.replace(/(\d{1,2})\/(\d{2})/g, (_, d, m) => {
      const mes = this.MESES[parseInt(m, 10) - 1] ?? m;
      return `${parseInt(d, 10)} de ${mes}`;
    });

    // 4. Horas HHhMM → "14 horas e 30 minutos"
    t = t.replace(/(\d{1,2})h(\d{2})/g, (_, h, min) => {
      const minVal = parseInt(min, 10);
      return minVal > 0 ? `${parseInt(h, 10)} horas e ${minVal} minutos` : `${parseInt(h, 10)} horas`;
    });

    // 5. Horas HH:MM → "14 horas e 30 minutos"
    t = t.replace(/(\d{1,2}):(\d{2})/g, (_, h, min) => {
      const minVal = parseInt(min, 10);
      return minVal > 0 ? `${parseInt(h, 10)} horas e ${minVal} minutos` : `${parseInt(h, 10)} horas`;
    });

    // 6. Horas Hh (sem minutos) → "14 horas"
    t = t.replace(/(\d{1,2})h\b/g, (_, h) => `${parseInt(h, 10)} horas`);

    // 7. Valores R$ → "500 reais"
    t = t.replace(/R\$\s*([\d.]+),(\d{2})/g, (_, int, dec) => {
      const intVal = int.replace('.', '');
      return parseInt(dec, 10) > 0
        ? `${intVal} reais e ${parseInt(dec, 10)} centavos`
        : `${intVal} reais`;
    });
    t = t.replace(/R\$\s*([\d.]+)/g, (_, val) => `${val.replace('.', '')} reais`);

    // 8. Remove caracteres especiais restantes (mantém letras, números, acentos, pontuação básica)
    t = t.replace(/[^a-z0-9áàâãéèêíïóôõöúçñ\s.,!?;:\-()]/gi, '');

    // 9. Normaliza espaços e quebras de linha
    t = t.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();

    return t;
  }

  async textToSpeech(text: string): Promise<Buffer> {
    const prepared = this.prepareTextForTts(text);

    if (!prepared) {
      throw new Error('Texto vazio após limpeza para TTS');
    }

    this.logger.debug(`TTS ElevenLabs input: "${prepared}"`);

    const voiceId = this.config.get('ELEVENLABS_VOICE_ID') ?? 'PznTnBc8X6pvixs9UkQm';
    const apiKey = this.config.get('ELEVENLABS_API_KEY') ?? '';

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
      body: JSON.stringify({ text: prepared, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
    });
    if (!response.ok) throw new Error(`ElevenLabs TTS error: ${response.status} ${response.statusText}`);
    return Buffer.from(await response.arrayBuffer());

    /* OpenAI TTS (fallback)
    const mp3Response = await this.openai.audio.speech.create({
      model: 'tts-1-hd',
      voice: 'shimmer',
      input: prepared,
      response_format: 'mp3',
    });
    return Buffer.from(await mp3Response.arrayBuffer());
    */
  }
}
