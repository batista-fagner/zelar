# Plano: SaaS Checkout + Auth + Multi-tenant — converthair

## Context
O sistema está funcionando como instância única (demo login hardcoded, sem auth real, dados sem isolamento por salão). Com 2 clientes pagantes chegando na semana que vem, é preciso estruturar:
- Auth real com JWT
- Multi-tenancy por salonId
- Checkout Stripe (PIX + cartão, recorrência mensal, R$ 310/mês)
- Landing page separada com planos e botão de compra

Decisões confirmadas:
- **Multi-tenant:** um backend Railway + Supabase, dados isolados por salonId
- **Plano único:** R$ 310/mês (sem fidelidade)
- **WhatsApp:** cada cliente conecta o próprio número
- **Landing page:** site separado (novo projeto Vite/React)

---

## Fase 1 — MVP para próxima semana (IMPLEMENTAR PRIMEIRO)

### 1. Novas entidades no backend

**`/backend/src/common/entities/salon.entity.ts`**
```
id (uuid PK)
name (varchar)
email (varchar, unique)
stripeCustomerId (varchar, nullable)
stripeSubscriptionId (varchar, nullable)
status: 'trial' | 'active' | 'suspended' | 'canceled'
createdAt, updatedAt
```

**`/backend/src/common/entities/user.entity.ts`**
```
id (uuid PK)
email (varchar, unique)
passwordHash (varchar)
salonId (uuid, FK → salon.id)
role: 'owner' | 'admin'
createdAt, updatedAt
```

### 2. Adicionar salonId em TODAS as entidades existentes

Coluna `salon_id` (uuid, nullable para não quebrar dados existentes) em:
- `leads`
- `conversations`
- `messages`
- `appointments`
- `whatsapp_configs`
- `campaigns`
- `media_files`
- `deleted_leads`
- `lead_stage_history`

### 3. Módulo Auth (NestJS)

**`/backend/src/auth/`** com:
- `auth.module.ts` — imports JwtModule, PassportModule
- `auth.service.ts` — login, hashPassword, createSalonAndUser
- `auth.controller.ts`:
  - `POST /auth/login` → `{ access_token: string }`
  - `POST /auth/register` → cria salon + user (chamado pelo webhook Stripe)
- `jwt.strategy.ts` — extrai `{ userId, salonId }` do token
- `jwt-auth.guard.ts` — guard aplicado em todos os controllers

JWT payload: `{ sub: userId, salonId, email }`

**Dependências a instalar:**
```bash
cd backend
npm install @nestjs/jwt @nestjs/passport passport passport-jwt bcryptjs
npm install -D @types/passport-jwt @types/bcryptjs
```

### 4. Escopo das queries por salonId

Todos os controllers recebem `salonId` do JWT via `@Request() req` e passam ao service:
```typescript
@Get()
@UseGuards(JwtAuthGuard)
findAll(@Request() req) {
  return this.leadsService.findAll(req.user.salonId);
}
```

Todos os `find()`, `findOne()`, `update()`, `delete()` filtram por `salonId`.

Dados existentes ficam com `salonId = null` — criar salão demo com ID fixo e migrar esses registros.

### 5. Módulo Stripe

**`/backend/src/stripe/`** com:
- `stripe.service.ts` — createCheckoutSession, handleWebhook
- `stripe.controller.ts`:
  - `POST /stripe/create-checkout` → retorna URL do Stripe Checkout
  - `POST /stripe/webhook` → recebe eventos Stripe (sem JwtAuthGuard)

**Webhook handlers:**
- `checkout.session.completed` → cria Salon + User → envia email com credenciais (Resend)
- `customer.subscription.deleted` → muda status do salão para `canceled`
- `invoice.payment_failed` → muda status para `suspended`

**Variáveis de ambiente a adicionar:**
```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...     # ID do plano R$310/mês criado no dashboard Stripe
```

**Notas Stripe:**
- PIX disponível no Stripe Checkout para Brasil — habilitar em Payment Methods no dashboard
- Criar produto "ConvertHair" + price recorrente R$ 310 BRL/mês
- Stripe raw body: `main.ts` precisa receber raw body na rota `/stripe/webhook`
- Sucesso: redirecionar para `https://app.converthair.com.br/login` com mensagem

### 6. Frontend — Auth real

**`/frontend/src/services/api.js`**
- Adicionar helper que lê JWT do localStorage e injeta `Authorization: Bearer <token>` em todas as chamadas
- Interceptar 401 → redirecionar para login

**`/frontend/src/pages/LoginPage.jsx`**
- Substituir credenciais hardcoded por `POST /auth/login`
- Salvar JWT no localStorage
- Redirecionar para `/` em caso de sucesso

**`/frontend/src/App.jsx`**
- Ao iniciar: verificar JWT no localStorage (checar campo `exp` do payload)
- Se ausente ou expirado → ir para /login

### 7. Landing page (novo projeto)

**Localização:** `/Users/fagnerbatista/Documents/planningPsi/converthair-landing/`

Stack: Vite + React + Tailwind

Seções:
1. Hero — headline + CTA "Comece agora por R$ 310/mês"
2. Features — o que o sistema faz (Kanban, IA, WhatsApp, Calendário, Dashboard)
3. Pricing card — plano único, R$ 310/mês, sem fidelidade, cancelamento a qualquer momento
4. FAQ — dúvidas sobre WhatsApp próprio, cancelamento, suporte

Fluxo do botão:
```
Cliente clica "Comece agora"
  → POST /stripe/create-checkout (no backend Railway)
  → Redireciona para URL do Stripe Checkout
  → Paga com PIX ou cartão
  → Stripe dispara webhook → backend cria Salon + User → envia email
  → Cliente recebe email com login e senha temporária
  → Cliente acessa app.converthair.com.br e loga
```

Deploy: Vercel

---

## Fase 2 — Pós-lançamento (NÃO implementar agora)

- [ ] Wizard de onboarding pós-pagamento (configurar WhatsApp, personalizar IA)
- [ ] Portal do assinante: trocar senha, ver status, cancelar pelo próprio painel
- [ ] Admin panel interno: listar salões, MRR, status
- [ ] Trial de 7 dias grátis antes de cobrar
- [ ] Múltiplos usuários por salão

---

## Arquivos a criar/modificar

| Ação | Arquivo |
|------|---------|
| CRIAR | `backend/src/common/entities/salon.entity.ts` |
| CRIAR | `backend/src/common/entities/user.entity.ts` |
| CRIAR | `backend/src/auth/auth.module.ts` |
| CRIAR | `backend/src/auth/auth.service.ts` |
| CRIAR | `backend/src/auth/auth.controller.ts` |
| CRIAR | `backend/src/auth/jwt.strategy.ts` |
| CRIAR | `backend/src/auth/jwt-auth.guard.ts` |
| CRIAR | `backend/src/stripe/stripe.module.ts` |
| CRIAR | `backend/src/stripe/stripe.service.ts` |
| CRIAR | `backend/src/stripe/stripe.controller.ts` |
| MODIFICAR | `backend/src/app.module.ts` |
| MODIFICAR | Todas as 9 entidades — adicionar `salonId` |
| MODIFICAR | Todos os controllers — JwtAuthGuard + salonId |
| MODIFICAR | Todos os services — filtrar por salonId |
| MODIFICAR | `backend/src/main.ts` — raw body para /stripe/webhook |
| MODIFICAR | `frontend/src/services/api.js` — Authorization header |
| MODIFICAR | `frontend/src/pages/LoginPage.jsx` — auth real |
| MODIFICAR | `frontend/src/App.jsx` — JWT check |
| CRIAR | `converthair-landing/` — novo projeto |

---

## Ordem de implementação (5 dias)

| Dia | Trabalho |
|-----|---------|
| 1 | Entidades Salon + User, módulo Auth (JWT, login endpoint) |
| 2 | salonId em todas as entidades, escopo de queries, frontend auth |
| 3 | Módulo Stripe (checkout + webhook + email credenciais) |
| 4 | Landing page (conectada ao backend Stripe) |
| 5 | Testes end-to-end, configurar Stripe produção, deploy |

---

## Verificação (como testar)

1. `POST /auth/login` com credenciais → recebe JWT
2. `GET /leads` com `Authorization: Bearer <token>` → retorna só leads do salão
3. Criar sessão Stripe → abrir URL → pagar com cartão de teste 4242... → webhook recebido → salon + user no banco → email enviado
4. Logar no app com as credenciais do email → ver Kanban vazio (nova salão)
5. Criar 2 salãos e confirmar que leads não vazam entre elas
