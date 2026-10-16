import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classificar } from '../src/classificador.js';

const agora = new Date('2026-10-16T12:00:00-03:00');
const base = {
  modalidadeId: 6, modoDisputaId: 1, valorTotalEstimado: 300000,
  dataEncerramentoProposta: '2026-10-30T09:00:00', informacaoComplementar: '',
};
const cls = (objetoCompra, extra = {}) => classificar({ ...base, objetoCompra, ...extra }, agora);

test('reconhece objetos de software e ignora falsos positivos', () => {
  assert.equal(cls('Contratação de empresa para locação de software de gestão de protocolo eletrônico').relevante, true);
  assert.equal(cls('Desenvolvimento de sistema web sob demanda').relevante, true);
  assert.equal(cls('Implantação de chatbot com inteligência artificial para atendimento').relevante, true);
  assert.equal(cls('Sistema de agendamento online de consultas').relevante, true);
  assert.equal(cls('SISTEMA DE COMBATE A INCENDIO').relevante, false);
  assert.equal(cls('Aquisição de gêneros alimentícios').relevante, false);
  assert.equal(cls('Agendamento de entregas de material de limpeza').relevante, false);
  assert.equal(cls('Manutenção do sistema de ar condicionado com agendamento online').relevante, false);
});

test('texto padrão na informação complementar não torna o item relevante', () => {
  const r = cls('Aquisição de pneus', { informacaoComplementar: 'Edital disponível na plataforma digital e no software do portal' });
  assert.equal(r.relevante, false);
});

test('prioriza sistema administrativo sob demanda em pregão eletrônico de valor pequeno', () => {
  const bom = cls('Desenvolvimento de sistema web de agendamento e gestão de chamados', { valorTotalEstimado: 90000 });
  const hospitalar = cls('Locação de software de gestão hospitalar com prontuário eletrônico do paciente', { valorTotalEstimado: 3000000 });
  const erp = cls('Licença de uso de sistema integrado de gestão pública: contabilidade, tributação e folha de pagamento', { valorTotalEstimado: 8000000 });
  assert.ok(bom.score >= 70, `esperava >=70, veio ${bom.score}`);
  assert.equal(bom.faixa, 'alta');
  assert.ok(hospitalar.score < 45, `hospitalar veio ${hospitalar.score}`);
  assert.ok(erp.score < 30, `ERP veio ${erp.score}`);
  assert.ok(bom.score > hospitalar.score && bom.score > erp.score);
});

test('pontuação fica entre 0 e 100', () => {
  const r = cls('Licença de uso de software Microsoft Windows para sistema hospitalar integrado ERP com computadores', { modalidadeId: 7, valorTotalEstimado: 50_000_000, dataEncerramentoProposta: '2026-10-17T09:00:00' });
  assert.ok(r.score >= 0 && r.score <= 100);
  const s = cls('Desenvolvimento de sistema web sob demanda de agendamento, protocolo e chatbot com IA generativa em nuvem', { valorTotalEstimado: 50000 });
  assert.ok(s.score <= 100);
});

test('dispensa com disputa é prioritária; presencial é penalizada', () => {
  const objeto = 'Locação de software de protocolo eletrônico';
  const dispensa = cls(objeto, { modalidadeId: 8, modoDisputaId: 4 });
  const presencial = cls(objeto, { modalidadeId: 7 });
  assert.ok(dispensa.motivos.some((m) => /Dispensa eletrônica/.test(m.motivo)));
  assert.ok(dispensa.score > presencial.score);
});

test('não afirma prova de conceito; apenas sinaliza menção para conferir no edital', () => {
  const sem = cls('Locação de software de protocolo eletrônico');
  assert.ok(sem.observacoes.some((o) => /preliminar/.test(o)));
  assert.ok(!sem.observacoes.some((o) => /prova de conceito/i.test(o)));
  const com = cls('Locação de software de protocolo eletrônico, com prova de conceito');
  assert.ok(com.observacoes.some((o) => /menciona prova de conceito.*verifique no edital/i.test(o)));
});

test('prazo curto para proposta reduz pontos', () => {
  const curto = cls('Locação de software de protocolo eletrônico', { dataEncerramentoProposta: '2026-10-17T10:00:00' });
  const longo = cls('Locação de software de protocolo eletrônico');
  assert.ok(curto.score < longo.score);
});
