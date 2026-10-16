import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarClientePncp, formatarData } from '../src/pncp.js';
import { abrirBanco, listarOportunidades } from '../src/db.js';
import { executarColeta, reclassificar } from '../src/coletor.js';

const contratacao = (seq, objeto, extra = {}) => ({
  numeroControlePNCP: `12345678000199-1-${String(seq).padStart(6, '0')}/2026`,
  orgaoEntidade: { cnpj: '12345678000199', razaoSocial: 'MUNICIPIO DE TESTE' },
  unidadeOrgao: { ufSigla: 'SP', municipioNome: 'Teste', nomeUnidade: 'PREFEITURA' },
  anoCompra: 2026, sequencialCompra: seq, objetoCompra: objeto,
  modalidadeId: 6, modalidadeNome: 'Pregão - Eletrônico', modoDisputaId: 1,
  valorTotalEstimado: 120000, dataEncerramentoProposta: '2099-01-10T10:00:00',
  ...extra,
});

const resposta = (status, corpo, tipo = 'application/json') =>
  new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status, headers: { 'content-type': tipo } });

test('formata dataFinal no padrão yyyyMMdd', () => {
  assert.equal(formatarData(new Date(2026, 0, 5)), '20260105');
});

test('cliente envia os parâmetros do Swagger, pagina e repete após limite de requisições', async () => {
  const urls = [];
  const fila = [
    resposta(429, '<html>Limite de requisições excedido</html>', 'text/html'),
    resposta(200, { data: [contratacao(1, 'a')], totalPaginas: 2 }),
    resposta(200, { data: [contratacao(2, 'b')], totalPaginas: 2 }),
  ];
  const cliente = criarClientePncp({
    apiBase: 'https://exemplo/api/consulta', intervaloMs: 0, esperasRetentativa: [1],
    fetchFn: async (url) => { urls.push(new URL(url)); return fila.shift(); },
  });
  const paginas = [];
  for await (const p of cliente.paginasAbertas({ dataFinal: '20261115', modalidade: 6 })) paginas.push(p);

  assert.equal(paginas.length, 2);
  assert.equal(urls.length, 3);
  assert.equal(urls[0].pathname, '/api/consulta/v1/contratacoes/proposta');
  assert.equal(urls[0].searchParams.get('dataFinal'), '20261115');
  assert.equal(urls[0].searchParams.get('codigoModalidadeContratacao'), '6');
  assert.equal(urls[0].searchParams.get('tamanhoPagina'), '50');
  assert.deepEqual(urls.map((u) => u.searchParams.get('pagina')), ['1', '1', '2']);
});

test('cliente trata 204 como página vazia e desiste após esgotar tentativas', async () => {
  const vazio = criarClientePncp({ apiBase: 'x:', intervaloMs: 0, fetchFn: async () => new Response(null, { status: 204 }) });
  const paginas = [];
  for await (const p of vazio.paginasAbertas({ dataFinal: '20261115', modalidade: 8 })) paginas.push(p);
  assert.equal(paginas.length, 0);

  const fora = criarClientePncp({ apiBase: 'x:', intervaloMs: 0, esperasRetentativa: [1, 1], fetchFn: async () => resposta(503, 'erro', 'text/plain') });
  await assert.rejects(fora.buscarPagina({ pagina: 1 }), /após 3 tentativas/);
});

test('coleta filtra, grava e não duplica registros entre páginas e entre coletas', async () => {
  const db = abrirBanco(':memory:');
  const paginas = [
    [contratacao(1, 'Locação de software de protocolo eletrônico'), contratacao(2, 'Aquisição de pneus')],
    // mesma contratação repetida em outra página (a API não ordena os resultados)
    [contratacao(1, 'Locação de software de protocolo eletrônico'), contratacao(3, 'Desenvolvimento de sistema web sob demanda')],
  ];
  const cliente = {
    async *paginasAbertas() {
      for (let i = 0; i < paginas.length; i++) yield { pagina: i + 1, totalPaginas: paginas.length, itens: paginas[i] };
    },
  };
  const opcoes = { cliente, modalidades: [6], log: () => {} };

  const r1 = await executarColeta(db, opcoes);
  assert.deepEqual({ lidos: r1.lidos, relevantes: r1.relevantes, novos: r1.novos }, { lidos: 3, relevantes: 2, novos: 2 });

  const r2 = await executarColeta(db, opcoes);
  assert.equal(r2.novos, 0);

  const ops = listarOportunidades(db);
  assert.equal(ops.length, 2);
  assert.equal(ops[0].link_pncp.startsWith('https://pncp.gov.br/app/editais/12345678000199/2026/'), true);
  assert.equal(db.prepare(`SELECT count(*) n FROM coletas WHERE status = 'ok'`).get().n, 2);
});

test('falha na API registra a coleta como erro', async () => {
  const db = abrirBanco(':memory:');
  const cliente = { async *paginasAbertas() { throw new Error('PNCP indisponível'); } };
  await assert.rejects(executarColeta(db, { cliente, modalidades: [6], log: () => {} }), /indisponível/);
  const c = db.prepare('SELECT status, erro FROM coletas').get();
  assert.equal(c.status, 'erro');
  assert.match(c.erro, /indisponível/);
});

test('reclassificar aplica as regras atuais e remove o que deixou de ser relevante', async () => {
  const db = abrirBanco(':memory:');
  const itens = [contratacao(1, 'Locação de software de protocolo eletrônico'), contratacao(2, 'Desenvolvimento de sistema web sob demanda')];
  const cliente = { async *paginasAbertas() { yield { pagina: 1, totalPaginas: 1, itens }; } };
  await executarColeta(db, { cliente, modalidades: [6], log: () => {} });

  // simula um registro gravado por uma versão antiga do filtro
  const antigo = contratacao(2, 'Serviços de coffee break sob demanda');
  db.prepare('UPDATE oportunidades SET json = ?, score = 99 WHERE numero_controle_pncp = ?').run(JSON.stringify(antigo), antigo.numeroControlePNCP);
  db.prepare('UPDATE oportunidades SET score = 1 WHERE numero_controle_pncp = ?').run(itens[0].numeroControlePNCP);

  assert.deepEqual(reclassificar(db), { total: 2, removidos: 1 });
  const ops = listarOportunidades(db);
  assert.equal(ops.length, 1);
  assert.ok(ops[0].score > 1);
});
