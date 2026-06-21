# CLAUDE.md — zelar

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é este projeto

CRM com IA para a **Zelar** — empresa de cuidados domiciliares, hospitalares, cursos de cuidador e suporte jurídico previdenciário em São Mateus/ES. Recebe mensagens WhatsApp via uazapi, processa com a agente **LIA** e exibe Kanban em tempo real.

Projeto copiado do fisio-secretary. **Refatorado em 2026-06-10** para agente único (LIA) — toda a lógica de múltiplos agentes (Clara/Sofia/Lindona), Google Calendar e agendamentos foi removida. O foco atual é o **Fluxo 3 (Curso de Cuidador)** do documento `fluxo_zelar.docx`.

**Deploy em produção (2026-06-17):** backend no Railway (`zelar-production.up.railway.app`), frontend no Vercel.

---

## Stack

- **Backend:** NestJS 11, TypeORM, PostgreSQL (Supabase separado do fisio-secretary), porta **3001**
- **Frontend:** React + Vite + Tailwind, porta **5175** (pode subir em 5173/5175 — não importa, o que vale é `VITE_API_URL`)
- **IA:** **OpenRouter** (`openai/gpt-oss-120b:free`) como principal + **Gemini 2.5 Flash Lite** como fallback automático
- **STT:** OpenAI Whisper via uazapi (`/message/download` com `transcribe: true`)
- **TTS:** OpenAI `tts-1-hd`, voz `shimmer` — só responde em áudio quando o lead mandar áudio
- **WhatsApp:** uazapi (`UAZAPI_BASE_URL=https://labsai.uazapi.com`)
- **Realtime:** Socket.io (WebSocket)

### LLM — Estratégia de fallback (`ai.service.ts`)
```
Mensagem → 1º OpenRouter (gpt-oss-120b:free, via axios REST — SDK é ESM-only, incompatível)
            ↓ erro HTTP OU body com .error (modelos free caem por uptime, retornam 200 com erro dentro)
          2º Gemini 2.5 Flash Lite (@google/generative-ai)
            ↓ erro
          fallback texto "probleminha, pode repetir?"
```
- Métodos privados: `callOpenRouter()` e `callGemini()`; orquestração em `processMessageLia()`
- Logs identificam o modelo usado: `[LIA/OpenRouter]` / `[LIA/Gemini]` + aviso `⚠️ OpenRouter falhou — caindo para Gemini`
- Usuário não percebe a troca
- Gemini Flash Lite segue melhor instruções **estruturadas** (JSON, `→ action=`); linguagem natural livre funciona pior nele que no Flash normal

---

## Como rodar

```bash
# Backend
cd zelar/backend
npm install
npm run start:dev   # porta 3001

# Frontend
cd zelar/frontend
npm install
npm run dev         # porta 5175
```

Ngrok para expor o webhook:
```bash
ngrok http 3001
# Atualizar SERVER_URL no .env com a URL gerada
```

---

## Variáveis de ambiente (backend/.env)

```env
SUPABASE_DATABASE_URL=postgresql://postgres.hzurwsbacvhcmochhnmk:...@aws-1-us-east-2.pooler.supabase.com:5432/postgres
SUPABASE_URL=https://hzurwsbacvhcmochhnmk.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_STORAGE_BUCKET=zelar-media

SERVER_URL=https://zelar-production.up.railway.app  # produção Railway

WHATSAPP_PROVIDER=uazapi
UAZAPI_BASE_URL=https://labsai.uazapi.com
UAZAPI_ADMIN_TOKEN=...   # para criar/gerenciar instâncias via Settings
UAZAPI_TOKEN=...         # fallback — token da instância (salvo no banco após conectar)
OPERATOR_PHONES=5527997885752  # mensagens desse número são ignoradas pela IA

GEMINI_API_KEY=...       # fallback da IA (Gemini 2.5 Flash Lite)
OPENROUTER_API_KEY=...   # IA principal (gpt-oss-120b:free)
OPENAI_API_KEY=...       # STT (Whisper) e TTS (tts-1-hd)

INFINITPAY_HANDLE=zelarsaudeecuidado   # handle InfinitPay da cliente
INFINITPAY_COURSE_PRICE=50000          # valor em centavos (R$ 500,00)
INFINITPAY_COURSE_NAME=Curso de Cuidador Zelar
```

**Frontend (.env / Vercel):**
```env
VITE_API_URL=https://zelar-production.up.railway.app
```

---

## Agente LIA (único)

Agente único da Zelar. Prompt padrão em `ai.service.ts` (`DEFAULT_PROMPT_LIA`), editável pelo operador na página Settings → salvo em `whatsapp_config.custom_prompt_lia` (banco vazio = usa o default do código).

Roteamento em `evolution.controller.ts` → `processMessage()` → sempre chama `aiService.processMessageLia()`.

A LIA cobre 4 fluxos no prompt (do `fluxo_zelar.docx`):
1. **Cuidador** (domiciliar/hospitalar) — não implementado em detalhe ainda
2. **Trabalhar como cuidador** — branch certificado sim/não
3. **Curso de cuidador** ⭐ FOCO ATUAL
4. **Jurídico** — encaminha para Lícia (33) 99544-5488

### Stages do Kanban (6 colunas — `frontend/src/data/mockData.js`)
```
novo_lead → em_atendimento → aguardando_pagamento → pagamento_confirmado → matriculado | perdido
```

### Fluxo 3 — Curso de Cuidador (implementado)
```
Boas-vindas → apresenta curso ([NEXT] separa blocos) → forma de pagamento
  ↓
PIX:    action="send_media", mediaName="pix-cora" → envia imagem + dados PIX ([NEXT]) → aguardando_pagamento
        IA pausa (toggleAi false) — operador confirma manualmente
Cartão: action="aguardar_confirmacao_pagamento" → gera link InfinitPay automático → aguardando_pagamento
        IA pausa (toggleAi false)
Boleto: action="aguardar_boleto" → LIA diz para aguardar + notifica operador (5527997885752) via WhatsApp
        Operador emite e envia boleto manualmente → aguardando_pagamento
  ↓
Operador clica "Confirmar Pagamento" no card (raia aguardando_pagamento)
  → POST /leads/:id/confirm-payment
  → stage=pagamento_confirmado, reativa IA, LIA envia link do Google Forms automaticamente
  ↓
Follow-up automático (configurável em Settings): após X minutos pergunta se preencheu o formulário
  ↓
Lead preenche → avisa → stage=matriculado
```

### Confirmação manual de pagamento
- Botão "Confirmar Pagamento" aparece no `LeadCard.jsx` só quando `stage === 'aguardando_pagamento'`
- Endpoint `POST /leads/:id/confirm-payment` em `leads.controller.ts`: muda stage, reativa IA, dispara formulário
- `LeadsModule` ↔ `EvolutionModule` usam `forwardRef()` (dependência circular)
- **InfinitPay** confirma cartão automaticamente via webhook `POST /webhooks/infinitpay`
- **Boleto**: manual — operador recebe notificação WhatsApp e envia boleto diretamente ao cliente

### Follow-up automático
- Configurável em Settings: tempo (30min/1h/2h/3h) + mensagem personalizada
- Job roda a cada 5min — dispara para leads em `pagamento_confirmado` sem `followupSentAt`
- Enviado **uma única vez** por lead
- Campos no banco: `whatsapp_config.followup_delay_minutes`, `whatsapp_config.followup_message`, `leads.followup_sent_at`

### Actions do prompt LIA
- `send_media` + `mediaName="pix-cora"` → envia imagem + blocos [NEXT] extras
- `aguardar_confirmacao_pagamento` → gera link InfinitPay (cartão)
- `aguardar_boleto` → notifica operador (boleto manual)
- `none` → resposta normal de texto

### Proteção de stage
- IA só **avança** stage — nunca regride
- Regressão é exclusiva do operador via drag-and-drop no Kanban
- Nome do lead só é atualizado se ainda não tem nome (evita sobrescrever por terceiros)

### Filtro de operadores (`OPERATOR_PHONES`)
- Mensagens recebidas de números listados são ignoradas pela IA
- Número atual: `5527997885752` (operadora da Zelar)

### Envio de imagem (PIX)
- Imagem cadastrada em mídias com nome exato **`pix-cora`**
- Reply da IA contém legenda + [NEXT] + dados PIX — o backend separa e envia em blocos
- Blocos filtram descrições de imagem geradas pela IA (`📎`, `[imagem...`)

### Número WhatsApp da Zelar: `27999234193` (instância conectada em produção)
### Operadora: `27997885752` — recebe notificações de boleto e é filtrada pelo `OPERATOR_PHONES`

---

## Webhook — Isolamento de instâncias

**Problema histórico:** O uazapi tem um **global webhook** (conta-nível) que manda mensagens de TODAS as instâncias para uma URL. Quando estava ativo apontando para o ngrok, mensagens do fisio-secretary (cabelo) chegavam aqui.

**Solução aplicada:**
1. Global webhook desativado: `DELETE /admin/global-webhook`
2. Validação de instância adicionada em `evolution.controller.ts` — rejeita tokens de instância diferentes do configurado no banco

**Verificar global webhook:**
```bash
curl http://localhost:3001/admin/global-webhook
# Deve retornar "enabled": false, "url": ""
```

**Se o problema reaparecer (mensagens de outra instância chegando aqui):**
```bash
curl -X DELETE http://localhost:3001/admin/global-webhook
```

**Separação de webhooks:**
- fisio-secretary (Railway): `https://kanbam-ia-whatsapp-production.up.railway.app/webhooks/uazapi`
- zelar/Zelar (ngrok): `https://flashy-nonaesthetical-emory.ngrok-free.app/webhooks/uazapi`

---

## TTS — Resposta em Áudio

- **Quando:** só quando o lead mandar áudio (rastreado por `lastMessageWasAudio` Map no controller)
- **Modelo:** OpenAI `tts-1-hd`, voz `shimmer`
- **Fallback:** se TTS falhar, responde em texto
- **ElevenLabs:** código comentado em `audio.service.ts` — melhor qualidade mas requer plano pago ($6/mês)
- Pré-processamento do texto: remove emojis, converte datas/horas/valores para extenso antes de enviar para TTS

---

## Estrutura relevante

```
zelar/
├── backend/src/
│   ├── evolution/
│   │   ├── evolution.controller.ts    ← webhook /webhooks/uazapi + processMessage()
│   │   ├── evolution.service.ts       ← sendTextMessage, sendAudioMessage, transcribeAudio
│   │   ├── message-queue.service.ts   ← debounce 10s por phone
│   │   ├── admin.controller.ts        ← /admin/global-webhook (GET, POST, DELETE)
│   │   ├── instance.controller.ts     ← /instance/connect, /instance/config
│   │   ├── whatsapp-config.service.ts ← createNewInstance, setupAfterConnect, updateConfig
│   │   └── providers/uazapi.provider.ts
│   ├── audio/
│   │   └── audio.service.ts           ← transcribe() via Whisper, textToSpeech() via OpenAI tts-1-hd
│   ├── ai/
│   │   └── ai.service.ts              ← processMessageLia() + callOpenRouter() + callGemini() (fallback)
│   ├── leads/
│   │   ├── leads.service.ts
│   │   ├── leads.controller.ts        ← POST /leads/:id/confirm-payment
│   │   └── leads.gateway.ts           ← WebSocket emit lead:updated / lead:deleted
│   └── common/entities/
│       ├── lead.entity.ts             ← LeadStage: novo_lead|em_atendimento|aguardando_pagamento|pagamento_confirmado|matriculado|perdido
│       └── whatsapp-config.entity.ts  ← instanceToken, customPromptLia (agentType e prompts antigos removidos)
├── frontend/src/
│   ├── pages/
│   │   ├── KanbanPage.jsx
│   │   ├── SettingsPage.jsx           ← edição do prompt da LIA (customPromptLia)
│   │   └── LandingPage.jsx            ← rota /landing — LP pública da Zelar
│   ├── components/LeadCard.jsx        ← botão "Confirmar Pagamento" (stage aguardando_pagamento)
│   ├── data/mockData.js               ← COLUMNS com os 6 estágios
│   └── hooks/useLeads.js              ← WebSocket + fetch
```

---

## Funcionalidades implementadas

- ✅ Agente único LIA (OpenRouter principal + Gemini Flash Lite fallback automático)
- ✅ **Fluxo 3 (Curso de Cuidador)** completo: apresentação → pagamento → confirmação → matrícula
- ✅ PIX: envia imagem `pix-cora` + dados bancários em blocos [NEXT] separados
- ✅ **Integração InfinitPay** — cartão gera link automático (`handle=zelarsaudeecuidado`)
  - `order_nsu = lead.id` para rastrear quem pagou
  - Webhook `POST /webhooks/infinitpay` valida com `/payment_check` e confirma automaticamente
  - Página de redirecionamento pós-pagamento com botão WhatsApp
- ✅ **Boleto manual**: action `aguardar_boleto` — LIA avisa cliente, operadora recebe notificação WhatsApp
- ✅ **Follow-up automático** após pagamento confirmado — tempo e mensagem configuráveis em Settings
- ✅ Botão "Confirmar Pagamento" no card com modal de confirmação
- ✅ IA só avança stage — regressão exclusiva do operador no Kanban
- ✅ Nome do lead protegido contra sobrescrita por terceiros
- ✅ Filtro `OPERATOR_PHONES` — IA ignora mensagens do número da operadora
- ✅ LeadModal atualiza mensagens em tempo real via WebSocket (`lead:updated`)
- ✅ Kanban com 6 colunas do fluxo Zelar
- ✅ STT via uazapi (Whisper)
- ✅ Isolamento de instâncias (global webhook desativado + validação de token)
- ✅ Supabase isolado (banco separado do fisio-secretary)
- ✅ Prompt da LIA editável na página de Settings (`customPromptLia`)
- ✅ Deploy em produção: Railway (backend) + Vercel (frontend)

---

## Pendências

- [ ] **Fluxo 1 (Cuidador domiciliar/hospitalar)** — próximo foco
  - LIA coleta dados + classifica Simples/Médio/Complexo automaticamente
  - 8 imagens de catálogo para cadastrar nas mídias
  - Pagamento via InfinitPay (já integrado)
  - Seleção de cuidador: MVP manual pelo operador
- [ ] Fluxos 2 (trabalhar) e 4 (jurídico) — já no prompt, só testar
- [ ] Drag-and-drop no Kanban para mover cards manualmente entre colunas
