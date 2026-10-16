// Cliente do endpoint GET /v1/contratacoes/proposta
// (consultarContratacaoPeriodoRecebimentoPropostas) da API de consulta do PNCP.
//
// Parâmetros (Swagger): dataFinal (yyyyMMdd, obrigatório), pagina (>=1, obrigatório),
// tamanhoPagina (10..50), codigoModalidadeContratacao, uf, codigoMunicipioIbge, cnpj...
// Retorna contratações com recebimento de propostas aberto e encerramento até dataFinal.
// A resposta não tem ordenação garantida e a API limita a taxa de requisições
// (devolve uma página HTML "Limite de requisições excedido").

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function formatarData(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

export class ErroPncp extends Error {}

export function criarClientePncp({
  apiBase,
  intervaloMs = 4000,
  esperasRetentativa = [30000, 60000, 90000, 120000, 180000],
  timeoutMs = 90000,
  fetchFn = fetch,
  log = () => {},
}) {
  let ultimaRequisicao = 0;

  async function buscarPagina(params) {
    const url = new URL(`${apiBase}/v1/contratacoes/proposta`);
    for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);

    for (let tentativa = 0; ; tentativa++) {
      const espera = ultimaRequisicao + intervaloMs - Date.now();
      if (espera > 0) await sleep(espera);
      ultimaRequisicao = Date.now();

      let motivo;
      try {
        const resp = await fetchFn(url, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (resp.status === 204) return { data: [], totalPaginas: 0, totalRegistros: 0 };
        const texto = await resp.text();
        const tipo = resp.headers.get('content-type') || '';
        if (resp.ok && tipo.includes('json')) return JSON.parse(texto);
        if (resp.status === 400 || resp.status === 422) {
          throw new ErroPncp(`Parâmetros rejeitados pela API (${resp.status}): ${texto.slice(0, 300)}`);
        }
        motivo = /limite de requisi/i.test(texto) ? 'limite de requisições' : `HTTP ${resp.status}`;
      } catch (e) {
        if (e instanceof ErroPncp) throw e;
        motivo = e.name === 'TimeoutError' ? 'timeout' : e.message;
      }

      if (tentativa >= esperasRetentativa.length) {
        throw new ErroPncp(`Falha ao consultar ${url} após ${tentativa + 1} tentativas (${motivo})`);
      }
      log(`PNCP: ${motivo}; nova tentativa em ${esperasRetentativa[tentativa] / 1000}s`);
      await sleep(esperasRetentativa[tentativa]);
    }
  }

  // Percorre todas as páginas de uma consulta, devolvendo uma página por vez.
  async function* paginasAbertas({ dataFinal, modalidade, tamanhoPagina = 50, maxPaginas = Infinity }) {
    let totalPaginas = 1;
    for (let pagina = 1; pagina <= Math.min(totalPaginas, maxPaginas); pagina++) {
      const r = await buscarPagina({ dataFinal, codigoModalidadeContratacao: modalidade, pagina, tamanhoPagina });
      totalPaginas = r.totalPaginas || 0;
      if (!r.data?.length) break;
      yield { pagina, totalPaginas, itens: r.data };
    }
  }

  return { buscarPagina, paginasAbertas };
}
