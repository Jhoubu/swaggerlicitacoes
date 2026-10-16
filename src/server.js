// Servidor HTTP: interface web, API JSON e agendamento da coleta diária.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { abrirBanco, listarOportunidades, ultimasColetas } from './db.js';
import { executarColeta, reclassificar } from './coletor.js';

const db = abrirBanco(config.dbPath);
reclassificar(db);
let coletaEmAndamento = null;

function iniciarColeta() {
  if (coletaEmAndamento) return false;
  coletaEmAndamento = executarColeta(db)
    .catch(() => {}) // o erro já fica registrado na tabela coletas
    .finally(() => { coletaEmAndamento = null; });
  return true;
}

// Agendamento diário: a cada 10 min verifica se já passou da hora configurada
// e se ainda não houve coleta bem-sucedida hoje. Funciona mesmo que o
// computador tenha ficado desligado/suspenso no horário exato.
function verificarAgendamento() {
  const agora = new Date();
  if (agora.getHours() < config.horaColeta) return;
  const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), config.horaColeta).toISOString();
  const umaHoraAtras = new Date(agora.getTime() - 60 * 60 * 1000).toISOString();
  // Falhas (ex.: PNCP fora do ar) são retentadas no máximo uma vez por hora.
  const jaColetou = db
    .prepare(`SELECT 1 FROM coletas WHERE (status IN ('ok', 'executando') AND inicio >= ?) OR inicio >= ?`)
    .get(inicioHoje, umaHoraAtras);
  if (!jaColetou) iniciarColeta();
}

function json(res, status, corpo) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(corpo));
}

const indexHtml = path.join(config.raiz, 'public', 'index.html');

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(indexHtml).pipe(res);
    } else if (req.method === 'GET' && url.pathname === '/api/oportunidades') {
      json(res, 200, listarOportunidades(db, { incluirEncerradas: url.searchParams.get('encerradas') === '1' }));
    } else if (req.method === 'GET' && url.pathname === '/api/status') {
      json(res, 200, {
        coletando: Boolean(coletaEmAndamento),
        agendamento: config.agendamentoAtivo ? `diária, a partir das ${config.horaColeta}h` : 'desativada',
        coletas: ultimasColetas(db),
      });
    } else if (req.method === 'POST' && url.pathname === '/api/coletar') {
      json(res, iniciarColeta() ? 202 : 409, { coletando: true });
    } else {
      json(res, 404, { erro: 'não encontrado' });
    }
  } catch (e) {
    json(res, 500, { erro: e.message });
  }
});

server.listen(config.porta, () => {
  console.log(`Radar de licitações em http://localhost:${config.porta}`);
  if (config.agendamentoAtivo) {
    console.log(`Coleta automática diária a partir das ${config.horaColeta}h (verificação a cada 10 min).`);
    verificarAgendamento();
    setInterval(verificarAgendamento, 10 * 60 * 1000);
  }
});
