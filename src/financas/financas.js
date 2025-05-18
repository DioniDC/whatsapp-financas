const Database = require('./database');

function criarDataComHorarioBrasilia(dia, mes, ano) {
    // Cria a data no horário local de Brasília
    const data = new Date(ano, mes - 1, dia);
    
    // Ajusta para o mesmo dia, mesmo se o UTC for diferente
    return new Date(data.getFullYear(), data.getMonth(), data.getDate());
}

class Financas {
    constructor() {
        this.db = new Database();
    }

    async registrarTransacao(numero, texto, dataLancamento = null) {
        const partes = texto.split(/\s+/);
        const valorStr = partes.shift();
        const valor = parseFloat(valorStr.replace(',', '.'));
        const descricao = partes.join(' ') || 'Sem descrição';
    
        // Obtém a data atual no fuso horário de Brasília
        const getDataBrasilia = () => {
            const agora = new Date();
            // Ajusta para o horário de Brasília (UTC-3)
            const offsetBrasilia = 3 * 60 * 60 * 1000;
            return new Date(agora.getTime() - offsetBrasilia);
        };
    
        let dataSalva;
        if (dataLancamento) {
            if (typeof dataLancamento === 'string') {
                // Formato esperado: YYYY-MM-DD ou DD/MM/YYYY
                if (dataLancamento.includes('/')) {
                    const [dia, mes, ano] = dataLancamento.split('/');
                    dataSalva = new Date(ano, mes - 1, dia);
                } else {
                    dataSalva = new Date(dataLancamento);
                }
            } else if (dataLancamento instanceof Date) {
                dataSalva = dataLancamento;
            }
            
            // Garante que não há deslocamento de horário
            dataSalva = new Date(dataSalva.getFullYear(), dataSalva.getMonth(), dataSalva.getDate());
        } else {
            dataSalva = getDataBrasilia();
        }
    
        // Formata como YYYY-MM-DD para armazenamento
        const dataParaArmazenar = dataSalva.toISOString().split('T')[0];
    
        await this.db.salvarTransacaoComData(
            numero, 
            valor, 
            descricao, 
            dataParaArmazenar
        );
    
        return { 
            tipo: valor > 0 ? 'entrada' : 'saida', 
            valor: Math.abs(valor), 
            descricao, 
            data: dataSalva 
        };
    }

    async gerarResumo(numero, periodo) {
        const transacoes = await this.db.buscarTransacoes(numero, periodo);

        let entradas = 0;
        let saidas = 0;

        transacoes.forEach(t => {
            if (t.tipo === 'entrada') entradas += t.valor;
            else saidas += t.valor;
        });

        const saldo = entradas - saidas;

        let periodoTexto;
        switch (periodo) {
            case 'dia': periodoTexto = 'HOJE'; break;
            case 'semana': periodoTexto = 'ESTA SEMANA'; break;
            case 'mes': periodoTexto = 'ESTE MÊS'; break;
            default: periodoTexto = 'GERAL';
        }

        return {
            periodo: periodoTexto,
            entradas,
            saidas,
            saldo,
            transacoes
        };
    }

    async gerarResumoPeriodo(numero, periodoDescricao) {
        let dataInicio, dataFim;
        const hoje = new Date();
        periodoDescricao = periodoDescricao
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase();

        if (periodoDescricao === 'dia') {
            const hojeData = new Date();
            dataInicio = new Date(hojeData.getFullYear(), hojeData.getMonth(), hojeData.getDate(), 0, 0, 0);
            dataFim = new Date(hojeData.getFullYear(), hojeData.getMonth(), hojeData.getDate(), 23, 59, 59, 999);

        } else if (periodoDescricao === 'ontem') {
            const ontem = new Date();
            ontem.setDate(ontem.getDate() - 1);
            dataInicio = new Date(ontem.getFullYear(), ontem.getMonth(), ontem.getDate(), 0, 0, 0);
            dataFim = new Date(ontem.getFullYear(), ontem.getMonth(), ontem.getDate(), 23, 59, 59, 999);

        } else if (periodoDescricao === 'semana') {
            dataInicio = new Date(hoje);
            dataInicio.setDate(dataInicio.getDate() - dataInicio.getDay());
            dataInicio.setHours(0, 0, 0, 0);
            dataFim = new Date(dataInicio);
            dataFim.setDate(dataInicio.getDate() + 6);
            dataFim.setHours(23, 59, 59, 999);
            
        } else if (periodoDescricao === 'semana-passada') {
            dataFim = new Date(hoje);
            dataFim.setDate(dataFim.getDate() - hoje.getDay() - 1);
            dataFim.setHours(23, 59, 59, 999);

            dataInicio = new Date(dataFim);
            dataInicio.setDate(dataFim.getDate() - 6);
            dataInicio.setHours(0, 0, 0, 0);

        } else if (periodoDescricao === 'mes') {
            dataInicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
            dataFim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59);

        } else if (periodoDescricao === 'ano') {
            dataInicio = new Date(hoje.getFullYear(), 0, 1, 0, 0, 0);
            dataFim = new Date(hoje.getFullYear(), 11, 31, 23, 59, 59);
        
        } else if (periodoDescricao.startsWith('ultimos')) {
            const dias = parseInt(periodoDescricao.match(/\d+/)[0]) || 7;
            dataFim = new Date();
            dataInicio = new Date();
            dataInicio.setDate(dataFim.getDate() - (dias - 1));
            dataInicio.setHours(0, 0, 0, 0);
            dataFim.setHours(23, 59, 59, 999);

        } else if (/^\d{4}$/.test(periodoDescricao)) {
            // É um ano (ex: '2025')
            const ano = parseInt(periodoDescricao, 10);
            dataInicio = new Date(ano, 0, 1, 0, 0, 0);
            dataFim = new Date(ano, 11, 31, 23, 59, 59);

        } else {
            // mês por nome (ex: "abril de 2025")
            const matchComAno = periodoDescricao.match(/(\w+)\s+de\s+(\d{4})/);
            const matchSemAno = periodoDescricao.match(/^\w+$/);
            const meses = {
                'janeiro': 0, 'fevereiro': 1, 'marco': 2, 'abril': 3,
                'maio': 4, 'junho': 5, 'julho': 6, 'agosto': 7,
                'setembro': 8, 'outubro': 9, 'novembro': 10, 'dezembro': 11
            };

            if (matchComAno) {
                const [_, mes, ano] = matchComAno;
                dataInicio = new Date(parseInt(ano), meses[mes], 1);
                dataFim = new Date(parseInt(ano), meses[mes] + 1, 0, 23, 59, 59);

            } else if (matchSemAno) {
                const mesSolicitado = periodoDescricao;
                const mesAtual = hoje.getMonth();
                let ano = hoje.getFullYear();
                if (meses[mesSolicitado] > mesAtual) ano--;
                dataInicio = new Date(ano, meses[mesSolicitado], 1);
                dataFim = new Date(ano, meses[mesSolicitado] + 1, 0, 23, 59, 59);

            } else {
                throw new Error('Formato do período inválido.');
            }
        }

        const transacoes = await this.db.buscarTransacoesIntervalo(numero, dataInicio, dataFim);

        let entradas = 0, saidas = 0;
        transacoes.forEach(t => {
            const valor = Number(t.valor) || 0;
            if (t.tipo === 'entrada') entradas += valor;
            else saidas += valor;
        });

        return { saldo: entradas - saidas, entradas, saidas, transacoes };
    }

    async gerarResumoData(numero, dataISO) {
        const [ano, mes, dia] = dataISO.split('-').map(Number);
        const dataInicio = new Date(ano, mes - 1, dia, 0, 0, 0);
        const dataFim = new Date(ano, mes - 1, dia, 23, 59, 59, 999);

        const transacoes = await this.db.buscarTransacoesIntervalo(numero, dataInicio, dataFim);

        let entradas = 0, saidas = 0;
        transacoes.forEach(t => {
            if (t.tipo === 'entrada') entradas += t.valor;
            else saidas += t.valor;
        });

        return { saldo: entradas - saidas, entradas, saidas, transacoes };
    }

    async listarUltimosLancamentos(numero) {
        return await this.db.all(
            `SELECT id, valor, tipo, descricao, data
             FROM transacoes
             WHERE numero = ?
             ORDER BY datetime(data) DESC
             LIMIT 20`,
            [numero]
        );
    }

    async apagarLancamentoPorId(id) {
        const result = await this.db.run(
            `DELETE FROM transacoes WHERE id = ?`,
            [id]
        );
        return result.changes > 0;
    }

    async apagarUltimoLancamento(numero) {
        const row = await this.db.get(
            `SELECT id, valor, tipo, descricao, data 
             FROM transacoes 
             WHERE numero = ? 
             ORDER BY id DESC 
             LIMIT 1`,
            [numero]
        );
    
        if (!row) return null; // Não achou
    
        const deletado = await this.db.run(
            `DELETE FROM transacoes WHERE id = ?`,
            [row.id]
        );
    
        if (deletado.changes > 0) {
            return row; // Retorna o que apagou (valor, descricao, data)
        } else {
            return null;
        }
    }
    
    async apagarTodosLancamentos(numero) {
        const result = await this.db.run(
            `DELETE FROM transacoes WHERE numero = ?`,
            [numero]
        );
        return result.changes > 0;
    }
    
}

module.exports = new Financas();
