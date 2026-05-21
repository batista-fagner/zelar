# fisio-secretary — Contexto para o Claude

## O que é este projeto

Secretária virtual com IA (Sofia) para clínica de fisioterapia. Recebe mensagens WhatsApp via uazapi, qualifica leads automaticamente usando Claude, e exibe um Kanban em tempo real para o operador.

---

## Stack

- **Backend:** NestJS 11, TypeORM, PostgreSQL (Supabase), Redis
- **Frontend:** React + Vite + shadcn/ui + Socket.io
- **IA:** Anthropic Claude (claude-haiku-4-5-20251001)
- **STT:** OpenAI Whisper (transcrição automática via uazapi OU manual via Meta API)
- **TTS:** Google Cloud Text-to-Speech (voz pt-BR-Neural2-C, feminina)
- **WhatsApp:** Modular via `IWhatsAppProvider` interface — uazapi (R$ 29/mês) OU Meta Official API (badge verde + compliance)
  - Switching em runtime via `WHATSAPP_PROVIDER` env var (sem recompilação)
  - Strategy Pattern + Factory pattern em NestJS
- **Infra:** Docker (apenas Redis), Backend/Frontend em localhost

---

## Estrutura de pastas relevante

```
fisio-secretary/
├── backend/src/
│   ├── evolution/
│   │   ├── evolution.controller.ts                 ← webhook POST /webhooks/{uazapi,whatsapp} + processMessage() privado
│   │   ├── evolution.service.ts                    ← wrapper para IWhatsAppProvider (sendTextMessage, sendAudioMessage, etc)
│   │   ├── message-queue.service.ts                ← debounce de 10s por phone, callback-based
│   │   ├── providers/
│   │   │   ├── whatsapp-provider.interface.ts      ← interface abstrata para qualquer provider
│   │   │   ├── uazapi.provider.ts                  ← implementação uazapi
│   │   │   └── meta.provider.ts                    ← implementação Meta Official API
│   │   └── evolution.module.ts                     ← factory que seleciona provider via WHATSAPP_PROVIDER env
│   ├── audio/
│   │   ├── audio.service.ts          ← transcribe() via Whisper, textToSpeech() via Google Cloud TTS
│   │   └── audio.module.ts
│   ├── ai/
│   │   ├── ai.service.ts             ← processMessage(), buildUpdatedContext(), buildSystemPrompt()
│   │   └── ai.module.ts
│   ├── leads/
│   │   ├── leads.service.ts          ← findOrCreate, saveMessage, updateStage, toggleAi, getAiEnabled
│   │   ├── leads.controller.ts       ← GET /leads, GET /leads/:id/conversation, PATCH /leads/:id/ai
│   │   └── leads.module.ts
│   ├── common/entities/
│   │   ├── lead.entity.ts
│   │   ├── conversation.entity.ts    ← campo aiEnabled (boolean, default true)
│   │   ├── message.entity.ts
│   │   ├── lead-stage-history.entity.ts
│   │   └── appointment.entity.ts
│   └── app.module.ts
├── COMANDOS.md                       ← comandos para rodar o projeto
├── .env                              ← variáveis de ambiente
└── docker-compose.yml
```

---

## Configuração do projeto

### Claude Code Settings (`.claude/settings.local.json`)
- **Model:** Haiku 4.5 para todas as operações (mais econômico para git operations)
  - Quando você pedir em linguagem natural para subir alterações ("commit e push", "suba as mudanças", etc), Claude usa Haiku automaticamente para processar e executar

---

## Fluxo atual (implementado e testado)

```
Webhook recebe msg (texto ou áudio)
  → filtra msgs antigas (>5min ignoradas)
  → deduplicação por messageid
  → se áudio (type=media + mediaType in [audio,ptt,myaudio]): transcribeAudio() via uazapi → enfileira texto
  → MessageQueueService.enqueue() → retorna {ok:true} imediatamente
  → após 10s de silêncio: callback dispara processMessage()
  → getAiEnabled() — se false, salva msg e notifica frontend (operador assume)
  → sendTypingIndicator() — mostra "digitando..." no WhatsApp
  → AiService.processMessage() com buildSystemPrompt(lead)
  → atualiza Lead (stage, temperature, fields)
  → se última msg era áudio: AudioService.textToSpeech() → sendAudioMessage(type=ptt)
  → se última msg era texto: sendTextMessage()
  → salva msg outbound → emite WebSocket
```

A IA (Sofia) responde JSON:
```json
{
  "reply": "...",
  "stage": "qualificando",
  "temperature": "quente",
  "action": "schedule|cancel|reschedule|none",
  "appointmentDateTime": "2026-04-03T14:00:00",
  "fields": { "name": "...", "symptoms": "...", "urgency": "alta", ... }
}
```

Stages: `novo_lead → qualificando → lead_quente | lead_frio → agendado → convertido | perdido`

Score de temperatura: urgência alta (+40), orçamento ok (+30), disponibilidade em 3 dias (+20), nome (+10) → ≥70 quente, 40-69 morno, <40 frio

---

## Status das fases

- **Fase 1:** ✅ Concluída — Docker Compose, infra, WhatsApp conectado
- **Fase 2:** ✅ Concluída — Backend core, webhook, leads, eco bot
- **Fase 3:** ✅ Concluída e testada — IA Sofia integrada com Claude, fluxo de qualificação e agendamento funcionando
- **Fase 4:** ✅ Concluída — Frontend Kanban integrado com backend e WebSocket
- **Fase 5:** ✅ Concluída — Toggle IA por lead, envio manual pelo operador, histórico de stages, stats no header
- **Fase 6:** ✅ Concluída — Mensagens de áudio: STT via uazapi + TTS via Google Cloud (voz pt-BR-Neural2-C)
- **Fase 7:** ✅ Concluída — Migração Evolution API → uazapi (11/04/2026)
- **Fase 8:** ✅ Concluída — Envio em Massa com Sidebar (11/04/2026)
- **Fase 9:** ✅ Concluída — Meta Official API modular + provider switching (29/04/2026)

---

## Funcionalidades implementadas (29/04/2026 — Fase 9)

### Meta Official API — Integração Modular
- **Objetivo:** Oferecer alternativa à uazapi com badge verde no WhatsApp + compliance oficial
- **Arquitetura:** Strategy Pattern com `IWhatsAppProvider` interface
  - `UazapiProvider` — implementação existente (sem modificações)
  - `MetaProvider` — implementação nova para Meta Official API
  - Factory pattern em `evolution.module.ts` — seleciona provider via `WHATSAPP_PROVIDER` env var
- **Switching em tempo de execução:** `WHATSAPP_PROVIDER=meta` ou `WHATSAPP_PROVIDER=uazapi` no `.env`
  - Muda ALL operations: webhooks, envio de texto/áudio, transcrição, indicador de digitação
  - Sem recompilação necessária
- **MetaProvider endpoints:**
  - Webhook verificação: `GET /webhooks/whatsapp` (desafio Meta com hub.challenge)
  - Webhook mensagens: `POST /webhooks/whatsapp` (recebe whatsapp_business_account events)
  - Envio de texto: `POST /v20.0/{phoneNumberId}/messages` com estrutura `messaging_product: whatsapp`
  - Envio de áudio: 2 passos (upload media → enviar com media_id)
  - Transcrição manual: via OpenAI Whisper (Meta não auto-transcribe como uazapi)
- **Normalização de telefone brasileiro:** Bug descoberto — Meta retorna `wa_id` com 12 dígitos para Brasil (ex: `557192867765`) mas requer 13 dígitos (ex: `5571992867765`) com o 9 do celular após DDD. Implementado `normalizePhone()` method que detecta automaticamente
- **Typing indicator:** `sendTypingIndicator()` é no-op para Meta (não suporta)
- **Credenciais (modo teste — expiram em 24h):**
  ```
  WHATSAPP_PROVIDER=meta
  WHATSAPP_TOKEN=<token_teste_24h>
  WHATSAPP_PHONE_NUMBER_ID=1120226561170130
  WHATSAPP_BUSINESS_ACCOUNT_ID=2225551044850204
  WHATSAPP_VERIFY_TOKEN=my_webhook_verify_token_kanbam
  ```
- **Próximos passos para produção:**
  1. Comprar número brdid (R$ 28,30/mês) → recebe código de verificação no painel
  2. Registrar número no painel Meta → gera novo WHATSAPP_PHONE_NUMBER_ID
  3. Criar System User em business.facebook.com (token permanente — não expira em 24h)
  4. Gerar token permanente do System User → atualiza WHATSAPP_TOKEN
  5. Assinar webhook WABA via API: `curl -X POST "https://graph.facebook.com/v20.0/{WABA_ID}/subscribed_apps"`
  6. Testar com número real — qualquer pessoa pode mandar mensagem

---

## Funcionalidades implementadas (11/04/2026 — Fase 8)

### Envio em Massa com Sidebar
- **Layout.jsx:** sidebar colapsável com navegação principal (Kanban + Envio em Massa)
  - Logo Sofia no header
  - Items com ícones (LayoutDashboard, Send)
  - Botão logout no rodapé
  - Transição suave ao recolher (w-16 vs w-56)
- **BulkMessagePage.jsx:** sistema completo de envio em massa com 3 abas
  - **Aba Manual:** lista de números (um por linha), interpolação de variáveis {telefone}
  - **Aba Leads do Sistema:** filtro por stage + temperatura, seleção individual/em massa, interpolação com {nome} e {telefone}
  - **Aba Histórico:** polling a cada 5s, status detalhado (scheduled/sending/paused/done), preview da mensagem, modal com detalhes por destinatário
- **BulkMessageService:** integração completa com uazapi
  - `POST /sender/advanced` — envia campanha com delay 5-15s entre mensagens
  - `GET /sender/listfolders` — sincroniza status de campanhas ativas
  - `POST /sender/listmessages` — retorna detalhes por destinatário (número, status, timestamp)
  - `POST /sender/edit` — controla campanha (stop/continue/delete)
- **Campaign entity:** tabela `campaigns` para histórico
  - Fields: `campaignName`, `message`, `mode` (manual|system), `totalRecipients`, `folderId`, `status`
  - Polling automático sincroniza status com uazapi a cada requisição
- **Enriquecimento com nomes:** 
  - `LeadsService.findByPhones()` busca leads por múltiplos telefones com regex (ignora formatação +55, espaços, traços)
  - `getCampaignMessages()` injeta `leadName` para cada destinatário (best-effort para leads do sistema)
- **Lead.entity normalizePhone():** hook `@BeforeInsert/@BeforeUpdate` normaliza phone para dígitos (ex: `+55 27 98879-1829` → `5527988791829`)
- **Otimistic UI:** envio de mensagens manual no modal do Kanban
  - Mensagem aparece imediatamente na conversa (com opacidade 60% enquanto envia)
  - Se API falhar, remove otimistic e volta o texto pro campo
  - Melhora drasticamente a percepção de responsividade

---

## Funcionalidades implementadas (01/04/2026)

### Mensagens de Áudio (Fase 6)
- **Regra:** recebeu áudio → responde em áudio. Recebeu texto → responde em texto.
- `lastMessageWasAudio` Map no controller rastreia o tipo por phone — o último tipo recebido define o formato da resposta
- **STT:** `EvolutionService.transcribeAudio(messageId)` — transcrição via uazapi `/message/download` com `transcribe: true` (usa OpenAI Whisper internamente)
- **TTS:** `AudioService.textToSpeech(text)` — gera MP3 via Google Cloud TTS (voz `pt-BR-Neural2-C`, feminina, Neural2)
- **Pré-processamento do texto para TTS:**
  - Remove emojis e símbolos Unicode especiais
  - Converte datas `dd/mm/aaaa` → "4 de abril de 2026"
  - Converte datas `dd/mm` → "4 de abril"
  - Converte horas `14h30` / `14:30` → "14 horas e 30 minutos"
  - Converte valores `R$150,00` → "150 reais"
  - Remove caracteres especiais restantes, normaliza espaços
- **SSML:** texto processado é embrulhado em `<speak><prosody rate="medium">` para fala natural
- **Fallback:** se TTS falhar, envia como texto e loga o erro com status HTTP
- `evolution.service.ts` — `transcribeAudio(messageId)` e `sendAudioMessage(phone, buffer)`
  - Endpoint transcrição: `POST /message/download` com `id, transcribe: true`
  - Endpoint envio: `POST /send/media` com `type: "ptt"`, `file: base64`

---

## Funcionalidades implementadas (31/03/2026)

### Fila com Debounce (10s)
- `message-queue.service.ts` — acumula mensagens do mesmo número por 10s de silêncio, concatena e dispara callback
- Webhook retorna `{ok:true}` imediatamente — sem retry da Evolution API
- Deduplicação por `message.key.id` — evita duplo processamento de webhooks duplicados

### Indicador de Digitação
- `evolution.service.ts` — `sendTypingIndicator(phone, durationMs)`
- Endpoint: `POST /message/presence` com body `{ number, presence: "composing", delay }`
- Disparado antes do `processMessage()`, em paralelo (void)

### Toggle de IA por Lead
- Campo `aiEnabled` na entidade `Conversation` (default: `true`)
- `PATCH /leads/:id/ai` — ativa/desativa a IA para um lead específico
- Quando desativada: mensagem salva + WebSocket emitido, Sofia não responde
- Frontend: switch "IA ativa" no modal do lead; input de envio manual liberado quando IA off

### Datas corretas no agendamento
- `buildSystemPrompt()` injeta a data de hoje + calendário dos próximos 7 dias no prompt
- A IA não calcula datas — consulta a lista pronta (evita erros como "sexta = data passada")
- Confirmação obrigatória: Sofia mostra data completa (ex: "03/04, às 14h") e aguarda confirmação antes de `action="schedule"`

### Contexto do lead injetado no system prompt
- `buildLeadContext(lead)` gera um bloco com nome, stage, sintomas, urgência, disponibilidade, orçamento, score e consulta agendada
- Injetado no final do system prompt a cada chamada — Sofia nunca esquece quem está atendendo mesmo que o cliente some e volte
- Evita regressão de contexto (ex: pedir nome de lead já qualificado)

### Filtro de mensagens antigas
- Webhook verifica `message.messageTimestamp` — mensagens com mais de 5 minutos são descartadas
- Evita que o backend responda mensagens antigas acumuladas quando volta do ar após queda

---

## Funcionalidades implementadas (07/05/2026 — Fase 10)

### Camadas de Segurança — Inativação Automática de Leads

**4 camadas implementadas no prompt da Sofia (`ai.service.ts` → `buildSystemPrompt()`):**

| Situação | Resposta | Etiquetas | IA |
|----------|----------|-----------|-----|
| Desrespeito / xingamento | 1x educada | `inativo` + `desrespeitoso` | Desativada |
| Fora de escopo total (genital, cirurgia, psicologia) | 1x educada | `inativo` + `fora-de-escopo` | Desativada |
| Emergência médica (acidente, hemorragia, perda de consciência) | Alerta urgente (192 / pronto-socorro) | `inativo` + `emergencia` | Desativada |
| Fora de escopo parcial (dor abdominal, gastrite) | Educada + sugere especialista | *(sem etiqueta)* | **Continua ativa** |

**Resposta JSON da IA agora inclui:**
```json
{ "tags": ["inativo", "desrespeitoso"], "shouldIgnore": true }
```

**Fluxo no backend (`evolution.controller.ts`):**
1. IA retorna `shouldIgnore=true`
2. Backend envia a mensagem de despedida UMA VEZ
3. Aplica etiquetas na uazapi via `POST /chat/labels` (add_labelid)
4. Cria etiquetas se não existirem via `POST /label/edit`
5. Salva etiquetas no banco (`lead.labels` — campo JSONB)
6. Chama `toggleAi(lead.id, false)` — IA desativada permanentemente
7. Lead nunca mais é respondido

**Cores das etiquetas na uazapi:**
- Vermelho: `inativo`, `desrespeitoso`, `emergencia`
- Azul: `fora-de-escopo`

**Frontend (`LeadCard.jsx`):**
- Etiquetas exibidas no card com ícone + cor
  - 🚫 inativo (vermelho), ⛔ desrespeitoso (vermelho), 🚨 emergencia (vermelho), 📵 fora-de-escopo (azul)

**Correção crítica na ordem de verificação (`evolution.controller.ts`):**
- `aiEnabled` é verificado ANTES de reiniciar lead perdido
- Lead com `aiEnabled=false` nunca é reativado mesmo mandando nova mensagem

---

### Fix: IA Inventando Data de Consulta

**Problema:** Sofia ignorava `appointmentAt` do banco e inventava datas.

**Solução (`ai.service.ts` → `processMessage()`):**
- Antes de chamar a IA, injeta par de mensagens `user/assistant` no início do histórico com a data real do banco
- A IA "parte do fato já confirmado" e não consegue inventar outra data
- Se data já passou: injeta aviso "DATA JÁ PASSOU" + instrução para oferecer reagendamento

**Código:**
```typescript
appointmentFacts.push({ role: 'user', content: '[Sistema] A consulta está confirmada para DD/MM/YYYY às HHh' });
appointmentFacts.push({ role: 'assistant', content: 'Entendido. Vou confirmar para DD/MM/YYYY às HHh.' });
// Injetado ANTES do histórico da conversa
messages = [...appointmentFacts, ...history, { role: 'user', content: incomingText }]
```

**Importante:** Ao testar datas de consulta, apagar o lead e começar do zero — histórico anterior com data errada influencia a IA.

---

### Etiquetas uazapi — Endpoints

```bash
# Criar/editar etiqueta
POST /label/edit
{ "labelid": "new", "name": "inativo", "color": 4, "delete": false }

# Buscar todas etiquetas
GET /labels

# Associar etiqueta ao contato (usar APENAS um dos três campos)
POST /chat/labels
{ "number": "5511999999999", "add_labelid": "id_da_etiqueta" }
# ou "remove_labelid" para remover
# ou "labelids": ["id1","id2"] para definir todas de uma vez
```

---

## Checklist de Testes — Sofia

### ✅ Testado e aprovado (07/05/2026)
- [x] Xingamento → etiqueta `desrespeitoso` + `inativo` + IA desativada + msg respeitosa
- [x] Data de consulta passada → informa que passou + oferece reagendamento

### ⏳ Pendente de teste
- [ ] **Emergência** — "tive um acidente", "estou passando muito mal, tontura e hemorragia"
- [ ] **Fora de escopo total** — "estou com problema no pênis" → etiquetar + inativar
- [ ] **Fora de escopo parcial** — "estou com dor de barriga" → responder educadamente, NÃO inativar
- [ ] **Consulta futura** — agendar consulta → perguntar quando é → deve informar data correta do banco
- [ ] **Reagendamento** — data passada → confirmar passou → reagendar → verificar Google Calendar
- [ ] **Áudio + emergência** — mandar áudio de emergência → Sofia deve responder em áudio com alerta

---

## Bugs corrigidos

**[30/03] Resposta sem JSON:** `buildUpdatedContext()` passou a salvar o JSON completo (`rawJson`) no histórico em vez do texto puro do `reply`. Impedia o Claude de "esquecer" o formato JSON nas mensagens seguintes.

**[31/03] Webhook duplicado:** Evolution API (Baileys) envia `messages.upsert` duas vezes para a mesma mensagem. Corrigido com `Set<messageId>` no controller (TTL de 5 min).

**[31/03] Data errada no agendamento:** IA calculava "sexta" como data passada. Corrigido injetando calendário com datas absolutas no prompt via `buildSystemPrompt()`.

**[31/03] Debounce com Promise:** implementação anterior usava Promise por webhook — segundo webhook pendurava forever, causando retry. Refatorado para callback.

**[31/03] IA esquecia contexto do lead:** após agendamento concluído, cliente mandando "oi" fazia Sofia perguntar nome/dor novamente. Corrigido injetando `buildLeadContext(lead)` no system prompt com os dados já coletados do banco.

**[31/03] Backend respondia mensagens antigas:** ao reiniciar o backend, Evolution API reenviava webhooks pendentes e a Sofia respondia mensagens velhas. Corrigido com filtro de timestamp (>5min = descartado).

**[11/04] Migração para uazapi:** Evolution API substituída por uazapi (R$ 29/mês, suporte, sem Docker). Adaptados endpoints de webhook, envio de texto/áudio, transcrição automática de áudio (eliminou necessidade de chamar Whisper manualmente).

**[07/05] IA inventava data de consulta:** Sofia ignorava `appointmentAt` do banco e calculava/inventava datas. Corrigido injetando fato da consulta como par `user/assistant` no início do histórico antes de chamar a IA.

**[07/05] Lead inativado continuava recebendo respostas:** `shouldIgnore=true` desativava apenas aquela mensagem mas não persistia. Corrigido chamando `toggleAi(lead.id, false)` que persiste no banco. Verificação de `aiEnabled` movida para ANTES do reinício de lead perdido.

---

## Variáveis de ambiente (.env)

```
# Supabase
SUPABASE_DATABASE_URL=...
SUPABASE_DIRECT_URL=...
SUPABASE_URL=...
SUPABASE_ANON_KEY=...

# Redis
REDIS_PASSWORD=...

# WhatsApp Provider — trocar entre 'uazapi' e 'meta'
WHATSAPP_PROVIDER=uazapi

# uazapi (WhatsApp)
UAZAPI_BASE_URL=https://free.uazapi.com
UAZAPI_TOKEN=...

# Meta Official API (WhatsApp Business)
WHATSAPP_TOKEN=...                           # 24h test token ou System User token permanente
WHATSAPP_PHONE_NUMBER_ID=...                 # ID do número de telefone (Meta)
WHATSAPP_BUSINESS_ACCOUNT_ID=...             # ID da conta de negócios (Meta)
WHATSAPP_VERIFY_TOKEN=my_webhook_verify_token_kanbam

# Backend
SERVER_URL=http://localhost:3000
DATABASE_ENABLED=true
DATABASE_PROVIDER=postgresql
DATABASE_CONNECTION_URI=...
CACHE_REDIS_ENABLED=true
CACHE_REDIS_URI=redis://:REDIS_PASSWORD@fisio_redis:6379/1

# IA e APIs
ANTHROPIC_API_KEY=...
JWT_SECRET=...
WEBHOOK_SECRET=...
OPENAI_API_KEY=...              # Transcrição (uazapi internamente ou Meta manual)
GOOGLE_SERVICE_ACCOUNT_EMAIL=... # Google Cloud TTS
GOOGLE_PRIVATE_KEY="..."         # Google Cloud TTS
GOOGLE_CALENDAR_ID=...
ELEVENLABS_API_KEY=...           # TTS alternativo (não usado atualmente)
ELEVENLABS_VOICE_ID=...
```

---

## Docker Compose — serviços

| Serviço | Porta | Nota |
|---------|-------|------|
| Redis | 6379 | Container (gerenciado pelo Docker) |
| Backend NestJS | 3000 | Local (npm run start:dev) |
| Frontend React | 5173 | Local (npm run dev) |

**Observação:** PostgreSQL (Supabase), WhatsApp (uazapi OU Meta Official API), Google Calendar e Google Cloud TTS são serviços externos (não Docker).

---

## Funcionalidades implementadas (14/05/2026 — Fase 11)

### SaaS Multi-Instância — Criação e Gestão via Plataforma

**Objetivo:** Cliente cria e conecta a própria instância uazapi pelo CRM, sem tocar em .env.

**Arquitetura:**
- `UazapiProvider` injeta `@InjectRepository(WhatsappConfig)` → `resolveToken(token?)` busca token no banco (fallback para `UAZAPI_TOKEN` env)
- `WhatsappConfigService` — novos métodos: `createNewInstance(name)`, `getActiveToken()`, `updateConfig(fields)`, `deleteRecord()`, `listAll()`
- `AdminController` (`/admin/*`) — uso interno:
  - `POST /admin/instance` → cria instância via uazapi + configura webhook automaticamente + salva token no banco
  - `GET /admin/instances` → lista todas as instâncias
  - `POST /admin/global-webhook` → configura webhook global
- `InstanceController` melhorias:
  - `DELETE /instance` — wrappado em try/catch: deleta no uazapi E no banco mesmo se uazapi retornar 401
  - `PATCH /instance/config` → atualiza campos (ex: agentType) no banco

**Campo `agentType` em `WhatsappConfig`:**
- `@Column({ name: 'agent_type', default: 'fisio' }) agentType: string`
- Roteamento no webhook: `agentType='fisio'` → `aiService.processMessage()`, `agentType='megahair'` → `aiService.processMessageMegaHair()`

**Fluxo de criação:**
1. Frontend chama `POST /admin/instance { name }`
2. Backend chama `uazapi.createInstance(name)` com `admintoken` header → retorna token da instância
3. Backend configura webhook: `uazapi.configureWebhook(webhookUrl, instanceToken)` com o novo token explícito
4. Salva `instanceToken` no banco (`WhatsappConfig`)

---

### Sistema de Mídias (Imagens e Vídeos) para a IA

**Backend (`backend/src/media/`):**
- `MediaFile` entity — tabela `media_files`: id, name (unique), url, storagePath, mimeType, size, createdAt, updatedAt
- `MediaService`:
  - `upload(file, name)` → verifica unicidade, sobe para Supabase Storage, salva no banco
  - `findByName(name)` → usado pela IA para resolver nome → URL pública
  - `rename(id, newName)` → atualiza só o nome no banco (arquivo no Storage não muda)
  - `delete(id)` → remove do Storage e do banco (continua mesmo se Storage falhar)
- `MediaController`:
  - `POST /media/upload` — multipart, limite 50MB, campo `file` + campo `name`
  - `GET /media` — lista todas ordenadas por data
  - `PATCH /media/:id/rename` — renomeia (body: `{ name }`)
  - `DELETE /media/:id`

**Correção crítica — endpoint uazapi de envio de mídia:**
- Payload correto: `{ number, file: url, type, text: caption, delay }`
- ⚠️ Estava errado: `{ number, url, type, caption }` → 500 na uazapi

**Frontend (`MediaPage.jsx`):**
- Drag & drop + file picker + nome obrigatório
- Grid com preview: imagem → `<img>`, vídeo → ícone Play
- Clique → modal com `<video autoPlay controls>` ou `<img>` em tela cheia
- Renomear inline: lápis aparece no hover → input + Enter/Check/Esc para confirmar/cancelar
- Delete com modal de confirmação

---

### Agente MegaHair — "Lindona"

**Novo método `processMessageMegaHair(lead, incomingText, availableMediaNames[])` em `ai.service.ts`**

**Identidade:**
- Nome: Lindona, trabalha na Cabelô
- Tom: afetivo, usa "vc", "minha lindona", "amorzinho", como uma amiga
- Loja: Rua Clóvis Spínola, nº 40 - Shopping Orixás Center, Politeama, Salvador/BA
- Entrega Correios para todo o Brasil
- Cabelos 100% humanos vietnamitas

**Fluxo:**
1. Boas-vindas + nome + o que está procurando
2. Pergunta se já usa mega hair
   - JÁ USA → tag `qualificado` aplicada + stage `lead_quente` → vai para apresentação
   - NUNCA USOU → pergunta o que quer mudar
3. Oferece vídeo proativamente (action=none nesta msg)
4. Quando cliente confirma → envia vídeo (action=send_media), reply é a LEGENDA, não uma nova pergunta
5. Pós-vídeo → pergunta se quer ver outro ou combinar aplicação

**Formatação de nomes de mídia:**
- `formatDisplay("vietnamita-01")` → `"Vietnamita"` (remove partes puramente numéricas, capitaliza)
- `formatDisplay("cacheado-60cm")` → `"Cacheado 60cm"`
- Na conversa: exibe nome formatado. Em `mediaName` do JSON: usa id exato do banco
- Prompt mostra mapeamento: `"Vietnamita → "vietnamita-01""`

**Seleção de vídeo:**
- 1 vídeo disponível → envia direto
- Vários → lista opções e pergunta qual quer ver
- Quando cliente escolhe → identifica id exato → `action="send_media"`, `mediaName="id-exato"`

**Envio no `evolution.controller.ts`:**
```typescript
if (aiResponse.action === 'send_media' && aiResponse.mediaName) {
  const mediaFile = await this.mediaService.findByName(aiResponse.mediaName);
  if (mediaFile) {
    const type = mediaFile.mimeType?.startsWith('video/') ? 'video' : 'image';
    await this.uazapiProvider.sendMediaByUrl(phone, mediaFile.url, type, aiResponse.reply);
    await this.leadsService.saveMessage(conversation.id, 'outbound', 'ai', `[mídia: ${mediaFile.name}] ${aiResponse.reply}`);
    return;
  }
}
```

---

### Tags em Respostas Normais (não apenas shouldIgnore)

**Problema anterior:** tags só eram processadas quando `shouldIgnore=true` (leads sendo silenciados).

**Correção (`evolution.controller.ts`):**
```typescript
const normalTags = (aiResponse.tags ?? []).filter(t => t);
if (normalTags.length > 0) {
  const existingLabels: string[] = lead.labels ?? [];
  const newTags = normalTags.filter(t => !existingLabels.includes(t));
  if (newTags.length > 0) {
    await this.applyTagsToLead(phone, newTags);
    const mergedLabels = Array.from(new Set([...existingLabels, ...newTags]));
    await this.leadsService.update(lead.id, { labels: mergedLabels } as any);
  }
}
```

**Fix token em `applyTagsToLead`:**
- Estava usando `configService.get('UAZAPI_TOKEN')` → 401 porque token veio do env, não do banco
- Corrigido para `await this.whatsappConfigService.getActiveToken()`

**Tag `qualificado` (verde, color=5):**
- Aplicada automaticamente quando lead diz que já usa mega hair
- Visível no kanban + filtrável no Envio em Massa para follow-up

---

### Filtro por Etiquetas no Envio em Massa

**`BulkMessagePage.jsx` — nova seção ETIQUETAS nos filtros:**
- Exibe todas as etiquetas únicas presentes nos leads (`leads.flatMap(l => l.labels ?? [])`)
- Botões roxos com prefixo 🏷
- Lógica: **etiqueta tem prioridade** sobre stage/temperatura
  - Lead com etiqueta selecionada → sempre aparece (independente de stage/temp)
  - Lead sem etiqueta → aplica filtros de stage e temperatura normalmente
- Uso típico: clicar em "qualificado" → lista todos que já usam mega hair → selecionar todos → enviar follow-up

---

### SettingsPage — Fluxo de Criação de Instância

**Novo fluxo de inicialização:**
1. Tenta buscar `GET /instance/config`
2. Se null (sem instância) → exibe formulário de criação com campo nome
3. `POST /admin/instance { name }` → cria + configura webhook automaticamente
4. Se instância existe → comportamento normal (connect/disconnect/status)

**Seleção de agente por instância:**
- Card "Tipo de Agente": botões Fisioterapia / Mega Hair
- Salva via `PATCH /instance/config { agentType: 'fisio'|'megahair' }`
- Roteamento no webhook usa este campo para decidir qual prompt usar

---

## Pendências Futuras

### 0. Envio de Vídeo na Conversa com a IA
**Status:** ✅ Implementado (14/05/2026)  
Ver seção "Sistema de Mídias" e "Agente MegaHair" acima.

---

### 1. Lembrete de Consulta 1 Dia Antes
**Status:** ⏳ Pendente  
**Objetivo:** Enviar lembrete automático 1 dia antes da consulta e coletar confirmação do paciente  
**Implementação Necessária:**
- **Job/Scheduler:**
  - Bull Queue ou cron diário (ex: 09:00)
  - Busca leads com `appointmentAt` = amanhã
  - Envia mensagem de lembrete
  - Flag `reminderSent` para não enviar 2x
- **Fluxo de resposta:**
  - Se paciente responder "sim" → salva `reminderConfirmed=true` → consulta mantida
  - Se responder "não" (ou algo diferente de "sim") → remove do Google Calendar → limpa `appointmentAt` → responde "Quer agendar para outro dia?" → volta stage de agendamento
- **Opção de implementação:**
  - ✅ Simples: resposta por texto ("sim" ou "não")
  - 🔲 Com Quick Reply buttons: uazapi suporta botões no WhatsApp (avaliar depois se vale a pena)
- **Mensagem modelo:** "Oi {nome}! 👋 Lembrando que sua consulta está marcada para amanhã às {hora}. Confirma que vai dar?"

---

### 2. Otimização do Prompt de Venda com SPIN Selling
**Status:** ⏳ Pendente  
**Objetivo:** Melhorar a qualificação de leads e conversão de vendas para nicho específico (Fisioterapia)  
**Estratégia:** Implementar framework SPIN Selling (Situation, Problem, Implication, Need-Payoff) no system prompt
- Refatorar `buildSystemPrompt()` para injeta estrutura SPIN na qualificação
- Treinar Sofia para fazer perguntas de diagnóstico baseadas em SPIN
- Aumentar temperatura (lead_quente) baseado em respostas de implicação
- Testar com leads reais antes/depois

### 2. Follow-up Automático de 7 Dias de Cadência
**Status:** ⏳ Pendente  
**Objetivo:** Re-engajar leads que não avançaram (lead_frio) com série de 7 mensagens em cadência automática  
**Implementação Necessária:**
- Adicionar campo `nurtureCadenceDay` em `Conversation` (0-7, incrementa a cada dia)
- Job/scheduler (Bull Queue ou cron) que roda diariamente e identifica leads elegíveis (`lead_frio` + `lastMessageAt` > 24h)
- Template de 7 mensagens SPIN progressivas (escalação de interesse)
- Mensagem 1 (dia 1): Reengagement + pergunta Situation
- Mensagem 2-3: Problem discovery (perguntas de dor)
- Mensagem 4-5: Implication (consequências)
- Mensagem 6-7: Need-Payoff (benefícios da consulta)
- Webhook de reativação: se lead responder durante cadência, reseta contador e volta para qualificação ativa
- Métricas: taxa de reativação por dia, por template

---

### 3. Desativar `synchronize: true` e migrar para Migrations do TypeORM
**Status:** ⏳ Pendente — **CRÍTICO antes de virar SaaS multi-tenant**
**Risco atual:** `app.module.ts` está com `synchronize: true` em produção (Railway). Qualquer alteração em entidade (`@Column`, `@Entity`, etc) altera o schema do banco automaticamente no deploy — pode causar perda de dados ou inconsistências.

**Implementação Necessária:**
- Trocar `synchronize: true` → `synchronize: false` em `app.module.ts`
- Criar `datasource.ts` na raiz do backend para CLI do TypeORM
- Gerar migration inicial com o schema atual: `typeorm migration:generate -d datasource.ts InitialSchema`
- Adicionar scripts no `package.json`:
  - `migration:generate` — gera migration baseada nas mudanças das entidades
  - `migration:run` — aplica migrations pendentes
  - `migration:revert` — desfaz última migration
- Configurar deploy no Railway para rodar `migration:run` antes de subir o backend
- Documentar fluxo: alterar entidade → gerar migration → revisar SQL → commit → deploy roda migration

**Por que é crítico para SaaS:**
- Multi-tenant exige controle absoluto do schema (alterações precisam ser auditáveis e reversíveis)
- Sem migrations, não dá pra fazer rollback de mudanças de schema
- Quando tiver vários clientes, alterar schema sem controle pode quebrar produção

---

## 🎯 Feature Planejada: MQL → Meta CAPI (Andromeda)

**Contexto:** Anúncios Click to WhatsApp (CTWA) — lead clica no anúncio, abre WhatsApp, conversa com Sofia. Não há formulário, então nenhum evento é enviado ao Meta no clique. O evento só faz sentido quando o lead qualifica.

**Como funciona:**
- Meta gera um `ctwaClid` (Click to WhatsApp Click ID) na primeira mensagem do lead
- Esse ID fica no payload do webhook: `message.referral.ctwaClid`
- Quando Sofia classifica o lead como `lead_quente`, dispara evento `Lead` no CAPI com o `ctwaClid`
- A IA do Meta (Andromeda) atribui a conversão ao anúncio correto e aprende o perfil de quem qualifica
- Resultado: Meta passa a entregar o anúncio para perfis similares aos leads que qualificam (MQL), não a qualquer pessoa que clica

**Fluxo técnico:**
```
Clique no anúncio (Meta gera ctwaClid)
  → Primeira mensagem chega no webhook Evolution/uazapi
  → Extrair referral.ctwaClid + referral.sourceId do payload
  → Salvar ctwaClid no lead (campo novo na entidade)
  → Sofia qualifica → stage = lead_quente
  → CAPI envia evento "Lead" com ctwaClid + phone hash + email hash
  → Andromeda atribui e otimiza ✅
```

**O que implementar:**
- [ ] Extrair `ctwaClid` da primeira mensagem em `evolution.controller.ts`
- [ ] Adicionar campo `ctwaClid` na entidade Lead
- [ ] Criar migration para o novo campo
- [ ] Quando stage mudar para `lead_quente` → chamar `FacebookService.sendLeadEvent()` com ctwaClid
- [ ] `FacebookService` aceitar ctwaClid como parâmetro de atribuição (substitui fbclid)

**Valor como feature SaaS:**
- Diferencial competitivo forte: integração CAPI + MQL automático via IA
- Reduz CPL (custo por lead) treinando o Meta com sinais de qualidade
- Pode ser vendido como "Integração Andromeda" — aumenta inteligência do anúncio do cliente
- Aplicável a qualquer nicho que use Click to WhatsApp + qualificação por IA
