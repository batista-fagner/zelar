# CLAUDE.md — converthair

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é este projeto

CRM com IA para a **Zelar** — empresa de cuidados domiciliares e hospitalares. Recebe mensagens WhatsApp via uazapi, processa com a agente **Clara** (OpenAI GPT-4o-mini) e exibe Kanban em tempo real.

Projeto copiado do fisio-secretary e adaptado para suportar múltiplos agentes. O agente ativo é configurado por instância no banco.

---

## Stack

- **Backend:** NestJS 11, TypeORM, PostgreSQL (Supabase separado do fisio-secretary), porta **3001**
- **Frontend:** React + Vite + Tailwind, porta **5175**
- **IA:** OpenAI GPT-4o-mini (Clara/Zelar), Anthropic Claude (Sofia/Fisio)
- **STT:** OpenAI Whisper via uazapi (`/message/download` com `transcribe: true`)
- **TTS:** OpenAI `tts-1-hd`, voz `shimmer` — só responde em áudio quando o lead mandar áudio
- **WhatsApp:** uazapi (`UAZAPI_BASE_URL=https://labsai.uazapi.com`)
- **Realtime:** Socket.io (WebSocket)

---

## Como rodar

```bash
# Backend
cd converthair/backend
npm install
npm run start:dev   # porta 3001

# Frontend
cd converthair/frontend
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
SUPABASE_DATABASE_URL=postgresql://postgres:3WMzt8RkWAHlBnFt@db.hzurwsbacvhcmochhnmk.supabase.co:5432/postgres
SUPABASE_URL=https://hzurwsbacvhcmochhnmk.supabase.co
SUPABASE_ANON_KEY=placeholder
SUPABASE_SERVICE_ROLE_KEY=placeholder
SUPABASE_STORAGE_BUCKET=zelar-media

PORT=3001
SERVER_URL=https://flashy-nonaesthetical-emory.ngrok-free.app  # atualizar quando ngrok reiniciar

WHATSAPP_PROVIDER=uazapi
UAZAPI_BASE_URL=https://labsai.uazapi.com
UAZAPI_ADMIN_TOKEN=dUVjbKKElU68hEwynKyfw1CDi9emSQ11Ja3DD7BRkw2Rd9bfmo

OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
ELEVENLABS_API_KEY=...   # TTS alternativo — $6/mês, melhor qualidade, plano pago necessário
ELEVENLABS_VOICE_ID=PznTnBc8X6pvixs9UkQm
```

**Frontend (.env):**
```env
VITE_API_URL=http://localhost:3001
```

---

## Agentes disponíveis

Configurado via `agentType` na tabela `whatsapp_configs`:

| agentType | Agente | Modelo | Empresa |
|-----------|--------|--------|---------|
| `zelar`   | Clara  | GPT-4o-mini | Zelar (cuidadores) |
| `megahair`| Lindona | GPT-4o-mini | Cabelô (mega hair) |
| `fisio`   | Sofia  | Claude Haiku | Fisioterapia |

Roteamento em `evolution.controller.ts` → `processMessage()`.

---

## Zelar — Agente Clara

### Dois funis detectados na primeira mensagem:
- **FUNNEL_FAMILIA** — família quer contratar cuidador
- **FUNNEL_CUIDADOR** — pessoa quer se tornar cuidador (curso R$ 490, 3 meses online)

### Stages do Kanban (simplificados — apenas 4):
```
novo_lead → agendado → convertido | perdido
```
- `novo_lead`: contato ativo, Clara qualificando e coletando info
- `agendado`: avaliação gratuita confirmada (action="schedule" + confirmação explícita)
- `convertido`: serviço ativo (movido manualmente pela equipe)
- `perdido`: sem interesse

> ⚠️ Estágios `qualificando`, `lead_quente`, `lead_frio` foram removidos intencionalmente. Não reintroduzir — causavam desaparecimento de cards no Kanban.

### Regra de agendamento (dois passos obrigatórios):
- **PASSO A** (`action="none"`, `stage="novo_lead"`): Clara coleta data/período e apresenta proposta
- **PASSO B** (`action="schedule"`, `stage="agendado"`): só após confirmação explícita ("sim", "pode", "ok")

### Número WhatsApp da Zelar: `27996972230`

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
- converthair/Zelar (ngrok): `https://flashy-nonaesthetical-emory.ngrok-free.app/webhooks/uazapi`

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
converthair/
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
│   │   └── ai.service.ts              ← processMessageClara(), processMessageMegaHair(), processMessage()
│   ├── leads/
│   │   ├── leads.service.ts
│   │   └── leads.gateway.ts           ← WebSocket emit lead:updated / lead:deleted
│   └── common/entities/
│       ├── lead.entity.ts             ← LeadStage: 'novo_lead'|'agendado'|'convertido'|'perdido'
│       └── whatsapp-config.entity.ts  ← agentType, instanceToken, customPromptClara, etc.
├── frontend/src/
│   ├── pages/
│   │   ├── KanbanPage.jsx
│   │   ├── SettingsPage.jsx           ← seleção de agente + edição de prompt Clara/Zelar
│   │   └── LandingPage.jsx            ← rota /landing — LP pública da Zelar
│   ├── data/mockData.js               ← COLUMNS com os 4 estágios
│   └── hooks/useLeads.js              ← WebSocket + fetch
```

---

## Funcionalidades implementadas

- ✅ Agente Clara (Zelar) com dois funis (família / cuidador)
- ✅ TTS OpenAI tts-1-hd voz shimmer (resposta em áudio quando lead manda áudio)
- ✅ STT via uazapi (Whisper)
- ✅ Kanban com 4 colunas simplificadas
- ✅ Isolamento de instâncias (global webhook desativado + validação de token)
- ✅ Supabase isolado (banco separado do fisio-secretary)
- ✅ Prompt da Clara editável na página de Settings
- ✅ Landing page pública em `/landing`

---

## Pendências

- [ ] Conectar número 27996972230 ao uazapi (instância da Zelar)
- [ ] Drag-and-drop no Kanban para mover cards manualmente entre colunas
- [ ] Testar TTS com ElevenLabs quando plano pago for contratado ($6/mês)
