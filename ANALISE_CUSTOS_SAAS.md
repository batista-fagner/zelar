# convertHair SaaS — Análise de Custos e Margem
## Referência: R$ 500/mês por cliente

**Data:** 2026-05-11  
**Moeda:** 1 USD = R$ 4,91 (referência)

---

## 🤖 1. Modelos de IA — Comparativo

### Premissas de uso por conversa (nicho cabelo — objetivo)

| Parâmetro | Estimativa |
|-----------|-----------|
| Mensagens por lead (média) | 15 mensagens |
| System prompt (tokens) | 1.500 tokens |
| Histórico por chamada (tokens) | 800 tokens |
| Input total por mensagem | ~2.300 tokens |
| Output por mensagem (resposta IA) | ~150 tokens |
| **Input total por lead** | **~34.500 tokens** |
| **Output total por lead** | **~2.250 tokens** |

---

### Custo por Lead — Comparativo de Modelos

| Modelo | Input (1M) | Output (1M) | Custo/Lead | Custo/Lead (R$) |
|--------|-----------|------------|-----------|----------------|
| **GPT-4o-mini** | $0.15 | $0.60 | $0.005 | R$ 0,02 |
| **Claude Haiku 4.5** | $0.80 | $4.00 | $0.037 | R$ 0,18 |
| **GPT-4o** | $2.50 | $10.00 | $0.109 | R$ 0,54 |
| **Claude Sonnet 4.6** | $3.00 | $15.00 | $0.133 | R$ 0,65 |
| **Claude Opus 4.7** | $15.00 | $75.00 | $0.685 | R$ 3,36 |

---

### Custo de IA por Cliente/Mês (escenários)

| Leads/mês por cliente | GPT-4o-mini | Claude Haiku 4.5 | Claude Sonnet 4.6 |
|-----------------------|------------|-----------------|------------------|
| 50 leads | R$ 1,20 | R$ 9,08 | R$ 32,75 |
| 100 leads | R$ 2,46 | R$ 18,17 | R$ 65,50 |
| 200 leads | R$ 4,91 | R$ 36,34 | R$ 131,00 |
| 500 leads | R$ 12,28 | R$ 90,84 | R$ 327,50 |

**⚠️ Ponto de atenção:** Com Sonnet 4.6 e 200+ leads, o custo de IA já corrói a margem.

---

### 🏆 Recomendação de Modelo

```
Conversa de vendas (qualificação + follow-up):
  ✅ Claude Haiku 4.5 — IDEAL
     - Rápido, barato, muito bom em seguir instruções/prompts
     - Custo irrisório mesmo com volume
     - Prompt customizável pelo cliente funciona bem
  
  ✅ GPT-4o-mini — ALTERNATIVA (se quiser ainda mais barato)
     - Ainda mais barato, mas qualidade inferior no PT-BR
     - Tende a "escapar" do prompt com mais frequência

  ❌ Claude Sonnet/Opus, GPT-4o — evitar para automação de volume
     - Custo pode explodir com clientes de alto volume de leads
     - Reservar para features premium (análise aprofundada, etc)
```

---

## 💰 2. Todos os Custos Envolvidos

### Custos Fixos da Plataforma (sua infraestrutura)

| Serviço | Plano | Custo/mês | Observação |
|---------|-------|-----------|-----------|
| Railway (backend) | Starter | ~$5 (~R$ 24,55) | Sobe conforme uso de CPU/RAM |
| Supabase (banco) | Free | R$ 0 | Aguenta até ~10 clientes |
| Supabase (banco) | Pro | $25 (~R$ 122,75) | Para 10+ clientes |
| Vercel (frontend) | Free/Pro | R$ 0-98 | Aguenta bastante no free |
| Domínio .com.br | Anual | ~R$ 40/ano = R$ 3/mês | |
| **Total Fixo (fase inicial)** | | **~R$ 25/mês** | Com Supabase free |
| **Total Fixo (após 10 clientes)** | | **~R$ 148/mês** | Supabase Pro |

---

### Custos Variáveis POR CLIENTE (o que você paga por cada cliente)

| Serviço | Custo/cliente/mês | Observação |
|---------|-------------------|-----------|
| **uazapi (WhatsApp instância)** | R$ 29,00 | Por instância (por cliente) |
| **IA — Claude Haiku 4.5** (100 leads) | R$ 18,17 | Ver tabela acima |
| **Google Cloud TTS** | R$ 1,57 | 10.000 chars/mês (~100 msgs de áudio) |
| **Supabase Storage** (vídeos) | R$ 2,25 | Rateado (plano pro $25 ÷ 10 clientes) |
| **Anthropic API markup (buffer 20%)** | R$ 3,63 | Segurança para picos de uso |
| **Total Variável/cliente** | **~R$ 54,62** | Com 100 leads/mês |

---

### 📊 Cálculo de Margem — por Cliente

```
Receita:                     R$ 500,00 / mês
(-)  Custo variável:        (R$  54,62) / mês
(-)  Custo fixo rateado:    (R$  14,80) / mês (R$148 ÷ 10 clientes)
     ─────────────────────────────────────────
     Margem Bruta/cliente:   R$ 430,58 / mês
     Margem %:               86,1%
```

---

### 📈 Escala — Receita vs Custos

| Clientes | Receita/mês | Custos Variáveis | Custos Fixos | Lucro Líquido | Margem |
|----------|-------------|-----------------|-------------|---------------|--------|
| 5 | R$ 2.500 | R$ 273 | R$ 25 | R$ 2.202 | 88% |
| 10 | R$ 5.000 | R$ 546 | R$ 148 | R$ 4.306 | 86% |
| 20 | R$ 10.000 | R$ 1.092 | R$ 148 | R$ 8.760 | 88% |
| 50 | R$ 25.000 | R$ 2.731 | R$ 200 | R$ 22.069 | 88% |
| 100 | R$ 50.000 | R$ 5.462 | R$ 400 | R$ 44.138 | 88% |

**Divisão com sócio (50/50):**

| Clientes | Lucro Total | Sua parte | Parte do irmão |
|----------|-------------|-----------|----------------|
| 10 | R$ 4.306 | R$ 2.153 | R$ 2.153 |
| 20 | R$ 8.760 | R$ 4.380 | R$ 4.380 |
| 50 | R$ 22.069 | R$ 11.035 | R$ 11.035 |

---

## 🔍 3. Detalhes dos Serviços Principais

### uazapi — WhatsApp

**Planos atuais (conforme docs):**
- R$ 29/mês — 1 instância (1 número de WhatsApp por cliente)
- Inclui: webhook, envio de texto/mídia/áudio, QR code

**Consideração importante:**
- Cada cliente terá 1 instância uazapi = R$ 29/mês fixo por cliente
- Para mensagens em massa: usar Meta Official API (custo por mensagem)

**Alternativa para massa — Meta Official API:**
```
Conversational (janela 24h aberta):  GRATUITO até 1.000 conversas/mês
Marketing/Template:                  ~$0.05-0.08 por conversa (R$ 0,29-0,46)
```

---

### Google Cloud TTS — Áudio

| Tipo de voz | Custo/1M chars | R$/1M chars |
|-------------|---------------|------------|
| Standard | $4.00 | R$ 19,64 |
| WaveNet | $16.00 | R$ 78,56 |
| **Neural2 (usada)** | $16.00 | R$ 78,56 |
| Studio (melhor) | $160.00 | R$ 785,60 |

**Estimativa realista (100 msgs/mês × 200 chars):**
- 20.000 chars × R$ 91,20/1M = **R$ 1,82/cliente/mês**
- Se cliente tem 50% de conversas em áudio → R$ 0,91/cliente/mês

**Free tier do Google:** 1M chars/mês gratuito → cobre ~50 clientes sem custo!

---

### Supabase — Storage para Vídeos

| Plano | Storage | Custo |
|-------|---------|-------|
| Free | 1 GB | R$ 0 |
| Pro | 100 GB | $25/mês (R$ 143) |
| Adicional | +$0.021/GB | +R$ 0,12/GB |

---

## 🧮 4. Análise de Risco — Clientes de Alto Volume

**Cenário preocupante:** Cliente com 500 leads/mês

| Serviço | Custo |
|---------|-------|
| uazapi | R$ 29,00 |
| Claude Haiku 4.5 (500 leads) | R$ 90,84 |
| Google TTS | R$ 7,85 |
| Total | **R$ 127,69** |
| Receita | R$ 500,00 |
| Margem | **74,5%** |

**Ainda bem!** Mesmo no cenário de alto volume (500 leads/mês), a margem se mantém em 71%.

**Proteção sugerida:** Colocar limite de leads por plano
- Basic R$ 500: até 200 leads/mês
- Se ultrapassar: cobrar R$ 0,50/lead extra (ou R$ 1,00)

---

## 📋 5. Resumo Final — Recomendações

### Modelo de IA: ✅ Claude Haiku 4.5
```
Por quê?
- PT-BR muito bom (melhor que GPT-4o-mini em português)
- Muito bom em seguir prompts customizados (tela de prompt do usuário)
- Custo irrisório: R$ 21/cliente com 100 leads/mês
- Rápido (baixa latência = melhor UX no WhatsApp)
- Permite uso de Prompt Caching → reduz custo em 90% no system prompt
```

### Com Prompt Caching do Claude:
```
System prompt é cacheado → custo do input do system prompt reduz 90%
Se o prompt tem 1.500 tokens e muda pouco:
  Sem cache: 1.500 × $0.80/1M = $0.0012/mensagem
  Com cache: 1.500 × $0.08/1M = $0.00012/mensagem
  Economia: 90% no maior custo de input
```

**Com cache habilitado, custo por lead cai de R$ 0,21 para ~R$ 0,09 (Claude Haiku)**

### Pricing final recomendado:

| Plano | Preço | Leads/mês | Custo estimado | Margem |
|-------|-------|-----------|---------------|--------|
| Basic | R$ 500 | 200 | ~R$ 68 | ~86% |
| Pro | R$ 900 | 500 | ~R$ 135 | ~85% |
| Scale | R$ 1.500 | 1.500 | ~R$ 295 | ~80% |

---

**Conclusão: Margem altíssima. R$ 500/mês é um pricing confortável com margem de 85%+ na maioria dos cenários.**
