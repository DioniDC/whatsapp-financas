const { Client, LocalAuth } = require('./index');
const financas = require('./src/financas/financas');
const interpretarMensagem = require('./src/financas/chatgpt');
const transcreverAudio = require('./src/financas/transcricao');

const listasLancamentos = new Map();
const confirmacoesApagar = new Map();
const tiposValidos = ['chat', 'ptt'];

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { headless: false }
});

client.initialize();

client.on('loading_screen', (percent, message) => console.log('LOADING SCREEN', percent, message));
client.on('qr', (qr) => console.log('QR RECEIVED', qr));
client.on('authenticated', () => console.log('AUTHENTICATED'));
client.on('ready', () => console.log('READY'));
client.on('disconnected', (reason) => console.log('Desconectado:', reason));

client.on('message', async (msg) => {

    if (!tiposValidos.includes(msg.type) || !msg.body.trim() && msg.type === 'chat') {
        return;
    }

    const chat = await msg.getChat();
    if (chat.isGroup) return;

    const numero = msg.from.split('@')[0];
    let texto = msg.body.trim();

    const novoTexto = await tratarAudio(msg, numero);
    if (novoTexto) {
        texto = novoTexto;
    }

    try {
        if (await tratarConfirmacaoApagarTudo(msg, numero, texto)) return;
        if (await tratarLimpezaCompleta(msg, numero, texto)) return;
        if (await tratarListarLancamentos(msg, numero, texto)) return;
        if (await tratarApagarLancamento(msg, numero, texto)) return;
        if (await mostrarManual(msg, texto)) return;
        await tratarMensagemNormal(msg, numero, texto);
    } catch (error) {
        console.error('Erro no processamento de mensagem:', error);
        await msg.reply('❌ Ocorreu um erro ao processar sua mensage:' + error);
    }
});

// === Funcoes de Tratamento ===
async function tratarAudio(msg, numero) {
    if (msg.type === 'ptt' && msg.hasMedia) {
        const media = await msg.downloadMedia();
        if (!media || !media.data) {
            await msg.reply('❌ Não foi possível baixar o áudio.');
            return null;
        }

        const buffer = Buffer.from(media.data, 'base64');
        if (buffer.length === 0) {
            await msg.reply('❌ Áudio vazio ou corrompido.');
            return null;
        }

        const textoTranscrito = await transcreverAudio(buffer);
        if (textoTranscrito) {
            await msg.reply(`📝 Áudio transcrito: ${textoTranscrito}`);
            return textoTranscrito.trim();
        } else {
            await msg.reply('❌ Não consegui entender o áudio.');
            return null;
        }
    }
    return null;
}

async function tratarConfirmacaoApagarTudo(msg, numero, texto) {
    if (!confirmacoesApagar.has(numero)) return false;

    let resposta = texto
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s]|_/g, '')
        .trim();

    const { timeoutId } = confirmacoesApagar.get(numero);

    if (resposta === 'sim' || resposta === 's') {
        clearTimeout(timeoutId);
        confirmacoesApagar.delete(numero);
        await financas.apagarTodosLancamentos(numero);
        await msg.reply('✅ Todos os seus lançamentos foram apagados com sucesso.');
    } else if (resposta === 'nao' || resposta === 'n') {
        clearTimeout(timeoutId);
        confirmacoesApagar.delete(numero);
        await msg.reply('❌ Cancelado. Seus dados continuam intactos.');
    } else {
        await msg.reply('⚠️ Responda *SIM* para confirmar ou *NÃO* para cancelar.');
    }

    return true;
}

async function tratarLimpezaCompleta(msg, numero, texto) {
    const textoL = texto.toLowerCase();
    if (!textoL.includes('limpar') && !textoL.includes('zerar') && !textoL.includes('apagar tudo')) return false;

    if (confirmacoesApagar.has(numero)) {
        await msg.reply('⚠️ Já existe uma confirmação pendente! Responda *SIM* ou *NÃO*.');
        return true;
    }

    await msg.reply(`⚠️ Você quer mesmo apagar *TODOS* os seus lançamentos? Esta ação é *irreversível*!

Responda:
✅ *SIM* para confirmar
❌ *NÃO* para cancelar.`);

    const timeoutId = setTimeout(async () => {
        confirmacoesApagar.delete(numero);
        await client.sendMessage(msg.from, '⏳ Tempo esgotado. Cancelado automaticamente.');
    }, 60000);

    confirmacoesApagar.set(numero, { timeoutId });
    return true;
}

async function tratarListarLancamentos(msg, numero, texto) {
    const textoL = texto.toLowerCase(); 
    if (!textoL.includes('listar') && !textoL.includes('lista')) return false;

    const ultimos = await financas.listarUltimosLancamentos(numero);
    if (ultimos.length === 0) {
        await msg.reply('Nenhum lançamento encontrado.');
        return true;
    }

    listasLancamentos.set(numero, ultimos);
    let resposta = '📋 *Últimos Lançamentos:*';
    ultimos.forEach((t, i) => {
        const data = new Date(t.data).toLocaleDateString('pt-BR');
        const sinal = t.tipo === 'entrada' ? '+' : '-';
        resposta += `\n${i + 1}\u20e3 ${sinal}R$ ${t.valor.toFixed(2)} - ${t.descricao} - ${data}`;
    });
    resposta += '\n\nDigite *apagar [número]* para deletar ou *apagar ultimo* para excluir o mais recente.';

    await msg.reply(resposta);
    return true;
}

async function tratarApagarLancamento(msg, numero, texto) {
    texto = texto.replace(/[.,!?]/g, '');

    // Agora troca "número" ou "numero" por vazio
    texto = texto.replace(/\bnumero\b|\bnúmero\b/gi, '').trim();
    
    // Agora corrige números escritos por extenso
    texto = corrigirNumerosPorExtenso(texto);
    
    // Normaliza tudo
    const textoLimpo = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    
    // Se não começar com apagar, deletar ou excluir, ignora
    if (!textoLimpo.startsWith('apagar') && !textoLimpo.startsWith('deletar') && !textoLimpo.startsWith('excluir')) {
        return false;
    }

    // Se pedir para apagar o último
    if (textoLimpo.includes('ultimo')) {
        const ultimo = await financas.apagarUltimoLancamento(numero);
    
        if (ultimo) {
            const dataFormatada = new Date(ultimo.data).toLocaleDateString('pt-BR');
            await msg.reply(`✅ Último lançamento apagado:
    💵 Valor: R$ ${Number(ultimo.valor).toFixed(2)}
    📝 Descrição: ${ultimo.descricao}
    📅 Data: ${dataFormatada}`);
        } else {
            await msg.reply('❌ Nenhum lançamento encontrado para apagar.');
        }
        return true;
    }

    // Se pedir para apagar um número específico
    const partes = textoLimpo.split(' ');
    if (partes.length >= 2) {
        const indice = parseInt(partes[1]) - 1;
        const lista = listasLancamentos.get(numero) || [];
        const lancamento = lista[indice];

        if (lancamento) {
            await financas.apagarLancamentoPorId(lancamento.id);
            const dataFormatada = new Date(lancamento.data).toLocaleDateString('pt-BR');
            await msg.reply(`✅ Lançamento apagado:
💵 Valor: R$ ${lancamento.valor.toFixed(2)}
📝 Descrição: ${lancamento.descricao}
📅 Data: ${dataFormatada}`);
        } else {
            await msg.reply('❌ Número inválido ou lista expirada.');
        }
    }
    return true;
}

async function mostrarManual(msg, texto){
    if (texto.toLowerCase() === 'help') {
        await mostrarInstrucoes(msg);
        return true;
    }
}

async function tratarMensagemNormal(msg, numero, texto) {
    const textoCorrigido1 = corrigirPalavrasSemelhantes(texto);
    const textoCorrigido2 = corrigirAnoCurto(textoCorrigido1);
    const interpretados = await interpretarMensagemComData(textoCorrigido2);
    const listaInterpretados = Array.isArray(interpretados) ? interpretados : [interpretados];
    for (const interpretado of listaInterpretados) {
        await processarInterpretado(msg, numero, interpretado);
    }
}

// === Funcoes Auxiliares ===
async function processarInterpretado(msg, numero, interpretado) {

    if (interpretado.tipo === 'entrada' || interpretado.tipo === 'saida') {
        const valor = interpretado.tipo === 'entrada' ? interpretado.valor : -interpretado.valor;
        const descricao = interpretado.descricao;

        if (!valor || valor === 0) {
            await msg.reply(`❓ Não entendi o valor.\n\nPor favor, digite o valor para: *${descricao}*`);
            return;
        }

        // Garante que a data está no formato correto
        const data = interpretado.data ? new Date(interpretado.data) : new Date();
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        const resultado = await financas.registrarTransacao(numero, `${valor} ${descricao}`, data);

        let mensagem = `✅ *${resultado.tipo.toUpperCase()} registrada*\n` +
                      `💵 Valor: R$ ${resultado.valor.toFixed(2)}\n` +
                      `📝 Descrição: ${resultado.descricao}`;

        // Compara apenas dia, mês e ano
        if (data.toDateString() !== hoje.toDateString()) {
            mensagem += `\n📅 Data: ${formatarDataParaExibicao(data)}`;
        }

        await msg.reply(mensagem);
    } else if (interpretado.tipo === 'relatorio') {
        const resumo = interpretado.periodo === 'data-especifica' && interpretado.data
            ? await financas.gerarResumoData(numero, interpretado.data)
            : await financas.gerarResumoPeriodo(numero, interpretado.periodo);
        
        let resposta = '';

        if (/^\d{4}$/.test(interpretado.periodo)) {
            resposta = await gerarExtratoAnual(interpretado.periodo, resumo);
        } else { resposta = `📊 *EXTRATO (${interpretado.periodo})*\n`;
        
            let ultimaData = '';
            resumo.transacoes.forEach(t => {
                const data = new Date(t.data).toLocaleDateString('pt-BR');
                const sinal = t.tipo === 'entrada' ? '+' : '-';
                if (data !== ultimaData) {
                    resposta += `\n📅 *${data}*\n`;
                    ultimaData = data;
                }
                resposta += `${sinal}R$ ${(Number(t.valor) || 0).toFixed(2)} - ${t.descricao}\n`;
            });
        }

        resposta += `\n💰 *Saldo:* R$ ${(Number(resumo.saldo) || 0).toFixed(2)}`;
        await msg.reply(resposta);
    } else if (interpretado.tipo === 'saldo') {
        const resumo = await financas.gerarResumo(numero, 'mes');
        await msg.reply(`💰 *Seu saldo atual no mês:* R$ ${(Number(resumo.saldo) || 0).toFixed(2)}
        \n\n⬆️ Entradas: R$ ${(Number(resumo.entradas) || 0).toFixed(2)}
        \n⬇️ Saídas: R$ ${(Number(resumo.saidas) || 0).toFixed(2)}`);
    } else {
        await msg.reply(`Desculpe, eu sou um assistente financeiro. Me pergunte sobre lançamentos, extratos ou saldo que eu posso ajudar! 😊\n\n📚 Caso queira ver o manual completo \nDigite: *HELP*`);
    }
}

function formatarDataParaExibicao(data) {
    // Se já for uma string no formato ISO (YYYY-MM-DD)
    if (typeof data === 'string' && data.includes('-')) {
        const [ano, mes, dia] = data.split('-');
        return `${dia}/${mes}/${ano}`;
    }
    // Se for um objeto Date
    else if (data instanceof Date) {
        const dia = String(data.getDate()).padStart(2, '0');
        const mes = String(data.getMonth() + 1).padStart(2, '0');
        const ano = data.getFullYear();
        return `${dia}/${mes}/${ano}`;
    }
    // Caso inesperado
    else {
        console.error('Formato de data não suportado:', data);
        return 'Data inválida';
    }
}
function corrigirAnoCurto(texto) {
    return texto.replace(/(\d{2})\/(\d{2})\/(\d{2})(?!\d)/g, (_, dia, mes, ano) => {
        const anoCompleto = parseInt(ano) < 50 ? '20' + ano : '19' + ano;
        return `${dia}/${mes}/${anoCompleto}`;
    });
}

function parecePergunta(texto) {
    texto = texto.toLowerCase();
    return texto.includes('?') ||
           texto.startsWith('como') ||
           texto.startsWith('o que') ||
           texto.startsWith('porque') ||
           texto.startsWith('por que') ||
           texto.startsWith('qual') ||
           texto.startsWith('quem') ||
           texto.startsWith('quando') ||
           texto.startsWith('onde');
}

async function interpretarMensagemComData(texto) {
    // Padrão DD/MM/AAAA ou DD-MM-AAAA
    const matchData = texto.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
    if (matchData) {
        const [_, dia, mes, ano] = matchData;
        // Cria a data no horário de Brasília sem deslocamento UTC
        const data = new Date(ano, mes - 1, dia);
        const dataISO = data.toISOString().split('T')[0]; // Apenas a parte da data
        
        const interpretado = await interpretarMensagem(texto.replace(matchData[0], '').trim());
        return Array.isArray(interpretado) 
            ? interpretado.map(i => ({ ...i, data: dataISO }))
            : [{ ...interpretado, data: dataISO }];
    }

    if (texto.toLowerCase().includes('ontem')) {
        const ontem = criarDataOntemComHorarioBrasilia();
        const dataISO = ontem.toISOString().split('T')[0]; // Formato YYYY-MM-DD
        
        // Remove a palavra "ontem" do texto antes de interpretar
        const textoParaInterpretar = texto.replace(/ontem/gi, '').trim();
        const interpretado = await interpretarMensagem(textoParaInterpretar);
        
        return Array.isArray(interpretado) 
            ? interpretado.map(i => ({ ...i, data: dataISO }))
            : [{ ...interpretado, data: dataISO }];
    }

    return await interpretarMensagem(texto);
}

function criarDataOntemComHorarioBrasilia() {
    // Obtém a data atual no fuso horário de Brasília
    const agora = new Date();
    
    // Ajusta para o horário de Brasília (UTC-3)
    const offsetBrasilia = 3 * 60 * 60 * 1000; // 3 horas em milissegundos
    const agoraBrasilia = new Date(agora.getTime() - offsetBrasilia);
    
    // Subtrai um dia (24 horas)
    const ontemBrasilia = new Date(agoraBrasilia);
    ontemBrasilia.setDate(agoraBrasilia.getDate() - 1);
    
    // Retorna apenas a parte da data (sem horário)
    return new Date(ontemBrasilia.getFullYear(), ontemBrasilia.getMonth(), ontemBrasilia.getDate());
}

function corrigirNumerosPorExtenso(texto) {
    const numerosExtenso = {
        'um': '1',
        'dois': '2',
        'tres': '3',
        'três': '3',
        'quatro': '4',
        'cinco': '5',
        'seis': '6',
        'sete': '7',
        'oito': '8',
        'nove': '9',
        'dez': '10',
        'onze': '11',
        'doze': '12',
        'treze': '13',
        'quatorze': '14',
        'catorze': '14',
        'quinze': '15',
        'dezesseis': '16',
        'dezessete': '17',
        'dezoito': '18',
        'dezenove': '19',
        'vinte': '20'
    };

    let textoCorrigido = texto.toLowerCase();
    for (const [extenso, numero] of Object.entries(numerosExtenso)) {
        const regex = new RegExp(`\\b${extenso}\\b`, 'gi');
        textoCorrigido = textoCorrigido.replace(regex, numero);
    }
    return textoCorrigido;
}

function corrigirPalavrasSemelhantes(texto) {
    const palavrasValidas = [
        'saldo', 'extrato', 'relatorio', 'entrada', 'saida', 'apagar', 'listar', 'gastei', 'ontem', 'hoje', 'mes', 'semana'
    ];

    function encontrarMaisParecida(palavra) {
        let melhorPalavra = palavra;
        let melhorSimilaridade = 0;

        for (const candidata of palavrasValidas) {
            const similaridade = calcularSimilaridade(palavra, candidata);
            if (similaridade > melhorSimilaridade) {
                melhorSimilaridade = similaridade;
                melhorPalavra = candidata;
            }
        }

        // Só troca se a similaridade for razoável (>70%)
        return melhorSimilaridade >= 0.7 ? melhorPalavra : palavra;
    }

    function calcularSimilaridade(a, b) {
        a = a.toLowerCase();
        b = b.toLowerCase();
        const matriz = [];

        for (let i = 0; i <= b.length; i++) {
            matriz[i] = [i];
        }
        for (let j = 0; j <= a.length; j++) {
            matriz[0][j] = j;
        }

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matriz[i][j] = matriz[i - 1][j - 1];
                } else {
                    matriz[i][j] = Math.min(
                        matriz[i - 1][j - 1] + 1,
                        matriz[i][j - 1] + 1,
                        matriz[i - 1][j] + 1
                    );
                }
            }
        }

        const distancia = matriz[b.length][a.length];
        const tamanhoMaior = Math.max(a.length, b.length);
        return (tamanhoMaior - distancia) / tamanhoMaior;
    }

    const palavras = texto.split(/\s+/);
    const corrigido = palavras.map(palavra => encontrarMaisParecida(palavra));
    return corrigido.join(' ');
}

async function gerarExtratoAnual(periodo, resumo) {
    let resposta = `📊 *EXTRATO (Ano de ${periodo})*\n`;

    const resumoPorMes = {};

    resumo.transacoes.forEach(t => {
        const data = new Date(t.data);
        const mesAno = `${String(data.getMonth() + 1).padStart(2, '0')}/${data.getFullYear()}`;
        if (!resumoPorMes[mesAno]) {
            resumoPorMes[mesAno] = { entradas: 0, saidas: 0 };
        }
        if (t.tipo === 'entrada') {
            resumoPorMes[mesAno].entradas += Number(t.valor) || 0;
        } else {
            resumoPorMes[mesAno].saidas += Number(t.valor) || 0;
        }
    });

    let totalEntradas = 0;
    let totalSaidas = 0;

    for (const mesAno of Object.keys(resumoPorMes).sort()) {
        const { entradas, saidas } = resumoPorMes[mesAno];
        const subtotal = entradas - saidas;

        resposta += `\n📅 *${mesAno}*\n`;
        resposta += `⬆️ Entradas: R$ ${entradas.toFixed(2)}\n`;
        resposta += `⬇️ Saídas: R$ ${saidas.toFixed(2)}\n`;
        resposta += `💰 Subtotal: R$ ${subtotal.toFixed(2)}\n`;

        totalEntradas += entradas;
        totalSaidas += saidas;
    }

    const saldoFinal = totalEntradas - totalSaidas;
    resposta += `\n💵 *Total de entradas:* R$ ${totalEntradas.toFixed(2)}`;
    resposta += `\n💸 *Total de saídas:* R$ ${totalSaidas.toFixed(2)}`;
    resposta += `\n💰 *Saldo final:* R$ ${saldoFinal.toFixed(2)}`;

    return resposta;
}

async function mostrarInstrucoes(msg) {
    await msg.reply(`Olá! 👋 Sou seu assistente financeiro via WhatsApp.  
Registro gastos, entradas e gero relatórios. Veja como me usar:

💸 *Registrar Transações*
* Entrada:  
  50 venda de bolo  
  ou  
  Vendi um bolo por 50 reais.

* Saída:  
  -100 aluguel  
  ou  
  Paguei 100 reais de aluguel.

* Com data específica:  
  30/04/2025 -20 uber  
  ou  
  No dia 30/04/2025 gastei 20 reais em Uber.

⚡ *Dica:* sempre deixe claro se é um *gasto* ou *recebimento*.  
Se o lançamento sair errado, envie *apagar último* e tente novamente.

📊 *Consultar Dados*
* Extrato de hoje: extrato hoje
* Extrato do mês: extrato abril
* Extrato anul: extrato do ano atual
* Saldo atual: saldo
* Gastos de ontem: gastos ontem

🗑️ *Gerenciar Lançamentos*
* Listar lançamentos: listar
* Apagar último: apagar último
* Apagar específico: apagar 2 (veja o número da lista)
* Apagar tudo: apagar tudo (será necessário confirmar)

🎙️ *Funcionalidades Extras*
* Envie *áudios* que eu transcrevo e processo automaticamente!`);
}

client.on('disconnected', (reason) => {
    console.log('Desconectado:', reason);
});
