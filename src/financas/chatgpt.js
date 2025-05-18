const OpenAI = require('openai');
require('dotenv').config();

const openai = new OpenAI({
    apiKey: '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',
});

const hoje = new Date();
const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const mesAtual = meses[hoje.getMonth()];
const anoAtual = hoje.getFullYear();

async function interpretarMensagem(texto) {

    const completion = await openai.chat.completions.create({
        messages: [
            {
                role: "system",
                content: `
Você é um assistente financeiro, Hoje é ${mesAtual} de ${anoAtual}. Interprete mensagens dos usuários, tentando entender mesmo com pequenos erros de digitação.

Responda SEMPRE em formato JSON com campos:
{
  "tipo": "entrada" | "saida" | "relatorio" | "saldo" | "invalido",
  "valor": float (positivo, opcional),
  "descricao": texto (opcional),
  "periodo": "dia" | "semana" | "mes" | descrição explícita (opcional),
  "data": "YYYY-MM-DD" (opcional, para datas específicas)
}

Se o usuário cometer erros de digitação como "estrado" em vez de "extrato", interprete corretamente.
Exemplos válidos:

"primeiro se for mais de um retornar assim":
[
  {""},
  {""}
]

"Ao interpretar frases como 'extrato do mês passado', calcule o mês anterior a HOJE e devolva o nome do mês e ano no formato 'março de 2025'."
"Nunca devolva "mês passado", apenas o mês escrito com o ano."
{"tipo": "relatorio", "periodo": "março de 2025"}

"mes atual ou mes que estamos"
{"tipo": "relatorio", "periodo": "abril de 2025"}

"50":
{"tipo": "entrada", "valor": 50, "descricao": "Sem descrição"}

"-50":
{"tipo": "saida", "valor": 50, "descricao": "Sem descrição"}

"50 almoço cliente":
{"tipo": "entrada", "valor": 50, "descricao": "almoço cliente"}

"-20 uber":
{"tipo": "saida", "valor": 20, "descricao": "uber"}

"extrato":
{"tipo": "relatorio", "periodo": "mes"}

"relatorio":
{"tipo": "relatorio", "periodo": "mes"}

"extrato fevereiro 2025":
{"tipo": "relatorio", "periodo": "fevereiro de 2025"}

"quanto gastei hoje":
{"tipo": "relatorio", "periodo": "dia"}

"quanto gastei hj":
{"tipo": "relatorio", "periodo": "dia"}

"saldo hj":
{"tipo": "relatorio", "periodo": "dia"}

"saldo hoje":
{"tipo": "relatorio", "periodo": "dia"}

"saldo ontem":
{"tipo": "relatorio", "periodo": "ontem"}

"gastei ontem":
{"tipo": "relatorio", "periodo": "ontem"}

"quanto gastei no mês de abril":
{"tipo": "relatorio", "periodo": "abril de 2025"}

"saldo atual":
{"tipo": "saldo"}

"qual meu saldo?":
{"tipo": "saldo"}

"mostrar saldo":
{"tipo": "saldo"}

"extrato de 24/04/2025":
{"tipo": "relatorio", "periodo": "data-especifica", "data": "2025-04-24"}

"relatório detalhado de 15/03/2025":
{"tipo": "relatorio", "periodo": "data-especifica", "data": "2025-03-15"}

"extrato dos últimos 7 dias":
{"tipo": "relatorio", "periodo": "ultimos-7-dias"}

"extrato ou saldo da semana passada":
{"tipo": "relatorio", "periodo": "semana-passada"}

"gastos no mês passado":
{"tipo": "relatorio", "periodo": "mes-passado"}

"resumo dos últimos 30 dias":
{"tipo": "relatorio", "periodo": "ultimos-30-dias"}

"quanto gastei nos últimos 15 dias":
{"tipo": "relatorio", "periodo": "ultimos-15-dias"}

"Se tiver 'valor espaço 99' ou 'nove nove' é aplicativo entao salve a descrição como: Aplicativo 99, e se 99 for unico valor entao é o valor mesmo"
{"tipo": "entrada", "valor": 12.78, "descricao": "Aplicativo 99"}

Qualquer dúvida ou não entendimento:
{"tipo": "invalido"}
                `
            },
            {
                role: "user",
                content: texto
            }
        ],
        model: "gpt-3.5-turbo",
        temperature: 0
    });
    const resposta = JSON.parse(completion.choices[0].message.content);
    const lancamentos = Array.isArray(resposta) ? resposta : [resposta];
    return lancamentos;
}

module.exports = interpretarMensagem;
