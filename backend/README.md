<!-- Testando o git -->
# Fisio Secretary — Backend

Backend da secretária virtual para clínica de fisioterapia. Recebe mensagens do WhatsApp via uazapi, processa com IA (Claude), qualifica leads automaticamente e agenda consultas no Google Calendar.

## Stack

- **Framework:** NestJS + TypeScript
- **Banco de dados:** PostgreSQL (Supabase) via TypeORM
- **Cache:** Redis
- **WhatsApp:** uazapi (API gerenciada, R$ 29/mês)
- **IA:** Anthropic Claude (`claude-haiku-4-5-20251001`)
- **Agenda:** Google Calendar API v3 (Service Account)
- **Real-time:** Socket.io

## Arquitetura

```
WhatsApp → uazapi → POST /webhooks/uazapi
                                     ↓
                            Cria/busca Lead + Conversa
                                     ↓
                            Salva mensagem (inbound)
                                     ↓
                            Claude AI processa histórico
                                     ↓
                            Atualiza Lead (stage, temperatura, campos)
                                     ↓
                     ┌───── action retornada pela IA ─────┐
                     ↓                                    ↓
              schedule / reschedule                    cancel
                     ↓                                    ↓
         Verifica disponibilidade             Remove evento do Calendar
         no Google Calendar                  Zera calendarEventId
                     ↓
         Horário livre → cria/atualiza evento
         Horário ocupado → envia aviso e aguarda novo horário
                                     ↓
                            Envia resposta via Evolution API
                                     ↓
                            Salva mensagem (outbound)
                                     ↓
                            Emite evento WebSocket (LeadsGateway)
```

## Módulos

### `EvolutionModule`
- Recebe webhooks do WhatsApp
- Filtra mensagens de grupos e do próprio bot
- Orquestra o fluxo lead → IA → Calendar → resposta

### `LeadsModule`
- CRUD de leads e conversas
- Histórico de troca de estágio
- Armazena mensagens com direção (inbound/outbound)
- Toggle de IA por lead (`aiEnabled`)

### `AiModule`
- Integra com Anthropic SDK
- Mantém histórico de conversa no campo `aiContext` (JSONB) do Lead
- Retorna JSON estruturado com `reply`, `stage`, `temperature`, `action`, `appointmentDateTime` e `fields`
- Contexto só é salvo quando a IA retorna JSON válido (`success: true`)

### `CalendarModule`
- Autenticação via Google Service Account (JWT)
- `checkAvailability(dateTime)` — verifica conflitos no intervalo da consulta (60 min por padrão)
- `createAppointment(...)` — cria evento com nome, WhatsApp e sintomas do paciente
- `cancelAppointment(eventId)` — remove evento do Calendar
- `updateAppointment(eventId, newDateTime)` — atualiza horário de evento existente

## Estágios do Lead

```
novo_lead → qualificando → lead_quente → agendado → convertido
                        ↘ lead_frio  → perdido
```

**Temperatura:** `quente` | `morno` | `frio`

**Proteção contra regressão de estágio:** o controller bloqueia qualquer mudança que rebaixe o estágio (exceto `lead_frio` e `perdido`).

## Fluxo de Agendamento (Sofia)

1. Sofia coleta nome, sintomas, urgência, disponibilidade e confirmação do valor (R$150)
2. Ao ter data + hora exatas, retorna `action: "schedule"` com `appointmentDateTime` em ISO 8601
3. Backend verifica disponibilidade no Google Calendar
4. **Horário livre:** cria evento e salva `calendarEventId` + `appointmentAt` no Lead
5. **Horário ocupado:** envia mensagem de conflito ao lead e aguarda novo horário
6. **Cancelamento:** remove evento do Calendar, zera `calendarEventId` e `appointmentAt`
7. **Reagendamento:** se já existe evento, atualiza; se não existe (1º horário foi bloqueado), cria novo

## Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/leads` | Lista todos os leads |
| GET | `/leads/:id` | Busca lead por ID |
| GET | `/leads/:id/conversation` | Conversa com mensagens |
| GET | `/leads/:id/history` | Histórico de mudanças de estágio |
| PATCH | `/leads/:id/stage` | Atualiza estágio manualmente |
| PATCH | `/leads/:id/ai` | Ativa/desativa IA para o lead |
| POST | `/webhooks/evolution` | Webhook do WhatsApp (Evolution API) |
| POST | `/webhooks/manual` | Envio manual de mensagem pelo operador |

## Configuração

### Variáveis de ambiente

Crie um arquivo `.env` na raiz de `fisio-secretary/`:

```env
# Banco de dados (Supabase)
SUPABASE_DATABASE_URL=postgresql://...
SUPABASE_DIRECT_URL=postgresql://...

# Redis
REDIS_PASSWORD=sua_senha_redis

# Evolution API (WhatsApp)
AUTHENTICATION_API_KEY=chave_api
EVOLUTION_BASE_URL=http://localhost:8080
EVOLUTION_INSTANCE_NAME=nome-da-instancia

# Anthropic (Claude)
ANTHROPIC_API_KEY=sk-ant-...

# Google Calendar (Service Account)
GOOGLE_SERVICE_ACCOUNT_EMAIL=nome@projeto.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_CALENDAR_ID=id_do_calendario@group.calendar.google.com

# Segurança
JWT_SECRET=...
WEBHOOK_SECRET=...
```

### Google Calendar — configuração da Service Account

1. Criar projeto no Google Cloud Console
2. Ativar a **Google Calendar API**
3. Criar uma **Service Account** e baixar a chave JSON
4. Compartilhar o calendário desejado com o e-mail da Service Account (permissão de edição)
5. Preencher `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY` e `GOOGLE_CALENDAR_ID` no `.env`

## Rodando localmente

### Pré-requisitos
- Node.js 20+
- Docker e Docker Compose

### 1. Instalar dependências

```bash
cd fisio-secretary/backend
npm install
```

### 2. Subir infraestrutura (Redis + Evolution API)

```bash
cd fisio-secretary
docker compose up -d
```

### 3. Iniciar o backend

```bash
# desenvolvimento (watch mode)
npm run start:dev

# produção
npm run start:prod
```

A API estará disponível em `http://localhost:3000`.

## Build

```bash
npm run build
```

Output gerado em `dist/`.
