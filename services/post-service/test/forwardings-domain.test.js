const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const F = require('../src/institutional/forwardings');
const I = require('../src/institutional');
const { createGovernmentDirectoryClient, toGovernmentOrganization } = require('../src/institutional/directory');
const { serializeForwarding } = require('../src/institutional/forwarding-store');

// Vocabulário, máquina de estados e validação dos encaminhamentos (T14).
const sql = fs.readFileSync(path.join(__dirname, '../migrations/011-forwardings.sql'), 'utf8');

function enumValues(type) {
  const match = new RegExp(`CREATE TYPE ${type} AS ENUM \\(([^)]*)\\)`).exec(sql);
  assert.ok(match, `enum ${type} ausente`);
  return [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

const ORG = '88888888-8888-4888-8888-888888888888';
const OTHER = '99999999-9999-4999-8999-999999999999';

test('enums da migração 011 = constantes do domínio (fonte: slide 11)', () => {
  assert.deepEqual(enumValues('forwarding_destination_kind'), F.DESTINATION_KINDS);
  assert.deepEqual(enumValues('forwarding_status'), F.FORWARDING_STATUSES);
  assert.deepEqual(enumValues('forwarding_update_kind'), [...F.UPDATE_KINDS, 'status']);
  assert.deepEqual(Object.keys(F.FORWARDING_STATUS_LABELS), F.FORWARDING_STATUSES);
  assert.deepEqual(Object.keys(F.DESTINATION_KIND_LABELS), F.DESTINATION_KINDS);
  for (const type of F.FORWARDING_EVENT_TYPES) assert.ok(sql.includes(`'${type}'`), `evento ${type} no trigger`);
  // O status da origem ao encaminhar existe no status institucional da T13.
  for (const status of F.ORIGIN_TRACK_STATUSES) assert.ok(I.INSTITUTIONAL_STATUSES.includes(status));
});

test('transições do SQL = FORWARDING_TRANSITIONS', () => {
  const body = /forwarding_status_transition_allowed\([\s\S]*?SELECT CASE from_status([\s\S]*?)ELSE false/.exec(sql)[1];
  const fromSql = Object.fromEntries(F.FORWARDING_STATUSES.map((s) => [s, []]));
  for (const m of body.matchAll(/WHEN '([a-z_]+)' THEN to_status IN \(([^)]*)\)/g)) {
    fromSql[m[1]] = [...m[2].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
  }
  assert.deepEqual(fromSql, F.FORWARDING_TRANSITIONS);
  assert.deepEqual(F.checkForwardingTransition('enviado', 'recebido', null), { ok: true });
  assert.equal(F.checkForwardingTransition('aceito', 'devolvido', 'x').code, 'invalid_transition');
  assert.equal(F.checkForwardingTransition('recebido', 'devolvido', ' ').code, 'note_required');
  assert.equal(F.checkForwardingTransition('enviado', 'perdido').code, 'invalid_status');
});

test('validateForwarding: destino por tipo, motivo obrigatório e status da origem', () => {
  const empty = F.validateForwarding({});
  assert.deepEqual(Object.keys(empty.errors).sort(), ['destinationKind', 'reason']);

  const platform = F.validateForwarding({ destinationKind: 'orgao_plataforma', destinationOrganizationId: OTHER.toUpperCase(), reason: ' Competência da limpeza ' });
  assert.deepEqual(platform.errors, {});
  assert.equal(platform.value.destinationOrganizationId, OTHER);
  assert.equal(platform.value.reason, 'Competência da limpeza');
  assert.equal(platform.value.trackStatus, 'encaminhada_ao_orgao_responsavel');
  assert.ok(F.validateForwarding({ destinationKind: 'orgao_plataforma', destinationOrganizationId: 'x', reason: 'x' }).errors.destinationOrganizationId);

  const internal = F.validateForwarding({ destinationKind: 'setor_interno', reason: 'x' });
  assert.ok(internal.errors.destinationSector);
  const internalOk = F.validateForwarding({ destinationKind: 'setor_interno', destinationSector: 'Fiscalização', reason: 'x', destinationUf: 'SP' });
  assert.equal(internalOk.value.trackStatus, 'encaminhada');
  assert.equal(internalOk.value.destinationUf, null, 'localização só para órgão externo');

  const external = F.validateForwarding({
    destinationKind: 'orgao_externo', destinationOrganizationName: 'Cedae', destinationUf: 'rj', destinationSphere: 'estadual',
    reason: 'x', trackStatus: 'encaminhada',
  });
  assert.deepEqual(external.errors, {});
  assert.equal(external.value.destinationUf, 'RJ');
  assert.equal(external.value.trackStatus, 'encaminhada');
  const badExternal = F.validateForwarding({
    destinationKind: 'orgao_externo', destinationUf: 'Rio', destinationSphere: 'distrital', reason: 'x'.repeat(3001), trackStatus: 'concluida',
  });
  assert.deepEqual(Object.keys(badExternal.errors).sort(),
    ['destinationOrganizationName', 'destinationSphere', 'destinationUf', 'reason', 'trackStatus']);
});

test('validateForwardingStatus e validateForwardingUpdate', () => {
  assert.ok(F.validateForwardingStatus({ status: 'enviado' }).errors.status, 'enviado é só o de nascimento');
  assert.ok(F.validateForwardingStatus({ status: 'devolvido' }).errors.note);
  assert.deepEqual(F.validateForwardingStatus({ status: 'aceito' }).errors, {});
  assert.deepEqual(Object.keys(F.validateForwardingUpdate({ kind: 'status', body: '' }).errors).sort(), ['body', 'kind']);
  assert.deepEqual(F.validateForwardingUpdate({ kind: 'providencia', body: ' Ofício enviado ' }).value, { kind: 'providencia', body: 'Ofício enviado' });
});

test('serialização: quem pode mudar o status e visão pública sem responsável', () => {
  const row = {
    id: 'f1', track_id: 't1', demand_id: 'd1', organization_id: ORG, origin_organization_name: 'Origem',
    destination_kind: 'orgao_plataforma', destination_organization_id: OTHER, destination_track_id: 't2',
    destination_organization_name: 'Destino', reason: 'x', forwarded_by: 'u1', forwarded_by_name: 'Rep',
    responsible_name: 'Ana', responsible_role: 'Diretora', status: 'enviado', status_changed_at: new Date(0),
    forwarded_at: new Date(0),
  };
  const origin = serializeForwarding(row, [], { viewerOrganizationId: ORG });
  assert.equal(origin.direction, 'enviado');
  assert.equal(origin.canChangeStatus, false);
  const destination = serializeForwarding(row, [], { viewerOrganizationId: OTHER });
  assert.equal(destination.direction, 'recebido');
  assert.deepEqual(destination.availableStatuses, ['recebido', 'aceito', 'devolvido']);
  const external = serializeForwarding({ ...row, destination_kind: 'orgao_externo', destination_organization_id: null }, [], { viewerOrganizationId: ORG });
  assert.equal(external.canChangeStatus, true);
  const pub = serializeForwarding(row, [{ id: 'u', forwarding_id: 'f1', organization_name: 'Destino', side: 'destino', kind: 'providencia', body: 'b', author_id: 'u2', author_name: 'Beto', created_at: new Date(0) }], { isPublic: true });
  for (const hidden of ['responsibleName', 'responsibleRole', 'forwardedBy', 'forwardedByName', 'organizationId', 'destinationOrganizationId', 'trackId']) {
    assert.ok(!(hidden in pub), hidden);
  }
  assert.ok(!('authorName' in pub.updates[0]) && !('authorId' in pub.updates[0]));
});

test('diretório do user-service: token do representante, projeção e falhas', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, auth: init.headers.authorization });
    if (url.endsWith('/institutions/government/404')) return { ok: false, status: 404 };
    if (url.includes('/institutions/government?')) {
      return { ok: true, status: 200, json: async () => ({ organizations: [{ organization_id: OTHER, trade_name: 'SMO', legal_name: 'Secretaria', government_sphere: 'municipal', uf: 'rj' }] }) };
    }
    return { ok: false, status: 500 };
  };
  const dir = createGovernmentDirectoryClient({ baseUrl: 'http://user:3002/', fetchImpl });
  const req = { headers: { authorization: 'Bearer t' } };
  const found = await dir.search(req, { q: 'obras', uf: 'RJ' });
  assert.deepEqual(found, [{
    organizationId: OTHER, name: 'SMO', legalName: 'Secretaria', governmentSphere: 'municipal', department: null,
    competenceAreas: [], territory: null, municipality: null, uf: 'RJ',
  }]);
  assert.equal(calls[0].url, 'http://user:3002/institutions/government?q=obras&uf=RJ');
  assert.equal(calls[0].auth, 'Bearer t');
  assert.equal(await dir.byId(req, '404'), null);
  await assert.rejects(dir.byId(req, 'x'), /500/);
  await assert.rejects(createGovernmentDirectoryClient({ baseUrl: '' }).search(req), /não configurada/);
  assert.equal(toGovernmentOrganization({ trade_name: 'x' }), null, 'sem organization_id não serve de destino');
});
