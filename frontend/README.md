# Fisio Secretary — Frontend

Painel operacional da secretária virtual Sofia. Exibe um Kanban em tempo real com os leads do WhatsApp, permite acompanhar conversas, mover cards entre estágios, enviar mensagens manuais e controlar a IA por lead.

## Stack

- **Framework:** React 18 + Vite
- **Estilo:** Tailwind CSS
- **Ícones:** Lucide React
- **Drag-and-drop:** @dnd-kit/core
- **Real-time:** Socket.io Client
- **Build:** Vite 5 (dev na porta 5174)

## Estrutura

```
src/
├── App.jsx                  # Roteamento simples: Login ↔ Kanban
├── main.jsx                 # Entrada React
├── index.css                # Estilos globais (Tailwind + scrollbar customizada)
├── pages/
│   ├── LoginPage.jsx        # Tela de login
│   └── KanbanPage.jsx       # Painel principal com Kanban
├── components/
│   ├── KanbanColumn.jsx     # Coluna do Kanban (droppable zone)
│   ├── LeadCard.jsx         # Card do lead (draggable)
│   └── LeadModal.jsx        # Modal de detalhes do lead
├── hooks/
│   └── useLeads.js          # Carrega leads via HTTP + escuta WebSocket
├── services/
│   └── api.js               # Chamadas HTTP ao backend
└── data/
    └── mockData.js          # Definição das colunas do Kanban
```

## Funcionalidades

### Kanban em tempo real
- 7 colunas: `Novo Lead` → `Qualificando` → `Lead Quente` / `Lead Frio` → `Agendado` → `Convertido` / `Perdido`
- Cards se movem automaticamente via WebSocket quando a IA avança o estágio
- Drag-and-drop manual para o operador mover cards entre colunas (chama `PATCH /leads/:id/stage`)
- Contadores por coluna e stats no header (total, quentes, agendados)

### Card do lead
- Avatar com inicial do nome
- Temperatura (🔥 quente / ☀️ morno / 🧊 frio)
- Badge de urgência com cores (alta / média / baixa)
- Score de qualificação (0–100)
- Sintomas e último timestamp

### Modal de detalhes (2 painéis)
**Painel esquerdo — qualificação:**
- Score com barra de progresso
- Sintomas, disponibilidade, orçamento, consulta agendada
- Histórico de transições de estágio (from → to, quem mudou, quando)

**Painel direito — conversa:**
- Chat completo (mensagens do lead, da IA e do operador)
- Toggle para ativar/desativar IA por lead
- Input de envio manual (habilitado apenas com IA desativada)
- Envio com Enter ou botão
- Auto-scroll para a última mensagem

## Integração com o backend

### HTTP (fetch inicial)

| Método | Endpoint | Uso |
|--------|----------|-----|
| GET | `/leads` | Carrega todos os leads ao montar |
| GET | `/leads/:id/conversation` | Mensagens ao abrir o modal |
| GET | `/leads/:id/history` | Histórico de estágios ao abrir o modal |
| PATCH | `/leads/:id/stage` | Drag-and-drop manual |
| PATCH | `/leads/:id/ai` | Toggle IA |
| POST | `/webhooks/manual` | Envio de mensagem pelo operador |

### WebSocket (tempo real)

Conecta em `http://localhost:3000` via Socket.io e escuta:

```
lead:updated → { ...dadosDoLead }
```

Ao receber:
- Se o lead já existe na lista → substitui
- Se é novo → adiciona no início

## Fluxo de dados

```
LoginPage
  ↓
KanbanPage → useLeads()
               ├─ GET /leads (carga inicial)
               └─ socket.on('lead:updated') → atualiza estado

  Drag-and-drop → PATCH /leads/:id/stage (atualização otimista)

  Click no card → LeadModal
                    ├─ GET /leads/:id/conversation
                    ├─ GET /leads/:id/history
                    ├─ PATCH /leads/:id/ai (toggle)
                    └─ POST /webhooks/manual (envio manual)
```

## Rodando localmente

```bash
cd fisio-secretary/frontend
npm install
npm run dev
```

Disponível em `http://localhost:5174`.

O backend deve estar rodando em `http://localhost:3000`.

### Credenciais de demo

```
E-mail:  demo@fisio.com
Senha:   demo123
```

## Build

```bash
npm run build
```

Output em `dist/`.
