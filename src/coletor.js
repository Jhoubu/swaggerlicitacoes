// Executa uma coleta completa: consulta o PNCP, filtra, classifica e grava.
import { config, MODALIDADES } from './config.js';
import { criarClientePncp, formatarData } from './pncp.js';
import { classificar } from './classificador.js';
import { salvarOportunidade } from './db.js';

// Reaplica as regras atuais aos registros já salvos (a partir do JSON original),
// para que ajustes no classificador valham também para o que foi coletado antes.
export function reclassificar(db) {
  const linhas = db.prepare('SELECT numero_controle_pncp, json FROM oportunidades').all();
  const atualizar = db.prepare('UPDATE oportunidades SET score = ?, faixa = ?, palavras_chave = ?, motivos = ?, observacoes = ? WHERE numero_controle_pncp = ?');
  const remover = db.prepare('DELETE FROM oportunidades WHERE numero_controle_pncp = ?');
  let removidos = 0;
  db.exec('BEGIN');
  for (const { numero_controle_pncp: id, json } of linhas) {
    const cls = classificar(JSON.parse(json));
    if (!cls.relevante) { remover.run(id); removidos++; continue; }
    atualizar.run(cls.score, cls.faixa, JSON.stringify(cls.palavrasChave), JSON.stringify(cls.motivos), JSON.stringify(cls.observacoes), id);
  }
  db.exec('COMMIT');
  return { total: linhas.length, removidos };
}

export async function executarColeta(db, opcoes = {}) {
  const cfg = { ...config, ...opcoes };
  const log = cfg.log || ((m) => console.log(`[${new Date().toLocaleTimeString('pt-BR')}] ${m}`));
  const cliente = cfg.cliente || criarClientePncp({ apiBase: cfg.apiBase, intervaloMs: cfg.intervaloMs, log });

  const inicio = new Date();
  const fimJanela = new Date(inicio.getTime() + cfg.diasJanela * 24 * 60 * 60 * 1000);
  const dataFinal = formatarData(fimJanela);
  const { lastInsertRowid: id } = db
    .prepare(`INSERT INTO coletas (inicio, status) VALUES (?, 'executando')`)
    .run(inicio.toISOString());
  const progresso = db.prepare('UPDATE coletas SET paginas = ?, lidos = ?, relevantes = ?, novos = ? WHERE id = ?');

  const vistos = new Set();
  const stats = { paginas: 0, lidos: 0, relevantes: 0, novos: 0 };
  log(`Coleta #${id}: modalidades ${cfg.modalidades.join(', ')}, encerramento até ${dataFinal}`);

  try {
    for (const modalidade of cfg.modalidades) {
      const paginas = cliente.paginasAbertas({
        dataFinal, modalidade, tamanhoPagina: cfg.tamanhoPagina, maxPaginas: cfg.maxPaginas,
      });
      for await (const { pagina, totalPaginas, itens } of paginas) {
        stats.paginas++;
        const agoraIso = new Date().toISOString();
        db.exec('BEGIN');
        for (const c of itens) {
          // A API não ordena os resultados: o mesmo registro pode reaparecer em outra página.
          if (vistos.has(c.numeroControlePNCP)) continue;
          vistos.add(c.numeroControlePNCP);
          stats.lidos++;
          const cls = classificar(c);
          if (!cls.relevante) continue;
          stats.relevantes++;
          if (salvarOportunidade(db, c, cls, agoraIso)) stats.novos++;
        }
        db.exec('COMMIT');
        progresso.run(stats.paginas, stats.lidos, stats.relevantes, stats.novos, id);
        log(`${MODALIDADES[modalidade] || modalidade}: página ${pagina}/${totalPaginas} — ${stats.relevantes} relevantes até agora (${stats.novos} novas)`);
      }
    }
    reclassificar(db); // recalcula o prazo restante dos itens que não vieram nesta coleta
    db.prepare(`UPDATE coletas SET status = 'ok', fim = ? WHERE id = ?`).run(new Date().toISOString(), id);
    log(`Coleta #${id} concluída: ${stats.lidos} lidas, ${stats.relevantes} relevantes, ${stats.novos} novas.`);
    return { id, ...stats };
  } catch (e) {
    if (db.isTransaction) db.exec('ROLLBACK');
    db.prepare(`UPDATE coletas SET status = 'erro', fim = ?, erro = ? WHERE id = ?`).run(new Date().toISOString(), e.message, id);
    log(`Coleta #${id} falhou: ${e.message}`);
    throw e;
  }
}
