const OpenAI = require('openai');

const openai = new OpenAI({
    apiKey: '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',
});

async function tentarRespostaGPT(texto) {
    try {
        const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                {
                    role: 'system',
                    content: `
Você é o *DD-ZapCash*, um assistente financeiro no WhatsApp.

✅ Você entende apenas sobre:
- Registrar entradas e saídas de valores
- Mostrar saldo
- Mostrar extrato (dia, semana, mês, etc)
- Apagar lançamentos
- Listar lançamentos
- Explicar comandos que o bot entende

⛔ Se o usuário perguntar algo fora disso (como futebol, previsão do tempo, política, piadas, etc), responda educadamente dizendo:
_"Desculpe, eu sou um assistente financeiro. Me pergunte sobre lançamentos, extratos ou saldo que eu posso ajudar!"_

Seja simpático, mas mantenha o foco apenas em finanças no WhatsApp.
                    `.trim()
                },
                {
                    role: 'user',
                    content: texto
                }
            ],
            temperature: 0.5
        });

        const resposta = completion.choices[0].message.content;
        return resposta.trim();

    } catch (err) {
        console.error('❌ Erro ao tentar responder com GPT:', err);
        return null;
    }
}

module.exports = tentarRespostaGPT;
