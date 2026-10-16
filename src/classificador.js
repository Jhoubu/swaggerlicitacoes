// Filtro por palavras-chave e pontuação preliminar (0–100) de cada contratação.
//
// A classificação usa apenas o resumo publicado no PNCP (objeto, valor,
// modalidade e datas). Ela NÃO afirma nada que dependa do edital
// (prova de conceito, módulos exigidos, prazo de execução etc.).

export function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

const re = (fonte) => new RegExp(`\\b(?:${fonte})\\b`);

// Termos que, sozinhos, indicam uma contratação de software/solução digital.
// Os marcados com GENERICO dependem só da palavra "sistema" e são ignorados
// quando o objeto tem um "sistema de ..." fora de TI (incêndio, ar condicionado...).
const GENERICO = true;
const TERMOS_FORTES = [
  ['software', re('softwares?')],
  ['SaaS', re('saas|software como servico')],
  ['sistema web', re('sistemas? (?:web|online|on-line|em nuvem)|plataformas? (?:web|online|on-line)')],
  ['plataforma digital', re('plataformas? digita(?:l|is)|plataformas? tecnologicas?')],
  ['aplicativo', re('aplicativos? (?:movel|moveis|mobile|web|para (?:celular|smartphone|dispositivos? moveis))|app mobile|desenvolvimento de aplicativos?')],
  ['portal web', re('portal (?:institucional|da transparencia|do cidadao|do servidor|de servicos|web|eletronico)|site institucional|sitio eletronico|website')],
  ['desenvolvimento de sistemas', re('desenvolvimento (?:de |do |dos )?(?:sistemas?|softwares?|aplicativos?|solucao|solucoes|plataformas?|portal|portais|site|sitio)'), GENERICO],
  ['desenvolvimento sob demanda', re('fabrica de software|pontos? de funcao|unidades? de servico tecnico|ust|desenvolvimento (?:\\w+ ){0,4}sob demanda|sob demanda (?:\\w+ ){0,4}(?:sistemas?|softwares?)')],
  ['locação de software', re('locacao (?:de |do |dos )?(?:softwares?|sistemas?|licencas?|programas?)')],
  ['licença de uso', re('licencas? (?:de )?(?:direito de )?uso|licenciamento (?:de )?(?:direito de )?uso|cessao (?:de )?(?:direito de )?uso (?:de |do )?(?:softwares?|sistemas?|programas?)')],
  ['solução informatizada', re('solu(?:cao|coes) (?:informatizadas?|tecnologicas?|digita(?:l|is)|de ti|de software|de tecnologia da informacao)|sistemas? informatizados?|sistemas? de informatica')],
  ['sistema de gestão', re('sistemas? (?:integrados? )?de gestao'), GENERICO],
  ['gestão de chamados', re('gestao de chamados|abertura de chamados|help ?desk|service ?desk')],
  ['protocolo eletrônico', re('protocolo (?:eletronico|digital|online|on-line|web)')],
  ['automação de processos', re('automacao (?:de |dos )?processos|rpa|robotic process automation')],
  ['chatbot', re('chat ?bots?|assistente virtual|atendimento virtual')],
  ['inteligência artificial', re('inteligencia artificial|ia generativa')],
  ['manutenção de sistemas', re('(?:manutencao|sustentacao|suporte) (?:evolutiva |corretiva |tecnica )?(?:de |do |dos )?(?:sistemas?|softwares?)'), GENERICO],
];

// Termos que só contam quando há contexto tecnológico no texto
// ("agendamento de entregas" não é software; "sistema de agendamento online" é).
const TERMOS_CONTEXTUAIS = [
  ['agendamento', re('agendamentos?')],
  ['ouvidoria', re('ouvidoria')],
  ['gestão documental', re('gestao (?:eletronica )?(?:de )?documentos|gestao documental|ged')],
  ['assinatura eletrônica', re('assinatura (?:digital|eletronica)')],
];
const CONTEXTO_TECNOLOGICO = re('sistemas?|plataformas?|online|on-line|web|digita(?:l|is)|eletronic[oa]s?|informatizad[oa]s?|tecnologia|aplicativos?|nuvem');

// Trechos padronizados que não dizem nada sobre o objeto e confundem o filtro.
const RUIDO = /\[?portal de compras publicas\]?|(?:sob o |pelo )?sistema de registro de precos?|\bsrp\b/g;

// Indícios fortes de que "software/sistema" aparece fora do contexto de TI.
const FALSOS_POSITIVOS = re('sistemas? de (?:combate a incendio|prevencao (?:e combate )?(?:a|contra) incendio|ar condicionado|climatizacao|som|sonorizacao|iluminacao|abastecimento|esgot\\w*|drenagem|energia solar|aterramento|alarme|cftv|pressurizacao|freios?|irrigacao|gases|seguranca|monitoramento|bombeamento|refrigeracao|aquecimento|exaustao|tratamento|elevadores?|videomonitoramento)|sistema fotovoltaico|sistema viario');

// Sinais que aumentam ou reduzem a pontuação.
const SINAIS = [
  { pts: 20, motivo: 'Desenvolvimento sob demanda / customização', re: re('desenvolvimento (?:de |do |dos )?(?:sistemas?|softwares?|aplicativos?|solucao|solucoes|plataformas?|portal|portais|site|sitio)|fabrica de software|pontos? de funcao|customizac(?:ao|oes)|personalizac(?:ao|oes)|manutencao evolutiva') },
  { pts: 12, motivo: 'Sistema administrativo de escopo delimitado', re: re('agendamentos?|chamados|help ?desk|service ?desk|protocolo|ouvidoria|almoxarifado|patrimonio|frotas?|controle de ponto|gestao (?:de )?documentos|gestao documental|tramitacao|processos? administrativos?|portal|transparencia|pesquisa de satisfacao|gestao de filas|senhas? de atendimento|biblioteca|consignac(?:ao|oes)|consignavel') },
  { pts: 10, motivo: 'Automação / chatbot / IA', re: re('automacao|automatizac(?:ao|oes)|rpa|chat ?bots?|assistente virtual|atendimento virtual|inteligencia artificial|ia generativa|whatsapp') },
  { pts: 6, motivo: 'Modelo SaaS / locação / licença de uso', re: re('saas|software como servico|em nuvem|locacao (?:de |do |dos )?(?:softwares?|sistemas?)|licencas? (?:de )?(?:direito de )?uso|cessao (?:de )?(?:direito de )?uso|sistemas? (?:web|online|on-line)') },

  { pts: -25, motivo: 'Sistema hospitalar / saúde especializado', re: re('hospita(?:l|lar|res|is)|prontuarios? eletronicos?|pep|upa|ubs|regulacao|faturamento (?:sus|hospitalar)|laboratori(?:o|al|ais)|pacs|ris|radiologia|farmacia hospitalar|leitos|centro cirurgico') },
  { pts: -20, motivo: 'ERP / gestão pública integrada (complexo)', re: re('erp|sistemas? integrados?|informatica integrada|gestao publica|gestao (?:publica )?integrada|solucao integrada|contabilidade publica|contabil|tributa(?:cao|rio|ria)|arrecadacao|iptu|iss|nfs-?e|nota fiscal eletronica|folha de pagamento|recursos humanos|esocial|siconfi|sicom|orcamentari[oa]|compras e licitacoes') },
  { pts: -12, motivo: 'Solução muito especializada', re: re('georreferenc\\w*|geoprocessamento|sig|telemetria|videomonitoramento|monitoramento (?:por cameras|eletronico)|rastreamento|reconhecimento facial|biometri\\w*|bilhetagem|semaforic\\w*|radares?|cadastro imobiliario|cadastro multifinalitario|aerofotogrametri\\w*|bim|sped|bancos? de precos|transito|fiscalizacao eletronica|seguranca da informacao|ciberneti\\w*|simulador') },
  { pts: -20, motivo: 'Revenda de licença de fabricante (não é desenvolvimento)', re: re('microsoft|windows|office|m365|adobe|autocad|autodesk|antivirus|antimalware|oracle|vmware|fortinet|fortigate|veeam|red hat|google workspace|kaspersky|sophos|trend micro|corel\\w*|canva|sql server|esri|arcgis|backup em nuvem|subscric(?:ao|oes)') },
  { pts: -12, motivo: 'Envolve fornecimento de hardware/equipamentos', re: re('computador(?:es)?|notebooks?|desktops?|impressoras?|tablets?|nobreaks?|switch(?:es)?|cameras?|totens?|equipamentos?|relogios? de ponto|catracas?|coletores?|scanners?|raios? x') },
  { pts: -25, motivo: 'Objeto principal não parece ser software', re: re('concess(?:ao|oes)|limpeza|conservacao predial|vigilancia|mao de obra|obras?|engenharia|construcao|coleta de residuos|impressao|reprografia|copias|organizacao de arquivos|guarda de documentos|remocao|guincho|linhas? de voz|telefonia|servico movel pessoal') },
];

const PONTOS_MODALIDADE = {
  6: [10, 'Pregão eletrônico (prioritário)'],
  8: [10, 'Dispensa eletrônica com disputa (prioritária)'],
  4: [3, 'Concorrência eletrônica'],
  5: [-10, 'Modalidade presencial'],
  7: [-10, 'Modalidade presencial'],
};

const DIA_MS = 24 * 60 * 60 * 1000;

// O PNCP publica datas no horário de Brasília sem indicar o fuso.
export function dataBrasilia(iso) {
  return new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(iso) ? iso : `${iso}-03:00`);
}

function pontosValor(valor) {
  if (!valor) return [0, 'Valor estimado não informado (pode ser sigiloso)'];
  if (valor <= 100_000) return [8, 'Valor até R$ 100 mil (porte compatível com equipe pequena)'];
  if (valor <= 500_000) return [6, 'Valor até R$ 500 mil (porte compatível com equipe pequena)'];
  if (valor <= 1_500_000) return [0, 'Valor entre R$ 500 mil e R$ 1,5 mi'];
  if (valor <= 5_000_000) return [-8, 'Valor entre R$ 1,5 mi e R$ 5 mi (projeto maior)'];
  return [-18, 'Valor acima de R$ 5 mi (projeto grande para equipe pequena)'];
}

export function faixa(score) {
  if (score >= 70) return 'alta';
  if (score >= 45) return 'media';
  return 'baixa';
}

/**
 * Classifica uma contratação do PNCP.
 * Retorna { relevante, palavrasChave, score, faixa, motivos, observacoes }.
 */
export function classificar(c, agora = new Date()) {
  // Filtro e sinais olham só o objeto: a informação complementar costuma trazer
  // texto padrão do portal ("disponível no sistema eletrônico...") que gera ruído.
  const objeto = normalizar(c.objetoCompra).replace(RUIDO, ' ');
  const texto = normalizar(`${c.objetoCompra} ${c.informacaoComplementar || ''}`);

  const foraDeTi = FALSOS_POSITIVOS.test(objeto);
  const palavrasChave = TERMOS_FORTES
    .filter(([, r, generico]) => r.test(objeto) && !(generico && foraDeTi))
    .map(([n]) => n);
  if (CONTEXTO_TECNOLOGICO.test(objeto) && !foraDeTi) {
    for (const [nome, r] of TERMOS_CONTEXTUAIS) if (r.test(objeto)) palavrasChave.push(nome);
  }

  if (palavrasChave.length === 0) return { relevante: false, palavrasChave };

  const motivos = [];
  let score = 40;
  const somar = (pts, motivo) => {
    score += pts;
    motivos.push({ pts, motivo });
  };

  for (const s of SINAIS) if (s.re.test(objeto)) somar(s.pts, s.motivo);

  const mod = PONTOS_MODALIDADE[c.modalidadeId];
  if (c.modalidadeId === 8 && c.modoDisputaId !== 4) somar(4, 'Dispensa (sem disputa eletrônica)');
  else if (mod) somar(...mod);

  somar(...pontosValor(c.valorTotalEstimado));

  if (c.dataEncerramentoProposta) {
    const dias = (dataBrasilia(c.dataEncerramentoProposta) - agora) / DIA_MS;
    if (dias < 3) somar(-5, 'Menos de 3 dias para enviar a proposta');
    else if (dias >= 7) somar(3, 'Pelo menos 7 dias para preparar a proposta');
  }

  const observacoes = [
    'Classificação preliminar baseada apenas no resumo do PNCP; confirme escopo, prazos e exigências no edital.',
    'Prazo de entrega/execução não avaliado: a informação consta no edital, não no resumo.',
  ];
  if (/prova de conceito|\bpoc\b|amostra/.test(texto)) {
    observacoes.push('O resumo menciona prova de conceito/amostra; verifique no edital se é exigida.');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { relevante: true, palavrasChave, score, faixa: faixa(score), motivos, observacoes };
}
