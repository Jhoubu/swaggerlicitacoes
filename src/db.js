// Armazenamento em SQLite (módulo nativo node:sqlite, sem dependências externas).
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function abrirBanco(arquivo) {
  if (arquivo !== ':memory:') fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  const db = new DatabaseSync(arquivo);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 10000;

    CREATE TABLE IF NOT EXISTS oportunidades (
      numero_controle_pncp TEXT PRIMARY KEY,
      cnpj TEXT, ano INTEGER, sequencial INTEGER, numero_compra TEXT, processo TEXT,
      orgao TEXT, unidade TEXT, uf TEXT, municipio TEXT,
      objeto TEXT, informacao_complementar TEXT,
      valor_estimado REAL,
      data_abertura TEXT, data_encerramento TEXT, data_publicacao TEXT,
      modalidade_id INTEGER, modalidade_nome TEXT, modo_disputa_nome TEXT,
      situacao TEXT, srp INTEGER,
      link_pncp TEXT, link_origem TEXT,
      score INTEGER, faixa TEXT, palavras_chave TEXT, motivos TEXT, observacoes TEXT,
      classificacao TEXT NOT NULL DEFAULT 'preliminar',
      primeira_coleta TEXT NOT NULL, ultima_coleta TEXT NOT NULL,
      json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_op_encerramento ON oportunidades(data_encerramento);
    CREATE INDEX IF NOT EXISTS idx_op_score ON oportunidades(score);

    CREATE TABLE IF NOT EXISTS coletas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inicio TEXT NOT NULL, fim TEXT,
      status TEXT NOT NULL, -- executando | ok | erro | interrompida
      paginas INTEGER DEFAULT 0, lidos INTEGER DEFAULT 0,
      relevantes INTEGER DEFAULT 0, novos INTEGER DEFAULT 0,
      erro TEXT
    );
  `);
  // Coletas que ficaram "executando" de um processo encerrado à força.
  db.prepare(`UPDATE coletas SET status = 'interrompida', fim = ? WHERE status = 'executando'`).run(new Date().toISOString());
  return db;
}

export function linkPncp(c) {
  return `https://pncp.gov.br/app/editais/${c.orgaoEntidade.cnpj}/${c.anoCompra}/${c.sequencialCompra}`;
}

// Insere ou atualiza (chave: numeroControlePNCP). Retorna true se for novo.
export function salvarOportunidade(db, c, cls, agoraIso) {
  const existe = db.prepare('SELECT 1 FROM oportunidades WHERE numero_controle_pncp = ?').get(c.numeroControlePNCP);
  db.prepare(`
    INSERT INTO oportunidades (
      numero_controle_pncp, cnpj, ano, sequencial, numero_compra, processo,
      orgao, unidade, uf, municipio, objeto, informacao_complementar, valor_estimado,
      data_abertura, data_encerramento, data_publicacao,
      modalidade_id, modalidade_nome, modo_disputa_nome, situacao, srp,
      link_pncp, link_origem, score, faixa, palavras_chave, motivos, observacoes,
      primeira_coleta, ultima_coleta, json
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(numero_controle_pncp) DO UPDATE SET
      orgao = excluded.orgao, unidade = excluded.unidade, objeto = excluded.objeto,
      informacao_complementar = excluded.informacao_complementar,
      valor_estimado = excluded.valor_estimado, data_abertura = excluded.data_abertura,
      data_encerramento = excluded.data_encerramento, situacao = excluded.situacao,
      modo_disputa_nome = excluded.modo_disputa_nome, link_origem = excluded.link_origem,
      score = excluded.score, faixa = excluded.faixa, palavras_chave = excluded.palavras_chave,
      motivos = excluded.motivos, observacoes = excluded.observacoes,
      ultima_coleta = excluded.ultima_coleta, json = excluded.json
  `).run(
    c.numeroControlePNCP, c.orgaoEntidade?.cnpj ?? null, c.anoCompra, c.sequencialCompra,
    c.numeroCompra ?? null, c.processo ?? null,
    c.orgaoEntidade?.razaoSocial ?? null, c.unidadeOrgao?.nomeUnidade ?? null,
    c.unidadeOrgao?.ufSigla ?? null, c.unidadeOrgao?.municipioNome ?? null,
    c.objetoCompra ?? null, c.informacaoComplementar ?? null, c.valorTotalEstimado ?? null,
    c.dataAberturaProposta ?? null, c.dataEncerramentoProposta ?? null, c.dataPublicacaoPncp ?? null,
    c.modalidadeId ?? null, c.modalidadeNome ?? null, c.modoDisputaNome ?? null,
    c.situacaoCompraNome ?? null, c.srp ? 1 : 0,
    linkPncp(c), c.linkSistemaOrigem || c.linkProcessoEletronico || null,
    cls.score, cls.faixa, JSON.stringify(cls.palavrasChave), JSON.stringify(cls.motivos),
    JSON.stringify(cls.observacoes), agoraIso, agoraIso, JSON.stringify(c),
  );
  return !existe;
}

export function listarOportunidades(db, { incluirEncerradas = false } = {}) {
  // Datas do PNCP vêm em horário de Brasília sem fuso ("2026-10-20T09:30:00").
  const agora = new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).replace(' ', 'T');
  const linhas = db.prepare(`
    SELECT numero_controle_pncp, orgao, unidade, uf, municipio, objeto, valor_estimado,
           data_abertura, data_encerramento, modalidade_id, modalidade_nome, modo_disputa_nome,
           srp, link_pncp, link_origem, score, faixa, palavras_chave, motivos, observacoes,
           classificacao, primeira_coleta, ultima_coleta
    FROM oportunidades
    ${incluirEncerradas ? '' : 'WHERE data_encerramento >= ?'}
    ORDER BY score DESC, data_encerramento ASC
  `).all(...(incluirEncerradas ? [] : [agora]));
  return linhas.map((l) => ({
    ...l,
    palavras_chave: JSON.parse(l.palavras_chave || '[]'),
    motivos: JSON.parse(l.motivos || '[]'),
    observacoes: JSON.parse(l.observacoes || '[]'),
  }));
}

export function ultimasColetas(db, limite = 10) {
  return db.prepare('SELECT * FROM coletas ORDER BY id DESC LIMIT ?').all(limite);
}
