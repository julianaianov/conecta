const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const A = require('../src/analysis');
const I = require('../src/institutional');

// Respostas à análise (T-05-05; Modelo de Conexão §10): vocabulário × SQL e
// validação.
const sql = fs.readFileSync(path.join(__dirname, '../migrations/030-analysis-requests.sql'), 'utf8');
const sql010 = fs.readFileSync(path.join(__dirname, '../migrations/010-institutional-tracks.sql'), 'utf8');

function enumValues(source, type) {
  const match = new RegExp(`CREATE TYPE ${type} AS ENUM \\(([^)]*)\\)`).exec(source);
  assert.ok(match, `enum ${type} ausente`);
  return [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

test('enums da migração 030 = constantes; os 4 tipos novos da resposta institucional', () => {
  assert.deepEqual(enumValues(sql, 'analysis_request_kind'), A.REQUEST_KINDS);
  assert.deepEqual(enumValues(sql, 'analysis_request_status'), A.REQUEST_STATUSES);
  assert.deepEqual(Object.keys(A.REQUEST_KIND_LABELS), A.REQUEST_KINDS);
  const added = [...sql.matchAll(/ALTER TYPE institutional_response_type ADD VALUE IF NOT EXISTS '([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(added, ['solicitacao_de_documentos', 'solicitacao_de_reuniao', 'solicitacao_de_analise_tecnica', 'recusa_com_motivo']);
  for (const value of added) {
    assert.ok(I.RESPONSE_TYPES.includes(value), value);
    assert.ok(enumValues(sql010, 'institutional_response_type').includes(value), `banco novo já nasce com ${value}`);
  }
  // Toda resposta que pede algo ao Agente tem o tipo de solicitação espelhado.
  for (const [type, kind] of Object.entries(I.RESPONSE_REQUEST_KIND)) {
    assert.ok(I.RESPONSE_TYPES.includes(type), type);
    assert.ok(A.REQUEST_KINDS.includes(kind), kind);
  }
});

test('validateRequest: tipo, texto, recusa sem motivo, documentos e reunião', () => {
  assert.ok(A.validateRequest({}).errors.kind);
  const refusal = A.validateRequest({ kind: 'recusa' });
  assert.equal(refusal.errors.body, 'Informe o motivo da recusa');
  const docs = A.validateRequest({ kind: 'documentos', body: 'Precisamos do projeto' });
  assert.ok(docs.errors.requestedDocumentTypes, 'documentos pedem ao menos um tipo');
  const docsOk = A.validateRequest({ kind: 'documentos', body: 'Projeto', requestedDocumentTypes: ['projetos_tecnicos', 'estatuto'] });
  assert.deepEqual(docsOk.errors, {});
  assert.deepEqual(docsOk.value.requestedDocumentTypes, ['estatuto', 'projetos_tecnicos'], 'ordem da fonte');
  assert.ok(A.validateRequest({ kind: 'documentos', body: 'x', requestedDocumentTypes: ['inexistente'] }).errors.requestedDocumentTypes);
  const meeting = A.validateRequest({ kind: 'reuniao', body: 'Visita', meetingProposedAt: '2030-01-10T14:30', meetingMode: 'online' });
  assert.deepEqual(meeting.errors, {});
  assert.equal(meeting.value.meetingMode, 'online');
  assert.ok(meeting.value.meetingProposedAt.startsWith('2030-01-10'));
  assert.ok(A.validateRequest({ kind: 'reuniao', body: 'x', meetingMode: 'telefone' }).errors.meetingMode);
  assert.ok(A.validateRequest({ kind: 'reuniao', body: 'x', meetingProposedAt: 'amanhã' }).errors.meetingProposedAt);
  // Campos de outro tipo são descartados.
  assert.equal(A.validateRequest({ kind: 'analise_tecnica', body: 'x', meetingMode: 'online' }).value.meetingMode, null);
});

test('validateAnswer: texto obrigatório e documentos por id', () => {
  assert.ok(A.validateAnswer({}).errors.body);
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const ok = A.validateAnswer({ body: 'Segue o projeto', documentIds: [id, id.toUpperCase()] });
  assert.deepEqual(ok.errors, {});
  assert.deepEqual(ok.value.documentIds, [id]);
  assert.ok(A.validateAnswer({ body: 'x', documentIds: ['nao-e-id'] }).errors.documentIds);
});

test('validateResponse do Poder Público: recusa sem motivo é erro; documentos pedidos', () => {
  const refusal = I.validateResponse({ type: 'recusa_com_motivo' });
  assert.ok(refusal.errors.refusalReason);
  const withReason = I.validateResponse({ type: 'recusa_com_motivo', refusalReason: 'Fora do orçamento do exercício' });
  assert.deepEqual(withReason.errors, {});
  assert.equal(withReason.value.body, 'Fora do orçamento do exercício', 'o motivo é o texto da resposta');
  assert.ok(I.validateResponse({ type: 'solicitacao_de_documentos', body: 'x' }).errors.requestedDocumentTypes);
  const meeting = I.validateResponse({ type: 'solicitacao_de_reuniao', body: 'Vistoria', meetingMode: 'presencial' });
  assert.deepEqual(meeting.errors, {});
  assert.equal(meeting.value.meetingMode, 'presencial');
});
