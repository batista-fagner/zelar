# CLAUDE.md — zelar

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é este projeto

CRM com IA para a **Zelar** — empresa de cuidados domiciliares, hospitalares, cursos de cuidador e suporte jurídico previdenciário em São Mateus/ES. Recebe mensagens WhatsApp via uazapi, processa com a agente **LIA** e exibe Kanban em tempo real.

Projeto copiado do fisio-secretary. **Refatorado em 2026-06-10** para agente único (LIA) — toda a lógica de múltiplos agentes (Clara/Sofia/Lindona), Google Calendar e agendamentos foi removida. O foco atual é o **Fluxo 3 (Curso de Cuidador)** do documento `fluxo_zelar.docx`.

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

GEMINI_API_KEY=...       # fallback da IA (Gemini 2.5 Flash Lite)
OPENROUTER_API_KEY=...   # IA principal (gpt-oss-120b:free)
OPENAI_API_KEY=...       # ainda usado por STT (Whisper) e TTS (tts-1-hd)
ELEVENLABS_API_KEY=...   # TTS alternativo — $6/mês, melhor qualidade, plano pago necessário
ELEVENLABS_VOICE_ID=PznTnBc8X6pvixs9UkQm
```

**Frontend (.env):**
```env
VITE_API_URL=http://localhost:3001
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
PIX:    action="send_media", mediaName="pix-cora" (imagem do banco) → aguardando_pagamento
Débito/Crédito: link InfinitePay → aguardando_pagamento
Boleto: contato Lícia → aguardando_pagamento
  ↓
IA PAUSA (toggleAi false) — operador confirma manualmente
  ↓
Operador clica "Confirmar Pagamento" no card (raia aguardando_pagamento)
  → POST /leads/:id/confirm-payment
  → stage=pagamento_confirmado, reativa IA, LIA envia link do Google Forms automaticamente
  ↓
Lead preenche → avisa → stage=matriculado
```

### Confirmação manual de pagamento
- **Sem integração de checkout automático** — operador confirma tudo manualmente (decisão de escopo MVP)
- Botão "Confirmar Pagamento" aparece no `LeadCard.jsx` só quando `stage === 'aguardando_pagamento'`
- Endpoint `POST /leads/:id/confirm-payment` em `leads.controller.ts`: muda stage, reativa IA, dispara mensagem da LIA com o formulário
- `LeadsModule` ↔ `EvolutionModule` usam `forwardRef()` (dependência circular)

### Envio de imagem (PIX)
- Imagem do PIX deve estar cadastrada em mídias com nome exato **`pix-cora`**
- Prompt usa instrução técnica estruturada: `→ action="send_media", mediaName="pix-cora"` (Gemini Lite não entende instrução em linguagem natural livre)

### Número WhatsApp da Zelar: `27996972230` (instância: Batista Solucao IA)

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
- ✅ Envio de imagem do PIX via mídia cadastrada (`pix-cora`)
- ✅ **Integração InfinitPay** — cartão gera link automático via `POST /api.checkout.infinitepay.io/links`
  - `order_nsu = lead.id` para rastrear quem pagou
  - Webhook `POST /webhooks/infinitpay` valida com `/payment_check` e confirma automaticamente
  - Página de redirecionamento pós-pagamento (`GET /webhooks/infinitpay/redirect`) com botão WhatsApp
  - Sem token/API key — autenticação só pelo `handle` no body
  - Boleto: permanece manual (Lícia), aplica etiqueta 🧾 **boleto** no card
- ✅ Botão "Confirmar Pagamento" no card com **modal de confirmação** + endpoint `POST /leads/:id/confirm-payment`
- ✅ IA pausa após enviar pagamento, retoma automática após confirmar
- ✅ Kanban com 6 colunas do fluxo Zelar
- ✅ STT via uazapi (Whisper) — sempre responde em **texto** mesmo quando lead manda áudio
- ✅ Isolamento de instâncias (global webhook desativado + validação de token)
- ✅ Supabase isolado (banco separado do fisio-secretary)
- ✅ Prompt da LIA editável na página de Settings (`customPromptLia`) — botão "Restaurar padrão" removido
- ✅ `DEFAULT_PROMPT_LIA` no código sincronizado com o prompt do banco (2026-06-11)
- ✅ Instância conectada: `27996972230` (Batista Solucao IA)
- ✅ `LeadStage` atualizado com stages reais: `aguardando_pagamento | pagamento_confirmado | matriculado`
- ✅ `OPENAI_API_KEY` adicionada ao `.env` (necessária para transcrição Whisper via uazapi)

---

## Pendências

- [ ] Cadastrar imagem `pix-cora` nas mídias (se ainda não estiver)
- [ ] Preencher dados reais no prompt do Fluxo 3: carga horária e modalidade (valor já está R$ 500,00)
- [ ] **Fluxo 1 (Cuidador domiciliar/hospitalar)** — próximo foco
  - LIA coleta dados + classifica Simples/Médio/Complexo automaticamente
  - 8 imagens de catálogo para cadastrar nas mídias
  - Pagamento via InfinitPay (já integrado)
  - Seleção de cuidador: MVP manual pelo operador; Fase 2 → broadcast com botão + Google Agenda
- [ ] Fluxos 2 (trabalhar) e 4 (jurídico) — já no prompt, só testar
- [ ] Drag-and-drop no Kanban para mover cards manualmente entre colunas
- [ ] Fase 2 Fluxo 1: tabela de cuidadores + broadcast com botão WhatsApp (quem apertar primeiro leva) + consulta Google Agenda para disponibilidade
