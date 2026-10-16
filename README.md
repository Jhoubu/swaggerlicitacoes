# Radar de Licitações de Software

Encontra licitações abertas no [PNCP](https://pncp.gov.br) relacionadas a desenvolvimento de sistemas, SaaS, automação e soluções digitais, e pontua de 0 a 100 o quanto cada uma é viável para uma software house pequena.

Sem dependências externas: Node.js 22.16+ (usa `fetch` e `node:sqlite` nativos).

## Como executar

```bash
npm start            # interface em http://localhost:3000 + coleta automática diária
npm run coletar      # executa uma coleta agora, pelo terminal
npm test             # testes automatizados (não acessam a internet)
```

Ao iniciar, o servidor faz a primeira coleta se ainda não houve uma hoje (após as 6h). Depois verifica a cada 10 minutos e coleta uma vez por dia. Se o computador estiver desligado no horário, a coleta acontece assim que o servidor voltar. Também é possível disparar pelo botão **Coletar agora**.

Coleta rápida para testar (só 2 páginas por modalidade):

```bash
npm run coletar -- --max-paginas 2
```

### Agendar sem deixar o servidor aberto (Windows)

```powershell
# troque C:\caminho\do\radar pela pasta do projeto
schtasks /Create /SC DAILY /ST 06:00 /TN "Radar Licitacoes" /TR "cmd /c cd /d C:\caminho\do\radar && npm run coletar >> data\coleta.log 2>&1"
```

E rode `npm start` com `RADAR_AGENDAMENTO=0` só quando quiser ver a interface.

## Configuração (variáveis de ambiente)

| Variável | Padrão | Uso |
|---|---|---|
| `PORT` | `3000` | Porta da interface |
| `RADAR_DB` | `data/radar.db` | Arquivo SQLite |
| `RADAR_MODALIDADES` | `6,8,4` | Pregão eletrônico, dispensa (inclui a dispensa eletrônica), concorrência eletrônica |
| `RADAR_DIAS` | `30` | Janela: propostas que encerram até hoje + N dias |
| `RADAR_INTERVALO_MS` | `4000` | Pausa entre requisições (a API devolve 429 acima de ~15/min) |
| `RADAR_HORA` | `6` | Hora da coleta diária |
| `RADAR_AGENDAMENTO` | `1` | `0` desliga a coleta automática do servidor |
| `RADAR_MAX_PAGINAS` | sem limite | Limite de páginas por modalidade |

## Como funciona

1. **Consulta** `GET /v1/contratacoes/proposta` (`consultarContratacaoPeriodoRecebimentoPropostas`) com `dataFinal=yyyyMMdd`, `codigoModalidadeContratacao`, `pagina` e `tamanhoPagina=50` (máximo). A API devolve contratações com propostas abertas que encerram até `dataFinal`.
2. **Paginação**: percorre todas as páginas de cada modalidade, com pausa entre requisições e novas tentativas (30s a 3min) em caso de limite de requisições, timeout ou erro 5xx.
3. **Sem duplicados**: a API não ordena os resultados, então um registro pode reaparecer em outra página. A coleta ignora repetições pelo `numeroControlePNCP`, e o banco usa esse número como chave (upsert), atualizando dados e pontuação a cada coleta.
4. **Filtro**: a API não tem busca textual. O filtro roda localmente sobre o **objeto** da compra (`src/classificador.js`), com termos como software, SaaS, sistema web, plataforma digital, desenvolvimento de sistemas, fábrica de software, locação de software, licença de uso, solução informatizada, protocolo eletrônico, gestão de chamados, automação de processos, chatbot e inteligência artificial. "Agendamento", "ouvidoria" e "gestão documental" só contam com contexto tecnológico. Ruídos conhecidos ("Sistema de Registro de Preços", "[Portal de Compras Públicas]", "sistema de combate a incêndio"...) são descartados.
5. **Pontuação** (base 40, limitada a 0–100). Cada oportunidade mostra na interface os pontos que somou ou perdeu:
   - **Sobe**: desenvolvimento sob demanda/customização, sistema administrativo de escopo delimitado (agendamento, chamados, protocolo, ouvidoria...), automação/IA, modelo SaaS/locação, pregão eletrônico ou dispensa com disputa, valor até R$ 500 mil, 7+ dias para a proposta.
   - **Desce**: sistema hospitalar/saúde, ERP/gestão pública integrada (contabilidade, tributos, folha...), soluções muito especializadas (georreferenciamento, telemetria, biometria...), revenda de licenças de fabricante, hardware, software como acessório de outro serviço (limpeza, impressão, obras, concessão), modalidade presencial, valores altos, menos de 3 dias para a proposta.
   - Faixas: **alta** ≥ 70, **média** 45–69, **baixa** < 45.
6. **Reclassificação**: ao iniciar o servidor e ao fim de cada coleta, os registros salvos são reavaliados com as regras atuais (a partir do JSON original do PNCP). Itens que deixaram de passar no filtro são removidos. Assim, ajustes em `src/classificador.js` valem para tudo o que já foi coletado.

**Dispensa eletrônica**: no PNCP ela não tem código próprio. É a modalidade 8 (Dispensa) com modo de disputa "Dispensa Com Disputa". A interface mostra "Dispensa eletrônica" e "Dispensa sem disputa" separadamente, no filtro e na listagem, e a pontuação dá +10 à eletrônica e +4 à sem disputa.

A classificação é sempre **preliminar**: usa só o resumo do PNCP. Ela não afirma que há prova de conceito, nem quantos módulos o sistema tem, nem qual o prazo de execução. Se o resumo mencionar prova de conceito/amostra, isso aparece apenas como aviso para conferir no edital.

## Estrutura

```
src/pncp.js           cliente da API (paginação, limite de requisições, retentativas)
src/classificador.js  filtro por palavras-chave e pontuação
src/db.js             SQLite: tabelas oportunidades e coletas
src/coletor.js        orquestra uma coleta
src/server.js         interface, API JSON e agendamento diário
src/cli.js            coleta pelo terminal
public/index.html     interface
test/                 testes (node --test)
```

API da interface: `GET /api/oportunidades` (abertas; `?encerradas=1` inclui encerradas), `GET /api/status`, `POST /api/coletar`.

## Próximas etapas

- Notificações (e-mail/Telegram) das novas oportunidades de alta pontuação.
- Baixar e analisar o edital (PDF) para confirmar escopo, prova de conceito e prazo de execução, e trocar a classificação de "preliminar" para "analisada".
- Ajustar pesos e termos conforme o feedback sobre as oportunidades (marcar como "interessa / não interessa").
