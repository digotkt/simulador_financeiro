# SoulCheck - MVP WhatsApp

Sistema automatizado de interação emocional via WhatsApp com IA.

## Arquitetura

```
Usuário → WhatsApp → Z-API Webhook → Express Server → OpenAI → WhatsApp
                                          ↓
                                    Stripe (pagamento)
                                          ↓
                                    Supabase (dados)
```

## Fluxo do Usuário

1. Usuário envia mensagem pelo WhatsApp
2. Bot envia boas-vindas e pede o nome da pessoa de interesse
3. Bot pede o nome do usuário
4. Bot pede data de nascimento (opcional)
5. IA gera leitura parcial (gratuita)
6. Paywall: link de pagamento Stripe (R$ 9,90)
7. Após pagamento: IA entrega análise completa premium

## Setup

### 1. Instalar dependências

```bash
cd soulcheck
npm install
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
# Editar .env com suas credenciais
```

### 3. Criar banco no Supabase

Execute o conteúdo de `supabase_schema.sql` no SQL Editor do Supabase.

### 4. Configurar Z-API

1. Crie uma instância em [z-api.io](https://z-api.io)
2. Conecte seu WhatsApp via QR Code
3. Configure o webhook de recebimento para: `https://seu-dominio.com/webhook/whatsapp`

### 5. Configurar Stripe

1. Crie conta em [stripe.com](https://stripe.com)
2. Configure o webhook para: `https://seu-dominio.com/webhook/stripe`
3. Evento necessário: `checkout.session.completed`

### 6. Rodar

```bash
npm run dev    # desenvolvimento
npm start      # produção
```

## Deploy Rápido

Para deploy rápido, use Railway, Render ou Fly.io:

```bash
# Railway
railway init
railway up

# Render - criar Web Service apontando para soulcheck/
```

## Estrutura

```
soulcheck/
├── src/
│   ├── server.js      # Express server + rotas
│   ├── config.js      # Variáveis de ambiente
│   ├── flow.js        # Máquina de estados da conversa
│   ├── ai.js          # Geração de respostas com OpenAI
│   ├── whatsapp.js    # Integração Z-API
│   ├── payment.js     # Integração Stripe
│   └── db.js          # Integração Supabase
├── supabase_schema.sql
├── .env.example
└── package.json
```
