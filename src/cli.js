// Coleta manual: `npm run coletar` (ou `npm run coletar -- --max-paginas 2`).
// Também serve para agendar pelo Agendador de Tarefas do Windows / cron.
import { config } from './config.js';
import { abrirBanco } from './db.js';
import { executarColeta } from './coletor.js';

const args = process.argv.slice(2);
const opcoes = {};
const valor = (nome) => {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : undefined;
};
if (valor('--max-paginas')) opcoes.maxPaginas = Number(valor('--max-paginas'));
if (valor('--dias')) opcoes.diasJanela = Number(valor('--dias'));
if (valor('--modalidades')) opcoes.modalidades = valor('--modalidades').split(',').map(Number);

const db = abrirBanco(config.dbPath);
try {
  await executarColeta(db, opcoes);
} catch {
  process.exitCode = 1;
} finally {
  db.close();
}
