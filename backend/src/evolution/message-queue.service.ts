import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

interface QueueEntry {
  messages: string[];
  timer: ReturnType<typeof setTimeout>;
  callback: (combinedText: string) => void;
}

@Injectable()
export class MessageQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(MessageQueueService.name);
  private readonly DEBOUNCE_MS = 10000;
  private readonly queues = new Map<string, QueueEntry>();

  enqueue(phone: string, text: string, callback: (combinedText: string) => void): void {
    const existing = this.queues.get(phone);

    if (existing) {
      clearTimeout(existing.timer);
      existing.messages.push(text);
      existing.callback = callback;
      this.logger.debug(`[${phone}] mensagem acumulada (${existing.messages.length} total), timer reiniciado`);
    } else {
      this.queues.set(phone, { messages: [text], timer: null as any, callback });
      this.logger.debug(`[${phone}] nova fila criada`);
    }

    const entry = this.queues.get(phone)!;
    entry.timer = setTimeout(() => {
      const combined = entry.messages.join('\n');
      this.logger.log(`[${phone}] debounce disparado — ${entry.messages.length} msg(s): "${combined}"`);
      this.queues.delete(phone);
      entry.callback(combined);
    }, this.DEBOUNCE_MS);
  }

  onModuleDestroy() {
    for (const [phone, entry] of this.queues) {
      clearTimeout(entry.timer);
      this.logger.warn(`[${phone}] fila descartada no shutdown`);
    }
    this.queues.clear();
  }
}
