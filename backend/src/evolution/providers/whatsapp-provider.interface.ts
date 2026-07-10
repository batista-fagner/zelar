export interface IWhatsAppProvider {
  sendTextMessage(phone: string, text: string): Promise<void>;
  sendAudioMessage(phone: string, buffer: Buffer): Promise<void>;
  sendTypingIndicator(phone: string, durationMs?: number): Promise<void>;
  transcribeAudio(mediaId: string): Promise<string>;
  /** Retorna o messageid (para rastreio de entrega) ou null se não suportado/falhou. */
  sendButtonMessage?(phone: string, text: string, choices: string[], footerText?: string): Promise<string | null>;
  /** Reconsulta o status de uma mensagem já enviada (rastreio de entrega). */
  checkMessageStatus?(messageid: string): Promise<string | null>;
}
