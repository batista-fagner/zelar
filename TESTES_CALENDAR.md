# Testes — Integração Google Calendar (Fase 3.5)

Casos de uso para simular via curl no webhook `POST /webhooks/evolution`.

**Número base para testes:** use sempre um número novo (não existente no banco) para garantir lead limpo.
**Data de referência:** testes escritos em 27/03/2026.

---

## Template de curl

```bash
curl -s -X POST http://localhost:3000/webhooks/evolution \
  -H "Content-Type: application/json" \
  -d '{
    "event": "messages.upsert",
    "data": {
      "key": { "remoteJid": "55XXXXXXXXXXX@s.whatsapp.net", "fromMe": false, "id": "ID_UNICO" },
      "message": { "conversation": "MENSAGEM AQUI" }
    }
  }'
```

---

## Grupo 1 — Agendamento feliz (caminho ideal)

### 1.1 Agendamento direto com data e hora exatas

**Cenário:** Lead já sabe o que quer e passa tudo de uma vez.

```
Lead: "Oi, sou a Mariana, tenho dor no ombro há 1 semana, quero agendar para amanhã às 10h, topo R$150"
```
**Esperado:**
- Sofia confirma data e hora → verifica Calendar → cria evento
- `calendarEventId` salvo no banco
- `appointmentAt` = amanhã 10h (horário de Brasília)
- Stage = `agendado`

---

### 1.2 Agendamento em etapas (fluxo normal de qualificação)

**Cenário:** Lead passa pelas 4 etapas da Sofia naturalmente.

```
Lead 1: "Oi quero agendar"
Sofia:  [pede nome]
Lead 2: "Me chamo Pedro, tenho dor lombar"
Sofia:  [pergunta urgência]
Lead 3: "Faz 2 semanas, tá insuportável"
Sofia:  [pergunta disponibilidade]
Lead 4: "Posso ir na quarta de manhã"
Sofia:  [informa valor e oferece agendamento]
Lead 5: "Sim, pode marcar"
Sofia:  [pede hora exata]
Lead 6: "Às 9h"
```
**Esperado:**
- Sofia só cria evento após ter data + hora confirmadas (msg 6)
- Etapas do `qualificationStep` sobem de 0 a 4

---

### 1.3 Lead com urgência alta — atalha a qualificação

**Cenário:** Lead em sofrimento, Sofia prioriza agendamento sem passar por todas as etapas.

```
Lead 1: "Caí de moto ontem, estou com dor fortíssima no quadril, preciso de urgência"
Sofia:  [deve pular etapas e ir direto ao agendamento]
Lead 2: "Posso ir hoje à tarde, às 15h"
```
**Esperado:**
- Score alto desde o início (urgência alta)
- Stage pode ir direto para `lead_quente` → `agendado`
- Evento criado para hoje às 15h

---

### 1.4 Agendamento para dia da semana relativo ("na sexta")

**Cenário:** Lead usa expressão relativa sem data exata.

```
Lead: "Quero ir na sexta às 14h"
```
**Esperado:**
- Sofia interpreta "sexta" = 28/03/2026 (próxima sexta a partir de 27/03)
- `appointmentDateTime` = `2026-03-28T14:00:00`
- Evento criado com data correta

---

### 1.5 Agendamento para "semana que vem"

```
Lead: "Pode ser na segunda da semana que vem às 11h?"
```
**Esperado:**
- Sofia interpreta semana que vem = 30/03/2026 (segunda)
- `appointmentDateTime` = `2026-03-30T11:00:00`

---

## Grupo 2 — Horário ocupado

### 2.1 Primeiro horário ocupado, segundo livre

**Cenário:** Lead pede horário já bloqueado no Calendar.

```
Lead 1: [qualificação rápida]
Lead 2: "Amanhã às 9h" (horário que você sabe que está ocupado no Calendar)
Sofia:  [deve bloquear e pedir outro]
Lead 3: "Então às 14h"
```
**Esperado:**
- Msg do sistema: "Esse horário está ocupado (...)"
- Segundo horário: verifica novamente → se livre, cria evento
- `calendarEventId` só é salvo no segundo horário

---

### 2.2 Dois horários seguidos ocupados

**Cenário:** Lead tenta dois horários e ambos estão bloqueados.

```
Lead: "Às 9h amanhã"   → ocupado
Lead: "Então às 10h"   → também ocupado
Lead: "E às 11h?"      → livre → agenda
```
**Esperado:**
- Sofia bloqueia as duas primeiras tentativas com mensagem diferente a cada vez
- Na terceira tenta cria o evento

---

### 2.3 Todos os horários da manhã ocupados

**Cenário:** Stress test de disponibilidade.

```
Lead: tenta 9h, 10h, 11h → todos ocupados
Lead: "Pode ser à tarde então, 14h?"
```
**Esperado:**
- Sofia sugere horários alternativos ou aceita a proposta da tarde
- Evento criado às 14h

---

## Grupo 3 — Cancelamento

### 3.1 Cancelamento simples

```
Lead: "Preciso cancelar minha consulta de amanhã"
```
**Esperado:**
- `calendarEventId` = null
- `appointmentAt` = null
- Evento removido do Google Calendar
- Sofia pergunta se deseja reagendar

---

### 3.2 Cancelamento e não quer reagendar

```
Lead 1: "Quero cancelar"
Sofia:  [cancela e pergunta se quer reagendar]
Lead 2: "Não, obrigado, vou resolver de outra forma"
```
**Esperado:**
- Stage = `perdido`
- Sofia responde com empatia e não insiste

---

### 3.3 Cancelamento com justificativa

```
Lead: "Não vou conseguir ir amanhã, tive um imprevisto no trabalho"
```
**Esperado:**
- Sofia reconhece o motivo, cancela o evento, pergunta se quer reagendar
- Mesmo resultado do 3.1

---

### 3.4 Tentativa de cancelar sem ter agendamento

**Cenário:** Lead que ainda não agendou tenta cancelar.

```
Lead: "Quero cancelar minha consulta"
```
(lead está em stage `qualificando`, sem `calendarEventId`)

**Esperado:**
- Sofia informa que não há agendamento confirmado
- Não quebra o sistema (`calendarEventId` null não gera erro)

---

## Grupo 4 — Reagendamento

### 4.1 Reagendamento simples

```
Lead 1: [já agendado para amanhã 10h]
Lead 2: "Preciso mudar minha consulta para quinta às 15h"
```
**Esperado:**
- `updateAppointment` chamado no Calendar (mesmo `calendarEventId`)
- `appointmentAt` atualizado no banco
- Evento atualizado no Google Calendar (não criado novo)

---

### 4.2 Reagendamento para horário ocupado

```
Lead: "Quero remarcar para sexta às 9h" (horário ocupado)
Sofia: [bloqueia, pede outro]
Lead: "Então sexta às 16h"
```
**Esperado:**
- Primeiro horário bloqueado com mensagem de conflito
- Segundo horário: `updateAppointment` executado com sucesso

---

### 4.3 Reagendar após cancelar (novo evento)

**Cenário:** Lead cancelou (sem `calendarEventId`), depois decide remarcar.

```
Lead 1: "Quero cancelar"          → cancela, calendarEventId = null
Lead 2: "Na verdade quero remarcar para segunda às 10h"
```
**Esperado:**
- Sofia coleta nova data + hora
- Como não há `calendarEventId`, cria novo evento (não tenta atualizar)
- Novo `calendarEventId` salvo

---

### 4.4 Reagendamento com linguagem informal

```
Lead: "Ei, posso mudar pra outro dia? Prefiro na terça"
Sofia: [pede hora exata]
Lead: "Às 11h"
```
**Esperado:**
- Sofia identifica intenção de reagendar mesmo sem palavras-chave exatas
- Coleta nova data e hora antes de executar

---

## Grupo 5 — Edge cases e comportamento da Sofia

### 5.1 Lead manda mensagem vaga sobre horário

```
Lead: "Quero ir amanhã de manhã"
```
**Esperado:**
- Sofia **não** confirma agendamento sem hora exata
- Pergunta: "Qual horário exato? (9h, 10h, 11h?)"
- Só agenda após receber hora específica

---

### 5.2 Lead manda "amanhã cedo"

```
Lead: "Pode ser amanhã cedo"
```
**Esperado:**
- Sofia não interpreta "cedo" como horário
- Pergunta hora exata antes de verificar Calendar

---

### 5.3 Lead diz o horário sem o dia

```
Lead: "Pode ser às 10h"
```
(sem mencionar qual dia)

**Esperado:**
- Sofia pergunta qual dia antes de confirmar
- Não agenda sem data completa

---

### 5.4 Lead demonstra desinteresse no meio da qualificação

```
Lead 1: "Oi quero agendar"
Lead 2: "Me chamo João, tenho dor no joelho"
Lead 3: "Na verdade tá bem, não preciso mais não"
```
**Esperado:**
- Stage = `perdido`
- Sofia responde com empatia, não insiste
- Nenhum evento criado no Calendar

---

### 5.5 Lead volta após ser marcado como perdido

```
Lead 1: "não preciso mais" → stage = perdido
Lead 2: (dias depois) "Oi, mudei de ideia, quero agendar"
```
**Esperado:**
- Sofia retoma o atendimento normalmente
- Stage avança novamente (não fica preso em `perdido`)

---

### 5.6 Mensagem não relacionada à clínica

```
Lead: "Oi, quanto custa um iPhone?"
```
**Esperado:**
- Sofia redireciona gentilmente para o contexto da clínica
- Não quebra a máquina de estados

---

## Grupo 6 — Validação de dados no banco

Após cada teste, verificar com:

```bash
# Estado do lead
curl -s http://localhost:3000/leads | jq '.[] | select(.phone=="55XXXXXXXXXXX") | {stage, appointmentAt, calendarEventId, qualificationStep, temperature}'

# Conversa completa
LEAD_ID=$(curl -s http://localhost:3000/leads | jq -r '.[] | select(.phone=="55XXXXXXXXXXX") | .id')
curl -s http://localhost:3000/leads/$LEAD_ID/conversation | jq '.messages[] | {direction, content}'

# Histórico de stages
curl -s http://localhost:3000/leads/$LEAD_ID/history | jq '.[] | {fromStage, toStage, changedBy}'
```

---

## Checklist geral

| # | Cenário | Resultado esperado | Testado |
|---|---------|-------------------|---------|
| 1.1 | Agendamento direto | Evento criado | ⬜ |
| 1.2 | Agendamento em etapas | Step 0→4, evento criado | ⬜ |
| 1.3 | Urgência alta | Atalha etapas | ⬜ |
| 1.4 | "Na sexta" (relativo) | Data correta no Calendar | ⬜ |
| 1.5 | "Semana que vem" | Data correta no Calendar | ⬜ |
| 2.1 | 1º ocupado, 2º livre | Evento criado no 2º | ⬜ |
| 2.2 | 2 horários ocupados | Evento criado no 3º | ⬜ |
| 2.3 | Manhã toda ocupada | Agenda à tarde | ⬜ |
| 3.1 | Cancelamento simples | eventId = null, evento removido | ⬜ |
| 3.2 | Cancela e não quer remarcar | Stage = perdido | ⬜ |
| 3.3 | Cancelamento com justificativa | Mesmo que 3.1 | ⬜ |
| 3.4 | Cancelar sem agendamento | Sem erro, mensagem amigável | ⬜ |
| 4.1 | Reagendamento simples | updateAppointment, mesmo eventId | ⬜ |
| 4.2 | Reagendar para horário ocupado | Bloqueia, tenta outro | ⬜ |
| 4.3 | Reagendar após cancelar | Cria novo evento | ⬜ |
| 4.4 | Reagendar com linguagem informal | Sofia identifica intenção | ⬜ |
| 5.1 | Horário vago ("amanhã de manhã") | Sofia pede hora exata | ⬜ |
| 5.2 | "Amanhã cedo" | Sofia pede hora exata | ⬜ |
| 5.3 | Hora sem dia | Sofia pede o dia | ⬜ |
| 5.4 | Desistência no meio | Stage = perdido, sem evento | ⬜ |
| 5.5 | Retorno após perdido | Sofia retoma normalmente | ⬜ |
| 5.6 | Mensagem fora do contexto | Sofia redireciona | ⬜ |
