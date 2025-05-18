const sqlite3 = require('sqlite3').verbose();

class Database {
    constructor() {
        this.db = new sqlite3.Database('./financas.db');
        this.initDatabase();
    }

    initDatabase() {
        this.db.serialize(() => {
            this.db.run(`CREATE TABLE IF NOT EXISTS transacoes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                numero TEXT NOT NULL,
                valor REAL NOT NULL,
                tipo TEXT NOT NULL,
                descricao TEXT,
                data TEXT NOT NULL
            )`);
        });
    }

    salvarTransacao(numero, valor, descricao) {
        const brasilAgora = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
        const data = new Date(brasilAgora).toISOString();
        
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT INTO transacoes (numero, valor, tipo, descricao, data) VALUES (?, ?, ?, ?, ?)',
                [numero, Math.abs(valor), tipo, descricao, data],
                (err) => err ? reject(err) : resolve()
            );
        });
    }

    salvarTransacaoComData(numero, valor, descricao, dataPersonalizada) {
        const tipo = valor >= 0 ? 'entrada' : 'saida';
        
        // Padroniza a data para YYYY-MM-DD sem horário
        let dataFormatada;
        if (dataPersonalizada.includes('T')) {
            // Se veio com horário, pega apenas a parte da data
            dataFormatada = dataPersonalizada.split('T')[0];
        } else if (dataPersonalizada.match(/^\d{4}-\d{2}-\d{2}$/)) {
            // Já está no formato correto
            dataFormatada = dataPersonalizada;
        } else {
            // Converte de outros formatos se necessário
            const [dia, mes, ano] = dataPersonalizada.split('/');
            dataFormatada = `${ano}-${mes}-${dia}`;
        }
        
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT INTO transacoes (numero, valor, tipo, descricao, data) VALUES (?, ?, ?, ?, ?)',
                [numero, Math.abs(valor), tipo, descricao, dataFormatada],
                (err) => err ? reject(err) : resolve()
            );
        });
    }

    buscarTransacoes(numero, periodo = 'dia') {
        let dataInicio, dataFim;
        const brasilAgora = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
        const hoje = new Date(brasilAgora);
    
        switch (periodo) {
            case 'dia':
                dataInicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
                dataFim = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 23, 59, 59, 999);
                break;
            case 'semana':
                const primeiroDiaSemana = new Date(hoje);
                primeiroDiaSemana.setDate(hoje.getDate() - hoje.getDay());
                dataInicio = new Date(primeiroDiaSemana.getFullYear(), primeiroDiaSemana.getMonth(), primeiroDiaSemana.getDate());
                dataFim = new Date();
                break;
            case 'mes':
                dataInicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
                dataFim = new Date();
                break;
            default:
                dataInicio = new Date(0);
                dataFim = new Date();
        }

        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT valor, tipo, descricao, data 
                 FROM transacoes 
                 WHERE numero = ? 
                 AND date(datetime(data)) BETWEEN date(?) AND date(?)
                 ORDER BY datetime(data) DESC`,
                [numero, this.formatarData(dataInicio), this.formatarData(dataFim)],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }
    
    buscarTransacoesIntervalo(numero, dataInicio, dataFim) {
        // Garante que as datas estão no formato YYYY-MM-DD
        const inicioFormatado = this.formatarData(dataInicio);
        const fimFormatado = this.formatarData(dataFim);
        
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT id, valor, tipo, descricao, data
                 FROM transacoes
                 WHERE numero = ?
                 AND date(data) BETWEEN date(?) AND date(?)
                 ORDER BY date(data) DESC`,
                [numero, inicioFormatado, fimFormatado],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    formatarData(d) {
        return d.getFullYear() + '-' +
               String(d.getMonth() + 1).padStart(2, '0') + '-' +
               String(d.getDate()).padStart(2, '0');
    }

    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve(this);
            });
        });
    }

}

module.exports = Database;