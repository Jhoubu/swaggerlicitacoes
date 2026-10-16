// Configuração via variáveis de ambiente, com padrões razoáveis para o MVP.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;

// Códigos de modalidade do PNCP (manual de integração / tabela de domínio).
export const MODALIDADES = {
  1: 'Leilão - Eletrônico',
  2: 'Diálogo Competitivo',
  3: 'Concurso',
  4: 'Concorrência - Eletrônica',
  5: 'Concorrência - Presencial',
  6: 'Pregão - Eletrônico',
  7: 'Pregão - Presencial',
  8: 'Dispensa',
  9: 'Inexigibilidade',
  10: 'Manifestação de Interesse',
  11: 'Pré-qualificação',
  12: 'Credenciamento',
  13: 'Leilão - Presencial',
};

export const config = {
  raiz,
  porta: Number(env.PORT || 3000),
  dbPath: env.RADAR_DB || path.join(raiz, 'data', 'radar.db'),
  apiBase: env.PNCP_API || 'https://pncp.gov.br/api/consulta',
  // Pregão eletrônico (6), dispensa (8) e concorrência eletrônica (4).
  // A API não tem busca textual: cada modalidade exige varrer todas as páginas.
  modalidades: (env.RADAR_MODALIDADES || '6,8,4').split(',').map((s) => Number(s.trim())).filter(Boolean),
  // Janela de encerramento das propostas: de agora até hoje + N dias.
  // Como a coleta é diária, licitações com prazo maior entram na janela depois.
  diasJanela: Number(env.RADAR_DIAS || 30),
  tamanhoPagina: 50, // máximo aceito pela API
  intervaloMs: Number(env.RADAR_INTERVALO_MS || 4000), // a API devolve 429 acima de ~15 req/min
  maxPaginas: env.RADAR_MAX_PAGINAS ? Number(env.RADAR_MAX_PAGINAS) : Infinity, // por modalidade (útil em testes)
  horaColeta: Number(env.RADAR_HORA || 6), // hora local da coleta diária
  agendamentoAtivo: env.RADAR_AGENDAMENTO !== '0',
};
