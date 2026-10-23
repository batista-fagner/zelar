import { EvolutionController } from './evolution.controller';

// Testa as palavras de pausa/reativação da IA digitadas pelo operador no próprio WhatsApp.
function build(config: any = { instanceToken: 'tok' }, existing = true) {
  const ctrl: any = Object.create(EvolutionController.prototype);
  ctrl.logger = { log: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
  ctrl.processedIds = new Set<string>();
  ctrl.whatsappConfigService = { get: jest.fn().mockResolvedValue(config) };
  ctrl.leadsService = {
    findExistingByPhone: jest.fn().mockResolvedValue(existing ? { lead: { id: 'L1' }, conversation: { id: 'C1' } } : null),
    toggleAi: jest.fn().mockResolvedValue(undefined),
    saveMessage: jest.fn().mockResolvedValue(undefined),
    findOne: jest.fn().mockResolvedValue({ id: 'L1' }),
    findOrCreate: jest.fn(),
  };
  ctrl.leadsGateway = { emitLeadUpdated: jest.fn() };
  ctrl.messageQueue = { enqueue: jest.fn(), add: jest.fn() };
  return ctrl;
}
const body = (text: string, extra: any = {}) => ({
  EventType: 'messages', token: 'tok', chat: { phone: '5527999990000' },
  message: { fromMe: true, wasSentByApi: false, text, messageid: Math.random().toString(), ...extra },
});

describe('palavra de pausa/reativação da IA (operador via WhatsApp)', () => {
  it('"opa" pausa a IA do lead', async () => {
    const c = build();
    await c.handleUazapiWebhook(body('opa'));
    expect(c.leadsService.toggleAi).toHaveBeenCalledWith('L1', false);
    expect(c.leadsService.saveMessage).not.toHaveBeenCalled();
  });

  it('"volta" reativa a IA do lead (case-insensitive, com espaços)', async () => {
    const c = build();
    await c.handleUazapiWebhook(body('  VOLTA '));
    expect(c.leadsService.toggleAi).toHaveBeenCalledWith('L1', true);
  });

  it('respeita palavras customizadas e assinatura de app multi-atendente', async () => {
    const c = build({ instanceToken: 'tok', deactivationKeyword: 'Pare', activationKeyword: 'segue' });
    await c.handleUazapiWebhook(body('*Lícia:*\npare'));
    expect(c.leadsService.toggleAi).toHaveBeenCalledWith('L1', false);
    await c.handleUazapiWebhook(body('opa'));
    expect(c.leadsService.toggleAi).toHaveBeenCalledTimes(1); // "opa" não vale mais
  });

  it('mensagem comum do operador é salva no histórico e não mexe na IA', async () => {
    const c = build();
    await c.handleUazapiWebhook(body('Oi, aqui é a Lícia, te ligo já'));
    expect(c.leadsService.toggleAi).not.toHaveBeenCalled();
    expect(c.leadsService.saveMessage).toHaveBeenCalledWith('C1', 'outbound', 'operator', 'Oi, aqui é a Lícia, te ligo já', expect.any(String));
  });

  it('palavra no meio de frase não pausa', async () => {
    const c = build();
    await c.handleUazapiWebhook(body('opa, tudo bem?'));
    expect(c.leadsService.toggleAi).not.toHaveBeenCalled();
  });

  it('número que não é lead (conversa pessoal) é ignorado e não cria lead', async () => {
    const c = build(undefined, false);
    await c.handleUazapiWebhook(body('opa'));
    expect(c.leadsService.toggleAi).not.toHaveBeenCalled();
    expect(c.leadsService.findOrCreate).not.toHaveBeenCalled();
  });

  it('mensagem enviada pela API (própria LIA) continua ignorada', async () => {
    const c = build();
    await c.handleUazapiWebhook(body('opa', { wasSentByApi: true }));
    expect(c.leadsService.findExistingByPhone).not.toHaveBeenCalled();
    expect(c.leadsService.toggleAi).not.toHaveBeenCalled();
  });

  it('webhook duplicado (mesmo messageid) só processa uma vez', async () => {
    const c = build();
    const b = body('opa', { messageid: 'X1' });
    await c.handleUazapiWebhook(b);
    await c.handleUazapiWebhook(b);
    expect(c.leadsService.toggleAi).toHaveBeenCalledTimes(1);
  });
});
