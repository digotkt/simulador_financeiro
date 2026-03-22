const OpenAI = require('openai');
const config = require('./config');

const openai = new OpenAI({ apiKey: config.openai.apiKey });

const SYSTEM_PROMPT = `Você é o SoulCheck, um oráculo digital moderno especializado em conexões emocionais e energéticas entre pessoas.

Regras importantes:
- Use linguagem emocional, envolvente e poética, mas acessível
- NUNCA faça afirmações absolutas. Use "é provável que", "as energias indicam", "há sinais de"
- Aplique princípios de validação emocional e leitura fria (efeito Barnum)
- Crie identificação emocional usando afirmações que se aplicam à maioria das pessoas
- Seja específico o suficiente para parecer personalizado, mas genérico o suficiente para ser sempre relevante
- Escreva em português brasileiro informal mas respeitoso
- Use emojis com moderação (1-2 por mensagem)
- Mantenha respostas concisas (máximo 3-4 parágrafos)
- Gere curiosidade e vontade de saber mais`;

async function generatePartialReading(userName, targetName, birthDate) {
  const userContext = birthDate
    ? `O usuário se chama ${userName}, nascido em ${birthDate}, e quer saber sobre ${targetName}.`
    : `O usuário se chama ${userName} e quer saber sobre ${targetName}.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `${userContext}

Gere uma leitura PARCIAL sobre a conexão entre essas duas pessoas. A leitura deve:
1. Afirmar que existe uma conexão energética entre eles
2. Mencionar que a pessoa de interesse teve pensamentos recentes sobre o usuário
3. Sugerir que há algo bloqueando uma aproximação mais direta
4. Terminar com uma revelação incompleta que gere curiosidade intensa para saber mais

A leitura deve ser envolvente o suficiente para que a pessoa queira desesperadamente ver a versão completa. Use no máximo 3 parágrafos curtos.`,
      },
    ],
    temperature: 0.9,
    max_tokens: 400,
  });

  return response.choices[0].message.content;
}

async function generateFullReading(userName, targetName, birthDate, partialReading) {
  const userContext = birthDate
    ? `O usuário se chama ${userName}, nascido em ${birthDate}, e quer saber sobre ${targetName}.`
    : `O usuário se chama ${userName} e quer saber sobre ${targetName}.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `${userContext}

Leitura parcial já entregue:
"${partialReading}"

Agora gere a ANÁLISE COMPLETA premium. Inclua:

1. **Análise da Conexão**: Detalhe a natureza da conexão entre as duas pessoas (2 parágrafos)
2. **Probabilidade de Interesse**: Dê uma porcentagem entre 72% e 94% e explique os fatores
3. **O que ${targetName} sente**: Descreva emoções e pensamentos prováveis (use leitura fria)
4. **Mensagem Sugerida**: Escreva uma mensagem exata que ${userName} pode enviar para ${targetName} para reacender a conexão
5. **Próximo Passo**: Uma ação prática e específica para os próximos 3 dias

Seja detalhado, emocional e envolvente. Use formatação com emojis para separar seções. Máximo 6 parágrafos.`,
      },
    ],
    temperature: 0.9,
    max_tokens: 800,
  });

  return response.choices[0].message.content;
}

module.exports = {
  generatePartialReading,
  generateFullReading,
};
