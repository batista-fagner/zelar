# Sofia SaaS — Roadmap de Transformação
## De Sistema Local para Plataforma Multi-tenant

**Versão:** 1.0  
**Data:** 2026-05-11  
**Preço de Venda:** R$ 500/mês  
**Status:** Planejamento Executivo

---

## 📊 Visão Geral

**Objetivo:** Transformar o sistema fisio-secretary (local, single-tenant) em uma plataforma SaaS multi-tenant escalável para fisioterapeutas, médicos e dentistas.

**Principais funcionalidades do SaaS:**
- ✅ Multi-tenant com isolamento de dados
- ✅ Autenticação / Autorização por papel (Admin, Operador, Etc)
- ✅ Conexão de WhatsApp via QR Code (uazapi endpoint)
- ✅ Envio de vídeo em bucket Supabase Storage
- ✅ API oficial Meta para mensagens em massa (plus)
- ✅ Dashboard de gerenciamento de instâncias
- ✅ Relatórios e analytics por empresa
- ✅ Customização de prompt por especialidade
- ✅ Cobrança recorrente (R$ 500/mês)

---

## 🏗️ Arquitetura Multi-tenant

### 1. Banco de Dados — Schema Multi-tenant

**Adicionar tabela raiz:**
```sql
-- Empresas/contas
CREATE TABLE accounts (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE,              -- "clinic-name" para URL
  subdomain VARCHAR(100) UNIQUE,         -- "clinic-name.sofia.app"
  industry VARCHAR(50),                  -- 'fisioterapia', 'medicina', 'odontologia'
  status VARCHAR(20),                    -- 'trial', 'active', 'suspended', 'canceled'
  subscription_plan VARCHAR(20),         -- 'basic' (R$500), 'pro' (R$1000), etc
  whatsapp_instance_id VARCHAR(100),    -- ID da instância uazapi
  stripe_customer_id VARCHAR(100),
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  deleted_at TIMESTAMP (soft delete)
);

-- Usuários (operadores, admins)
CREATE TABLE account_users (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255),
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  role VARCHAR(20),                      -- 'admin', 'operador', 'viewer'
  status VARCHAR(20),                    -- 'active', 'inactive', 'invited'
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  UNIQUE(account_id, email)
);
```

**Modificar tabelas existentes — adicionar tenant_id:**
```sql
-- Leads (já existente)
ALTER TABLE leads ADD COLUMN account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE;
CREATE INDEX idx_leads_account_id ON leads(account_id);

-- Conversas
ALTER TABLE conversations ADD COLUMN account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE;
CREATE INDEX idx_conversations_account_id ON conversations(account_id);

-- Campanhas (já existente)
ALTER TABLE campaigns ADD COLUMN account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE;
CREATE INDEX idx_campaigns_account_id ON campaigns(account_id);

-- Mensagens
ALTER TABLE messages ADD COLUMN account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE;
CREATE INDEX idx_messages_account_id ON messages(account_id);
```

**Impacto:**
- ✅ Cada query de `leads`, `conversations`, etc. incluirá `WHERE account_id = ?`
- ✅ Supabase RLS (Row-Level Security) pode forçar isso automaticamente
- ✅ Lógica de isolamento no backend via middleware NestJS

---

### 2. Autenticação e Autorização

**Implementar JWT com contexto de tenant:**

```typescript
// auth.service.ts
interface JwtPayload {
  userId: string;
  accountId: string;    // ← novo
  email: string;
  role: 'admin' | 'operador' | 'viewer';
}

// auth.guard.ts — extrair accountId do token
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const payload = this.jwtService.verify(request.headers.authorization);
    
    request.accountId = payload.accountId;  // ← injetar no contexto
    request.userId = payload.userId;
    request.role = payload.role;
    
    return true;
  }
}

// Usar em todos os controllers
@UseGuards(TenantGuard)
@Controller('leads')
export class LeadsController {
  @Get()
  async getLeads(@Req() request) {
    // request.accountId já disponível
    return this.leadsService.findByAccount(request.accountId);
  }
}
```

**Endpoints necessários:**
- `POST /auth/signup` — criar conta + primeiro admin
- `POST /auth/login` — email + password → JWT
- `POST /auth/invite-user` — admin convida operador
- `PATCH /account/profile` — atualizar dados da empresa
- `GET /account/users` — listar usuários
- `DELETE /account/users/:userId` — remover usuário
- `PATCH /account/users/:userId/role` — mudar role

**Roles e permissões:**

| Role | Kanban | Bulk Send | Settings | Users | Analytics |
|------|--------|-----------|----------|-------|-----------|
| **Admin** | ✅ RW | ✅ RW | ✅ RW | ✅ RW | ✅ R |
| **Operador** | ✅ RW | ✅ RW | ❌ | ❌ | ✅ R |
| **Viewer** | ✅ R | ❌ | ❌ | ❌ | ✅ R |

---

## 🔌 Conexão WhatsApp via QR Code

### Fluxo Atual (Single-tenant)
```
Sistema já vem com WHATSAPP_PROVIDER (uazapi ou meta)
  → conecta ao WhatsApp durante deploy
  → usa a mesma instância para todos os leads
```

### Fluxo SaaS (Multi-tenant)
```
Admin cria conta → Dashboard de Settings
  ↓
Clica "Conectar WhatsApp" → endpoint gera QR code
  ↓
Admin escaneia QR code no celular
  ↓
uazapi cria nova instância e retorna instance_id
  ↓
Sistema salva instance_id na tabela accounts.whatsapp_instance_id
  ↓
Webhook de cada instância aponta para /webhooks/whatsapp/{account_id}
  ↓
Sofia passa a responder naquela instância específica
```

### Endpoints uazapi já disponíveis (conforme você mencionou):

```bash
# Gerar QR code para nova instância
GET /qrcode/generate

# Obter status da instância
GET /session/status/{instance_id}

# Desconectar/remover instância
POST /session/logout/{instance_id}

# Listar todas as instâncias
GET /sessions

# Verificar se está conectado
GET /session/check/{instance_id}
```

### Implementação no Backend

**Novo endpoint:**
```typescript
// account-settings.controller.ts
@Post('whatsapp/init-connection')
async initWhatsAppConnection(@Req() request) {
  const { accountId } = request;
  
  // 1. Chamar uazapi para gerar novo QR code
  const qrCodeUrl = await this.uazapiService.generateQrCode();
  
  // 2. Salvar instance_id temporário na conta
  await this.accountsService.setTempInstanceId(accountId, qrCodeUrl.instanceId);
  
  // 3. Retornar QR code para frontend exibir
  return { qrCodeUrl: qrCodeUrl.base64, expiresIn: '30s' };
}

@Post('whatsapp/check-connection')
async checkWhatsAppConnection(@Req() request) {
  const { accountId } = request;
  const tempInstanceId = await this.accountsService.getTempInstanceId(accountId);
  
  // Verificar se QR foi scaneado
  const status = await this.uazapiService.getSessionStatus(tempInstanceId);
  
  if (status.isConnected) {
    // Salvar instance_id permanentemente
    await this.accountsService.setInstanceId(accountId, tempInstanceId);
    return { success: true, connected: true };
  }
  
  return { success: false, connected: false };
}

@Post('whatsapp/disconnect')
async disconnectWhatsApp(@Req() request) {
  const { accountId } = request;
  const instanceId = await this.accountsService.getInstanceId(accountId);
  
  await this.uazapiService.logout(instanceId);
  await this.accountsService.clearInstanceId(accountId);
  
  return { success: true };
}
```

**Frontend (React — Settings page):**
```jsx
// WhatsAppConnectionModal.jsx
function WhatsAppConnectionModal() {
  const [qrCode, setQrCode] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  
  useEffect(() => {
    // Polling a cada 2s para verificar conexão
    const interval = setInterval(async () => {
      const response = await fetch('/api/account/whatsapp/check-connection');
      if (response.data.connected) {
        setIsConnected(true);
        clearInterval(interval);
      }
    }, 2000);
    
    return () => clearInterval(interval);
  }, []);
  
  const handleConnect = async () => {
    const response = await fetch('/api/account/whatsapp/init-connection', {
      method: 'POST'
    });
    setQrCode(response.data.qrCodeUrl);
  };
  
  return (
    <Dialog>
      <h2>Conectar WhatsApp</h2>
      {!isConnected && qrCode && (
        <div>
          <img src={qrCode} alt="QR Code" />
          <p>Escaneie o QR code com seu celular</p>
        </div>
      )}
      {isConnected && <p>✅ WhatsApp conectado!</p>}
      {!isConnected && !qrCode && (
        <button onClick={handleConnect}>Iniciar Conexão</button>
      )}
    </Dialog>
  );
}
```

---

## 🎥 Envio de Vídeo — Bucket Supabase Storage

### Estrutura

```sql
-- Tabela para rastrear vídeos
CREATE TABLE video_templates (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name VARCHAR(255),
  title VARCHAR(255),           -- "Aula de Aquecimento"
  description TEXT,
  url VARCHAR(500),             -- URL pública do Supabase Storage
  duration_seconds INT,
  file_size_mb DECIMAL,
  storage_path VARCHAR(255),    -- "videos/account-id/video-id.mp4"
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### Bucket Supabase Storage

```
videos/
├── {account-id}/
│   ├── video-1-abc123.mp4
│   ├── video-2-def456.mp4
│   └── ...
```

### Upload Endpoint

```typescript
// media.controller.ts
@Post('videos/upload')
@UseInterceptors(FileInterceptor('file', {
  storage: diskStorage({
    destination: '/tmp'
  }),
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('video/')) {
      return cb(new BadRequestException('Apenas vídeos são permitidos'));
    }
    cb(null, true);
  },
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB
}))
async uploadVideo(
  @UploadedFile() file: Express.Multer.File,
  @Req() request
) {
  const { accountId } = request;
  
  // Fazer upload para Supabase Storage
  const storagePath = `videos/${accountId}/${Date.now()}-${file.originalname}`;
  const supabaseFile = await this.supabaseService.uploadFile(
    storagePath,
    fs.readFileSync(file.path)
  );
  
  // Criar registro no banco
  const videoTemplate = await this.videoService.create({
    account_id: accountId,
    name: file.originalname,
    url: supabaseFile.publicUrl,
    storage_path: storagePath,
    file_size_mb: file.size / (1024 * 1024)
  });
  
  // Limpar temp
  fs.unlinkSync(file.path);
  
  return { videoTemplate, url: supabaseFile.publicUrl };
}
```

### Integração no Prompt da Sofia

```typescript
// ai.service.ts — buildSystemPrompt()
buildSystemPrompt(lead, account) {
  let prompt = `Você é Sofia, secretária virtual...`;
  
  // Se a conta tem vídeos cadastrados
  if (account.videoTemplates?.length > 0) {
    prompt += `\n\nVídeos disponíveis para recomendar:\n`;
    account.videoTemplates.forEach(video => {
      prompt += `- ${video.name}: ${video.url}\n`;
    });
    prompt += `\nQuando apropriado, recomende um vídeo ao cliente. Use a URL exata.`;
  }
  
  return prompt;
}
```

### Enviar Vídeo via WhatsApp

```typescript
// evolution.service.ts
async sendVideoMessage(phone: string, videoUrl: string, caption?: string) {
  if (this.provider === 'uazapi') {
    return await this.uazapiProvider.sendVideoMessage(phone, videoUrl, caption);
  } else {
    return await this.metaProvider.sendVideoMessage(phone, videoUrl, caption);
  }
}

// uazapi.provider.ts
async sendVideoMessage(phone: string, videoUrl: string, caption?: string) {
  return await this.http.post(`${this.baseUrl}/send/media`, {
    number: phone,
    type: 'video',
    url: videoUrl,
    caption: caption,
    compress: true
  });
}
```

---

## 📤 Mensagens em Massa — Meta Official API

### Problema Atual
- uazapi é bom para bots conversacionais
- Meta Official API é melhor para bulk messaging (compliance, estatísticas, retry automático)

### Solução
Adicionar toggle no SaaS: "Usar Meta Official API para mensagens em massa"

### Tabelas Necessárias

```sql
-- Campanhas de massa (já existe)
-- Adicionar campo:
ALTER TABLE campaigns ADD COLUMN provider VARCHAR(20) DEFAULT 'uazapi';

-- Template de mensagem
CREATE TABLE whatsapp_templates (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES accounts(id),
  name VARCHAR(255),
  category VARCHAR(50),            -- 'MARKETING', 'APPOINTMENT_UPDATE', 'TRANSACTIONAL'
  content TEXT,
  variables TEXT[],                -- ['{{name}}', '{{date}}']
  status VARCHAR(20),              -- 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'
  meta_template_id VARCHAR(100),   -- ID retornado pelo Meta
  created_at TIMESTAMP
);

-- Logs de bulk messaging
CREATE TABLE bulk_message_logs (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES accounts(id),
  campaign_id UUID REFERENCES campaigns(id),
  recipient_phone VARCHAR(20),
  template_id UUID REFERENCES whatsapp_templates(id),
  status VARCHAR(20),              -- 'QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED'
  meta_message_id VARCHAR(100),
  error_message TEXT,
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  created_at TIMESTAMP
);
```

### Endpoints Necessários

```typescript
// bulk-messaging.controller.ts
@Post('bulk/send-template')
async sendBulkTemplate(
  @Body() body: { templateId: string; recipients: string[] },
  @Req() request
) {
  const { accountId } = request;
  
  // Validar template pertence à conta
  const template = await this.templateService.findById(body.templateId);
  if (template.account_id !== accountId) throw new ForbiddenException();
  
  // Usar Meta Official API para enviar em massa
  for (const phone of body.recipients) {
    await this.metaProvider.sendTemplate(
      phone,
      template.meta_template_id,
      template.variables
    );
  }
  
  return { sent: body.recipients.length };
}

@Get('bulk/logs')
async getBulkLogs(
  @Query('campaignId') campaignId: string,
  @Req() request
) {
  const { accountId } = request;
  
  return this.bulkLogService.findByAccountAndCampaign(
    accountId,
    campaignId
  );
}
```

### Admin Panel para Templates

Frontend precisa de:
- Criar/editar templates de mensagem
- Preview com variáveis
- Integração com Meta para envio de aprovação
- Dashboard com taxa de entrega por template

---

## 💳 Cobrança e Billing

### Plano de Preço

| Plano | Preço | Operadores | Mensagens/mês | Vídeos | API Meta |
|-------|-------|-----------|---------------|--------|----------|
| **Basic** | R$ 500 | 1 | 1.000 | ✅ 5GB | ❌ |
| **Pro** | R$ 1.000 | 3 | 5.000 | ✅ 50GB | ✅ |
| **Enterprise** | Custom | ∞ | ∞ | ✅ ∞ | ✅ |

### Integração com Stripe

```typescript
// billing.service.ts
async createSubscription(accountId: string, plan: 'basic' | 'pro') {
  const account = await this.accountsService.findById(accountId);
  
  // Criar cliente no Stripe
  const customer = await this.stripe.customers.create({
    email: account.admin_email,
    metadata: { accountId }
  });
  
  // Criar subscription
  const subscription = await this.stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: this.pricingMap[plan] }],
    payment_behavior: 'default_incomplete',
    expand: ['latest_invoice.payment_intent']
  });
  
  // Salvar no banco
  await this.accountsService.update(accountId, {
    stripe_customer_id: customer.id,
    stripe_subscription_id: subscription.id,
    subscription_plan: plan,
    status: 'active'
  });
  
  return subscription;
}

// Webhook do Stripe
@Post('webhooks/stripe')
async handleStripeWebhook(@Body() body, @Headers('stripe-signature') sig) {
  const event = this.stripe.webhooks.constructEvent(
    body,
    sig,
    process.env.STRIPE_WEBHOOK_SECRET
  );
  
  switch (event.type) {
    case 'invoice.payment_failed':
      await this.handlePaymentFailed(event.data.object);
      break;
    case 'customer.subscription.deleted':
      await this.handleSubscriptionCanceled(event.data.object);
      break;
  }
  
  return { received: true };
}
```

---

## 🗄️ Banco de Dados — Plano Gratuito vs Escala

### Fase 1: Supabase Free (Desenvolvimento)
- ✅ 500 MB de armazenamento
- ✅ 2 GB de banda
- ✅ 100k linhas de banco
- ✅ 10k execuções de funções/mês
- ✅ 1GB armazenamento de arquivos

**Suficiente para:**
- 10 contas (empresas)
- ~1.000 leads
- ~5.000 mensagens

### Fase 2: Supabase Pro (R$ 25/mês)
- ✅ 8 GB de armazenamento
- ✅ 250 GB de banda
- ✅ Sem limite de linhas
- ✅ 100k execuções de funções/mês
- ✅ 100 GB armazenamento de arquivos

**Suficiente para:**
- 50+ contas
- ~50.000 leads
- ~200.000 mensagens

### Estimativa de Crescimento

```
Se cobrar R$ 500/cliente/mês:

0-10 clientes       (R$ 0-5k/mês receita)  → Supabase Free (R$ 0)
10-50 clientes      (R$ 5-25k/mês receita) → Supabase Pro (R$ 25)
50-200 clientes     (R$ 25-100k/mês receita) → Supabase Business (R$ 150)
200+ clientes       (R$ 100k+/mês receita) → PostgreSQL dedicado
```

---

## 🔐 Segurança e Compliance

### Checklist

- [ ] HTTPS obrigatório (certificado SSL)
- [ ] JWT com expiração 24h + refresh token
- [ ] Rate limiting por account_id (100 req/min)
- [ ] Logs de auditoria (quem fez o quê, quando)
- [ ] Backup automático (Supabase: 7 dias de retenção)
- [ ] Encriptação de senhas (bcrypt, salt 12)
- [ ] Soft delete em tabelas sensíveis (leads, messages)
- [ ] GDPR compliance (direito de apagar dados)
- [ ] Conformidade LGPD (Brasil)

### Implementação Rápida

```typescript
// audit.service.ts
async logAction(
  accountId: string,
  userId: string,
  action: string,
  resource: string,
  resourceId: string,
  changes: any
) {
  await this.db.query(
    `INSERT INTO audit_logs (account_id, user_id, action, resource, resource_id, changes, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [accountId, userId, action, resource, resourceId, JSON.stringify(changes)]
  );
}

// Usar em todos os endpoints críticos
@Patch('leads/:id')
async updateLead(@Param('id') leadId, @Body() body, @Req() request) {
  const oldLead = await this.leadsService.findById(leadId);
  const updated = await this.leadsService.update(leadId, body);
  
  await this.auditService.logAction(
    request.accountId,
    request.userId,
    'UPDATE',
    'lead',
    leadId,
    { before: oldLead, after: updated }
  );
  
  return updated;
}
```

---

## 📊 Dashboard de Analytics

### Métricas por Account

```typescript
// analytics.controller.ts
@Get('dashboard/metrics')
async getDashboardMetrics(@Req() request) {
  const { accountId } = request;
  
  return {
    totalLeads: await this.leadsService.countByAccount(accountId),
    leadsThisMonth: await this.leadsService.countByAccountAndMonth(accountId),
    avgConversionRate: ...,
    avgResponseTime: ...,
    totalMessagesUsed: ...,
    messagesRemaining: ...,
    topOperators: ...,
    leadsByStage: ...,
    leadsByTemperature: ...,
    messagesPerDay: [...] // série temporal
  };
}
```

---

## 🚀 Fases de Implementação

### Fase 1: MVP SaaS (4-6 semanas)
- [x] Multi-tenant schema no banco
- [ ] Autenticação JWT por tenant
- [ ] Conexão WhatsApp via QR Code
- [ ] Settings page para admin
- [ ] Isolamento de dados (todos os controllers com account_id)

### Fase 2: Vídeo + Bulk Messaging (2-3 semanas)
- [ ] Upload de vídeo para Supabase Storage
- [ ] Integração Meta Official API
- [ ] Templates de mensagem
- [ ] Dashboard de bulk messaging

### Fase 3: Monetização (1-2 semanas)
- [ ] Integração Stripe
- [ ] Painel de cobrança
- [ ] Webhooks de pagamento
- [ ] Limitação de features por plano

### Fase 4: Escalabilidade (3-4 semanas)
- [ ] Cache Redis por tenant
- [ ] Otimização de queries
- [ ] CDN para vídeos
- [ ] Monitoramento (Sentry, DataDog)

### Fase 5: Customização por Especialidade (Contínuo)
- [ ] Prompt customizável por account
- [ ] Templates de mensagem por especialidade
- [ ] Fields dinâmicos (lead)

---

## 📋 Checklist Técnico — O que mudar

### Backend (NestJS)

- [ ] Criar `TenantGuard` — middleware que injeta `accountId` em todo request
- [ ] Refatorar `LeadsService.find()` → `find(accountId, filters)`
- [ ] Refatorar `ConversationService` → incluir account_id em todas as queries
- [ ] Refatorar `CampaignService` → multi-tenant
- [ ] Novo módulo: `AuthModule` (signup, login, jwt)
- [ ] Novo módulo: `AccountModule` (settings, users, whatsapp connection)
- [ ] Novo módulo: `BillingModule` (stripe integration)
- [ ] Novo módulo: `MediaModule` (video upload, supabase storage)
- [ ] Novo módulo: `AnalyticsModule` (metrics por account)
- [ ] Refatorar webhook de WhatsApp → extrair instance_id da URL
- [ ] Refatorar IA prompt → injetar customizações por account
- [ ] Adicionar rate limiting (Express Rate Limit)
- [ ] Adicionar audit logging em ações críticas

### Frontend (React)

- [ ] Login page + signup flow
- [ ] Dashboard de settings (admin only)
- [ ] WhatsApp connection modal (QR code scan)
- [ ] User management (adicionar/remover operadores)
- [ ] Billing page (mostrar plano, histórico, upgrade)
- [ ] Video upload page (drag-and-drop para Supabase)
- [ ] Customização de prompt (admin only)
- [ ] Analytics dashboard
- [ ] Refatorar Kanban → mostrar apenas leads da conta
- [ ] Refatorar Bulk Message → mostrar apenas campanhas da conta

### Banco de Dados

- [ ] Criar tabelas: `accounts`, `account_users`, `audit_logs`
- [ ] Adicionar `account_id` a: `leads`, `conversations`, `messages`, `campaigns`
- [ ] Criar índices em `account_id` (performance)
- [ ] RLS policies no Supabase (opcional mas recomendado)

### DevOps

- [ ] Atualizar variáveis de ambiente para acomodar Stripe, URLs de storage
- [ ] Configurar webhook de Stripe
- [ ] Configurar CORS por domínio dinâmico
- [ ] Backup strategy (diário)
- [ ] Monitoramento (alertas para erros críticos)

---

## 🎯 KPIs para Acompanhar

| Métrica | Target | Crítico |
|---------|--------|---------|
| **Uptime** | 99.9% | < 99% |
| **Latência média** | < 200ms | > 500ms |
| **Taxa de erro** | < 0.1% | > 1% |
| **Churn mensal** | < 5% | > 10% |
| **NPS** | > 50 | < 30 |
| **Tempo resposta Sofia** | < 3s | > 10s |
| **Taxa conversão trial** | > 30% | < 10% |

---

## 💡 Recomendações Finais

1. **Começar pelo MVP** — não tente implementar tudo de uma vez
2. **Supabase RLS** — usar para forçar isolamento de dados no nível de banco
3. **Customização por especialidade** — criar sistema de prompts customizáveis cedo
4. **Onboarding** — tutorial de primeira conexão WhatsApp é crítico
5. **Suporte** — ter ChatOps (Slack bot) para monitorar problemas de clientes
6. **Feedback loop** — coletar feedback de clientes beta antes de cobrar

---

**Próximas Ações:**
1. Align com seu irmão sobre prioridades (QR Code vs Vídeo vs Stripe)
2. Criar branch `feature/saas` no repo
3. Começar pela Fase 1 (Multi-tenant + Auth)
4. Testar com 2-3 clientes beta antes de escalar
