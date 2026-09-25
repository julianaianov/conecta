const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src');
const M = require('../src/organization-members');
const { institutionStatus } = require('../src/routes/institutions');

// Vínculo de usuários a organizações e permissões delegadas (T29): domínio,
// rotas com banco em memória e a delegação em GET /me/institution/status.

const SECRET = 'user-service-test-secret-0123456789abcdef';
const TITULAR = '11111111-1111-1111-1111-111111111111';
const MARIA = '22222222-2222-2222-2222-222222222222';
const JOAO = '33333333-3333-3333-3333-333333333333';
const ORG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const headers = (userId, role = 'member', profileType = 'morador') => ({
  authorization: `Bearer ${jwt.sign({ userId, name: 'Pessoa', role, profileType }, SECRET)}`,
  'content-type': 'application/json',
});

test('níveis, permissões e transições (fonte §4/§5: níveis de permissão delegada)', () => {
  assert.deepEqual(M.LEVELS, ['gestor', 'publicador', 'colaborador']);
  assert.ok(M.hasPermission('gestor', 'gerir_vinculos'));
  assert.ok(!M.hasPermission('publicador', 'gerir_vinculos'));
  assert.ok(M.hasPermission('publicador', 'publicar_demandas'));
  assert.deepEqual(M.permissionsFor('colaborador'), ['ver_documentos']);
  assert.deepEqual(M.permissionsFor('x'), []);
  assert.ok(M.transitionAllowed('convidado', 'ativo'));
  assert.ok(M.transitionAllowed('ativo', 'saiu'));
  assert.ok(!M.transitionAllowed('recusado', 'ativo'));
  assert.deepEqual(M.PUBLIC_ACTING_LEVELS, ['gestor', 'publicador']);
  for (const level of M.LEVELS) assert.ok(M.LEVEL_LABELS[level]);
  for (const permission of M.PERMISSIONS) assert.ok(M.PERMISSION_LABELS[permission]);
});

/** Banco em memória: perfis, uma instituição validada do titular e os vínculos. */
function createPool() {
  const state = {
    profiles: [
      { id: 'p-tit', user_id: TITULAR, name: 'Associação Bairro Verde', role: 'agent', profile_type: 'associacao', anonymized_at: null },
      { id: 'p-maria', user_id: MARIA, name: 'Maria Silva', role: 'member', profile_type: 'morador', anonymized_at: null },
      { id: 'p-joao', user_id: JOAO, name: 'João Souza', role: 'member', profile_type: 'voluntario', anonymized_at: null },
    ],
    orgs: [{ id: ORG, profile_id: 'p-tit', institution_kind: 'agente_transformacao', validation_status: 'validada', trade_name: 'Bairro Verde', legal_name: 'Associação Bairro Verde', org_name: 'Bairro Verde' }],
    members: [],
    calls: [],
  };
  let seq = 0;
  const orgOf = (userId) => {
    const p = state.profiles.find((x) => x.user_id === userId);
    return state.orgs.find((o) => p && o.profile_id === p.id && o.institution_kind);
  };
  const withOrg = (m) => {
    const o = state.orgs.find((x) => x.id === m.organization_id);
    return { ...m, organization_id: o.id, institution_kind: o.institution_kind, validation_status: o.validation_status, organization_name: o.trade_name, member_id: m.id };
  };
  const withProfile = (m) => {
    const p = state.profiles.find((x) => x.user_id === m.user_id);
    return { ...m, user_name: p?.name, user_avatar_url: null, user_role: p?.role, user_profile_type: p?.profile_type };
  };
  const query = async (text, params = []) => {
    state.calls.push({ text, params });
    const sql = text.replace(/\s+/g, ' ').trim();
    if (sql.startsWith('INSERT INTO profiles')) return { rows: [], rowCount: 0 };
    if (sql.startsWith('SELECT o.institution_kind, o.validation_status')) {
      const o = orgOf(params[0]);
      return { rows: o ? [{ ...o, organization_id: o.id }] : [] };
    }
    if (sql.startsWith('SELECT m.id AS member_id')) {
      return { rows: state.members.filter((m) => m.user_id === params[0] && m.status === 'ativo').map(withOrg) };
    }
    if (sql.startsWith('SELECT o.id AS organization_id') && sql.includes('JOIN profiles p ON p.id = o.profile_id')) {
      const o = orgOf(params[0]);
      return { rows: o ? [withOrg({ organization_id: o.id })] : [] };
    }
    if (sql.startsWith('SELECT o.id AS organization_id') && sql.includes('FROM organization_members m')) {
      return { rows: state.members.filter((m) => m.user_id === params[0] && m.status === 'ativo').map(withOrg) };
    }
    if (sql.startsWith('SELECT m.id, m.organization_id, m.user_id') && sql.includes('WHERE m.organization_id = $1')) {
      return { rows: state.members.filter((m) => m.organization_id === params[0]).map(withProfile) };
    }
    if (sql.startsWith('SELECT m.id, m.organization_id, m.user_id') && sql.includes('WHERE m.id = $1 AND m.organization_id = $2')) {
      return { rows: state.members.filter((m) => m.id === params[0] && m.organization_id === params[1]).map(withProfile) };
    }
    if (sql.startsWith('SELECT m.id, m.organization_id, m.user_id') && sql.includes('WHERE m.id = $1')) {
      return { rows: state.members.filter((m) => m.id === params[0]).map(withProfile) };
    }
    if (sql.startsWith('SELECT p.user_id, p.name, p.avatar_url, p.role, p.profile_type FROM profiles p WHERE p.name ILIKE')) {
      const needle = params[1].replace(/%/g, '').toLowerCase();
      return { rows: state.profiles.filter((p) => p.name.toLowerCase().includes(needle) && p.user_id !== params[2] && !orgOf(p.user_id)
        && !state.members.some((m) => m.user_id === p.user_id && (m.status === 'ativo' || (m.status === 'convidado' && m.organization_id === params[0])))) };
    }
    if (sql.startsWith('SELECT p.user_id, EXISTS')) {
      const p = state.profiles.find((x) => x.user_id === params[0]);
      if (!p) return { rows: [] };
      return { rows: [{
        user_id: p.user_id,
        has_own: Boolean(orgOf(p.user_id)),
        has_active: state.members.some((m) => m.user_id === p.user_id && m.status === 'ativo'),
        has_invite: state.members.some((m) => m.user_id === p.user_id && m.status === 'convidado' && m.organization_id === params[1]),
      }] };
    }
    if (sql.startsWith('INSERT INTO organization_members')) {
      seq += 1;
      const m = { id: `${seq}0000000-0000-4000-8000-000000000000`.slice(0, 36), organization_id: params[0], user_id: params[1], level: params[2], status: 'convidado', invited_by: params[3], invited_at: 'agora', responded_at: null, ended_at: null, created_at: 'agora', updated_at: 'agora' };
      state.members.push(m);
      return { rows: [{ id: m.id }] };
    }
    if (sql.startsWith('UPDATE organization_members SET level')) {
      const m = state.members.find((x) => x.id === params[0]);
      m.level = params[1];
      return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith("UPDATE organization_members SET status = 'removido'")) {
      const m = state.members.find((x) => x.id === params[0] && x.status === 'ativo');
      if (m) m.status = 'removido';
      return { rows: [], rowCount: m ? 1 : 0 };
    }
    if (sql.startsWith('UPDATE organization_members SET status = $3')) {
      const m = state.members.find((x) => x.id === params[0] && x.user_id === params[1] && x.status === params[3]);
      if (m) m.status = params[2];
      return { rows: [], rowCount: m ? 1 : 0 };
    }
    if (sql.startsWith('SELECT m.id, m.level, m.status, m.invited_at')) {
      let list = state.members.filter((m) => m.user_id === params[params.length - 1] || m.user_id === params[1] || m.id === params[0]);
      if (sql.includes('WHERE m.user_id = $1 AND m.status IN')) list = state.members.filter((m) => m.user_id === params[0] && ['convidado', 'ativo'].includes(m.status));
      if (sql.includes('WHERE m.id = $1 AND m.user_id = $2')) list = state.members.filter((m) => m.id === params[0] && m.user_id === params[1]);
      return { rows: list.map(withOrg) };
    }
    if (sql.startsWith('SELECT 1 FROM organization_members WHERE user_id = $1 AND status = \'ativo\'')) {
      return { rows: state.members.filter((m) => m.user_id === params[0] && m.status === 'ativo').map(() => ({ '?column?': 1 })) };
    }
    throw new Error(`Consulta inesperada: ${sql}`);
  };
  return { query, connect: async () => ({ query, release() {} }), state };
}

async function withServer(pool, callback) {
  const server = createApp({ pool, secret: SECRET, operationUserIds: new Set(), uploadStorage: null }).listen(0);
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const call = async (base, method, path, h, body) => {
  const res = await fetch(`${base}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
};

test('titular convida, a pessoa aceita e passa a atuar em nome da instituição (delegação no status)', async () => {
  const pool = createPool();
  await withServer(pool, async (base) => {
    const tit = headers(TITULAR, 'agent', 'associacao');
    const maria = headers(MARIA);

    // Quem não administra instituição não gere equipe.
    assert.equal((await call(base, 'GET', '/me/organization/members', maria)).status, 403);

    const search = await call(base, 'GET', '/me/organization/members/candidates?q=mar', tit);
    assert.equal(search.status, 200);
    assert.deepEqual(search.body.candidates.map((c) => c.userId), [MARIA]);

    const invalid = await call(base, 'POST', '/me/organization/members', tit, { userId: 'x', level: 'dono' });
    assert.equal(invalid.status, 422);
    assert.deepEqual(Object.keys(invalid.body.fields).sort(), ['level', 'userId']);

    const invited = await call(base, 'POST', '/me/organization/members', tit, { userId: MARIA, level: 'publicador' });
    assert.equal(invited.status, 201);
    assert.equal(invited.body.member.status, 'convidado');
    assert.ok(invited.body.member.permissions.includes('publicar_demandas'));
    const memberId = invited.body.member.id;

    const again = await call(base, 'POST', '/me/organization/members', tit, { userId: MARIA, level: 'gestor' });
    assert.equal(again.status, 409);
    assert.equal(again.body.code, 'member_invite_exists');

    // Antes de aceitar: sem delegação.
    const before = await institutionStatus(pool, { userId: MARIA, role: 'member', profileType: 'morador' });
    assert.equal(before.delegation, null);
    assert.equal(before.canActInstitutionally, false);

    const mine = await call(base, 'GET', '/me/memberships', maria);
    assert.equal(mine.body.invites.length, 1);
    assert.equal(mine.body.invites[0].organization.name, 'Bairro Verde');
    assert.equal(mine.body.active, null);

    const accepted = await call(base, 'POST', `/me/memberships/${memberId}/accept`, maria);
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.membership.status, 'ativo');

    // Delegação: a instituição validada do titular vale para Maria, com as permissões do nível.
    const after = await institutionStatus(pool, { userId: MARIA, role: 'member', profileType: 'morador' });
    assert.equal(after.kind, 'agente_transformacao');
    assert.equal(after.status, 'validada');
    assert.equal(after.canActInstitutionally, true);
    assert.equal(after.organizationId, ORG);
    assert.equal(after.requiredKind, null);
    assert.deepEqual(after.delegation.permissions, M.LEVEL_PERMISSIONS.publicador);
    assert.equal(after.delegation.organizationName, 'Bairro Verde');

    // O titular continua com o próprio cadastro, sem delegação.
    const own = await institutionStatus(pool, { userId: TITULAR, role: 'agent', profileType: 'associacao' });
    assert.equal(own.delegation, null);
    assert.equal(own.organizationId, ORG);

    // Publicador não gere a equipe; gestor sim.
    assert.equal((await call(base, 'GET', '/me/organization/members', maria)).status, 403);
    const promoted = await call(base, 'PUT', `/me/organization/members/${memberId}`, tit, { level: 'gestor' });
    assert.equal(promoted.body.member.level, 'gestor');
    const team = await call(base, 'GET', '/me/organization/members', maria);
    assert.equal(team.status, 200);
    assert.equal(team.body.managerRole, 'gestor');
    assert.equal(team.body.members.length, 1);

    // Uma pessoa atua em nome de uma instituição por vez.
    const other = await call(base, 'POST', '/me/organization/members', tit, { userId: MARIA, level: 'colaborador' });
    assert.equal(other.status, 409);
    assert.equal(other.body.code, 'member_already_linked');

    // Sair encerra a delegação.
    const left = await call(base, 'POST', `/me/memberships/${memberId}/leave`, maria);
    assert.equal(left.body.membership.status, 'saiu');
    const gone = await institutionStatus(pool, { userId: MARIA, role: 'member', profileType: 'morador' });
    assert.equal(gone.delegation, null);
    assert.equal((await call(base, 'POST', `/me/memberships/${memberId}/leave`, maria)).status, 409);
  });
});

test('recusar, remover e as regras de quem pode ser convidado', async () => {
  const pool = createPool();
  await withServer(pool, async (base) => {
    const tit = headers(TITULAR, 'agent', 'associacao');
    const joao = headers(JOAO);
    const self = await call(base, 'POST', '/me/organization/members', tit, { userId: TITULAR, level: 'gestor' });
    assert.equal(self.body.code, 'member_is_self');
    const unknown = await call(base, 'POST', '/me/organization/members', tit, { userId: '99999999-9999-4999-8999-999999999999', level: 'gestor' });
    assert.equal(unknown.status, 404);

    const invited = await call(base, 'POST', '/me/organization/members', tit, { userId: JOAO, level: 'colaborador' });
    const id = invited.body.member.id;
    const declined = await call(base, 'POST', `/me/memberships/${id}/decline`, joao);
    assert.equal(declined.body.membership.status, 'recusado');
    // Vínculo recusado não muda de nível nem é removido.
    assert.equal((await call(base, 'PUT', `/me/organization/members/${id}`, tit, { level: 'gestor' })).status, 409);
    assert.equal((await call(base, 'POST', `/me/organization/members/${id}/remove`, tit)).status, 409);

    const invited2 = await call(base, 'POST', '/me/organization/members', tit, { userId: JOAO, level: 'colaborador' });
    await call(base, 'POST', `/me/memberships/${invited2.body.member.id}/accept`, joao);
    const removed = await call(base, 'POST', `/me/organization/members/${invited2.body.member.id}/remove`, tit);
    assert.equal(removed.status, 200);
    assert.equal(removed.body.member.status, 'removido');
    // Outra conta não mexe no convite alheio.
    assert.equal((await call(base, 'POST', `/me/memberships/${invited2.body.member.id}/leave`, headers(MARIA))).status, 404);
  });
});

