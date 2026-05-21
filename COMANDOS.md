# Comandos para rodar o projeto

## Pré-requisitos

- Docker e Docker Compose instalados
- Node.js v22+
- Arquivo `.env` configurado na raiz de `fisio-secretary/`

---

## Docker (Redis apenas)

```bash
# Subir apenas Redis (WhatsApp via uazapi, Postgres via Supabase)
cd fisio-secretary
docker compose up -d

# Ver logs
docker compose logs -f

# Parar tudo
docker compose down

# Parar e remover volumes (cuidado: apaga dados)
docker compose down -v
```

<!-- Ngrok para webhooks -->
Para receber webhooks da uazapi no localhost:
```bash
ngrok http 3000
```
Configurar a URL gerada na uazapi como: `https://<ngrok-url>/webhooks/uazapi`

Serviços que sobem:
| Serviço | URL |
|---------|-----|
| Redis | localhost:6379 |

Serviços externos:
| Serviço | Gerenciador |
|---------|-------------|
| WhatsApp (uazapi) | https://free.uazapi.com |
| PostgreSQL | Supabase |
| Google Calendar | Google Cloud |

---

## Backend (NestJS)

```bash
cd fisio-secretary/backend

# Instalar dependências (primeira vez)
npm install

# Rodar em modo desenvolvimento (hot reload)
npm run start:dev

# Rodar em modo produção
npm run build
npm run start:prod
```

Backend disponível em: `http://localhost:3000`

---

## Frontend (React + Vite)

```bash
cd fisio-secretary/frontend

# Instalar dependências (primeira vez)
npm install

# Rodar em modo desenvolvimento
npm run dev

# Build para produção
npm run build

# Visualizar build de produção
npm run preview
```

Frontend disponível em: `http://localhost:5173`

---

## Ordem recomendada para subir o projeto

```bash
# 1. Infra (Docker)
cd fisio-secretary
docker compose up -d

# 2. Backend (novo terminal)
cd fisio-secretary/backend
npm run start:dev

# 3. Frontend (novo terminal)
cd fisio-secretary/frontend
npm run dev
```

---

## Comandos úteis

```bash
# Ver containers rodando
docker ps

# Acessar shell do Redis
docker exec -it fisio_redis redis-cli -a $REDIS_PASSWORD

# Ver logs do backend em tempo real
# (no terminal onde rodou npm run start:dev)
tail -f backend/logs/combined.log
```
