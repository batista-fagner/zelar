export interface IWhatsAppProvider {
  sendTextMessage(phone: string, text: string): Promise<void>;
  sendAudioMessage(phone: string, buffer: Buffer): Promise<void>;
  sendTypingIndicator(phone: string, durationMs?: number): Promise<void>;
  transcribeAudio(mediaId: string): Promise<string>;
}
