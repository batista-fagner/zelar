import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class InfinitpayService {
  private readonly logger = new Logger(InfinitpayService.name);
  private readonly apiBase = 'https://api.checkout.infinitepay.io';

  private get handle() { return this.config.get('INFINITPAY_HANDLE') ?? ''; }
  private get coursePrice() { return Number(this.config.get('INFINITPAY_COURSE_PRICE') ?? 100); }
  private get courseName() { return this.config.get('INFINITPAY_COURSE_NAME') ?? 'Curso de Cuidador'; }

  constructor(private readonly config: ConfigService) {}

  async createPaymentLink(leadId: string): Promise<string> {
    const serverUrl = this.config.get('SERVER_URL') ?? 'http://localhost:3001';
    const body = {
      handle: this.handle,
      redirect_url: `${serverUrl}/webhooks/infinitpay/redirect`,
      webhook_url: `${serverUrl}/webhooks/infinitpay`,
      order_nsu: leadId,
      items: [{ quantity: 1, price: this.coursePrice, description: this.courseName }],
    };

    const response = await axios.post(`${this.apiBase}/links`, body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    });

    const url: string = response.data?.url;
    if (!url) throw new Error('InfinitPay não retornou URL de pagamento');
    this.logger.log(`[InfinitPay] Link criado para lead ${leadId}: ${url}`);
    return url;
  }

  async verifyPayment(orderNsu: string, transactionNsu: string, slug: string): Promise<boolean> {
    try {
      const response = await axios.post(
        `${this.apiBase}/payment_check`,
        { handle: this.handle, order_nsu: orderNsu, transaction_nsu: transactionNsu, slug },
        { headers: { 'Content-Type': 'application/json' }, timeout: 8000 },
      );
      return response.data?.paid === true;
    } catch (err) {
      this.logger.error(`[InfinitPay] Erro ao verificar pagamento (${orderNsu}): ${err.message}`);
      return false;
    }
  }
}
