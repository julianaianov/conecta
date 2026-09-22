// Denúncia de conteúdo e de perfil (T6.3) contra um PostgreSQL de verdade:
// o portal grava, a gestão (papel `gestao_app`, com os grants do dm-infra
// db/migrations/gestao/017) lê a fila e grava só o desfecho.
//
// Só roda com DM_E2E_DATABASE_URL apontando para um banco VAZIO e descartável
// (PostgreSQL 15+, superusuário). O jeito normal é `npm run test:e2e`
// (scripts/e2e-postgres.sh). Sem a variável, é pulado.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { createApp } = require('../src');

const DATABASE_URL = process.env.DM_E2E_DATABASE_URL;
const SECRET = 'post-service-e2e-secret-0123456789abcdef';

const AUTHOR = '11111111-1111-4111-8111-111111111111';
const REPORTER = '22222222-2222-4222-8222-222222222222';
const OTHER_REPORTER = '33333333-3333-4333-8333-333333333333';
const STRANGER = '44444444-4444-4444-8444-444444444444';

const USERS = {
  [AUTHOR]: ['agent', 'associacao', 'Associação Recreio Vivo'],
  [REPORTER]: ['member', 'morador', 'Joana Moradora'],
  [OTHER_REPORTER]: ['partner', 'empresa', 'Construtora Horizonte'],
  [STRANGER]: ['media', 'jornalista', 'Jornal do Bairro'],
};
const token = (userId) => {
  const [role, profileType, name] = USERS[userId];
  return jwt.sign({ userId, role, profileType, name }, SECRET);
};

function postDbFiles() {
  const services = path.join(__dirname, '../..');
  return fs.readFileSync(path.join(services, 'migrations.manifest'), 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/)).filter(([db]) => db === 'post_db')
    .map(([, file]) => path.join(services, file));
}

test('denúncia do portal, fila da gestão e desfecho gravado só pela gestão',
  { skip: !DATABASE_URL && 'defina DM_E2E_DATABASE_URL (npm run test:e2e)' }, async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    const admin = await pool.connect();
    // O deploy reaplica o manifesto inteiro: tudo tem de ser idempotente.
    for (let round = 0; round < 2; round += 1) {
      for (const file of postDbFiles()) await admin.query(fs.readFileSync(file, 'utf8'));
    }
    // Grants do dm-infra (db/migrations/gestao/004 e 017).
    await admin.query('DO $$ BEGIN CREATE ROLE gestao_app LOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$');
    await admin.query('GRANT SELECT ON posts, comments, demands, content_reports TO gestao_app');
    await admin.query(`GRANT UPDATE (status, resolution, resolution_note, resolved_by, resolved_at, updated_at)
                         ON content_reports TO gestao_app`);
    await admin.query(`GRANT UPDATE (visibility, moderation_reason, moderated_at, moderated_by)
                         ON posts TO gestao_app`);

    const post = (await admin.query(
      `INSERT INTO posts (author_id, author_name, type, title, description)
       VALUES ($1, 'Associação Recreio Vivo', 'problem', 'Buraco na rua', 'Descrição') RETURNING id`,
      [AUTHOR],
    )).rows[0].id;
    const comment = (await admin.query(
      `INSERT INTO comments (post_id, author_id, author_name, content)
       VALUES ($1, $2, 'Associação Recreio Vivo', 'Comentário   com    espaços') RETURNING id`,
      [post, AUTHOR],
    )).rows[0].id;
    admin.release();

    const gestaoUrl = new URL(DATABASE_URL);
    gestaoUrl.username = 'gestao_app';
    gestaoUrl.password = '';
    const gestao = new Pool({ connectionString: gestaoUrl.toString() });

    const server = createApp({
      pool, secret: SECRET, operationUserIds: new Set(), uploadStorage: null, dossierService: null, rankings: null,
      institutionStatus: async () => ({ kind: null, status: null, canActInstitutionally: true, organizationId: null }),
    }).listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (method, url, { as = REPORTER, body, auth = true } = {}) => {
      const headers = { 'content-type': 'application/json' };
      if (auth) headers.authorization = `Bearer ${token(as)}`;
      const res = await fetch(`${base}${url}`, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    };

    try {
      // ── O portal grava a denúncia ────────────────────────────────────────
      const created = await call('POST', '/reports', {
        body: { targetKind: 'publicacao', targetId: post, reason: 'informacao_falsa', description: 'Não é verdade.' },
      });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      assert.equal(created.body.state, 'em_apuracao');
      const reportId = created.body.id;

      // Retrato do alvo gravado no momento da denúncia.
      const row = (await pool.query(
        `SELECT target_kind::text AS target_kind, target_owner_id, target_summary, reporter_category,
                status::text AS status, resolution, resolved_at
           FROM content_reports WHERE id = $1`, [reportId],
      )).rows[0];
      assert.equal(row.target_kind, 'publicacao');
      assert.equal(row.target_owner_id, AUTHOR);
      assert.equal(row.target_summary, 'Buraco na rua');
      assert.equal(row.reporter_category, 'member');
      assert.equal(row.status, 'pendente');
      assert.equal(row.resolution, null);
      assert.equal(row.resolved_at, null);

      // Comentário: o resumo normaliza os espaços.
      const comentario = await call('POST', '/reports', {
        body: { targetKind: 'comentario', targetId: comment, reason: 'discurso_de_odio' },
      });
      assert.equal(comentario.status, 201, JSON.stringify(comentario.body));
      assert.equal((await pool.query(
        'SELECT target_summary FROM content_reports WHERE id = $1', [comentario.body.id],
      )).rows[0].target_summary, 'Comentário com espaços');

      // ── Uma denúncia em aberto por (denunciante, alvo) ───────────────────
      const repetida = await call('POST', '/reports', {
        body: { targetKind: 'publicacao', targetId: post, reason: 'spam' },
      });
      assert.equal(repetida.status, 409);
      assert.equal(repetida.body.code, 'report_already_open');
      // O índice único parcial segura mesmo sem passar pela rota.
      await assert.rejects(pool.query(
        `INSERT INTO content_reports (target_kind, target_id, target_owner_id, reporter_id, reporter_category, reason)
         VALUES ('publicacao', $1, $2, $3, 'member', 'spam')`, [post, AUTHOR, REPORTER],
      ), /duplicate key|content_reports_open/i);

      // Outra conta denuncia o mesmo conteúdo: pode.
      assert.equal((await call('POST', '/reports', {
        as: OTHER_REPORTER, body: { targetKind: 'publicacao', targetId: post, reason: 'spam' },
      })).status, 201);

      // O autor não denuncia o próprio conteúdo.
      assert.equal((await call('POST', '/reports', {
        as: AUTHOR, body: { targetKind: 'publicacao', targetId: post, reason: 'spam' },
      })).status, 422);

      // ── Append-only: nada é excluído nem editado pelo portal ─────────────
      await assert.rejects(pool.query('DELETE FROM content_reports WHERE id = $1', [reportId]),
        /não são excluídas/);
      await assert.rejects(pool.query('TRUNCATE content_reports'), /não é apagada/);
      await assert.rejects(pool.query(
        "UPDATE content_reports SET reason = 'spam' WHERE id = $1", [reportId],
      ), /não mudam/);
      await assert.rejects(pool.query(
        "UPDATE content_reports SET description = 'outra' WHERE id = $1", [reportId],
      ), /não mudam/);
      await assert.rejects(pool.query(
        "INSERT INTO content_reports (target_kind, target_id, reporter_id, reporter_category, reason, status)"
        + " VALUES ('perfil', $1, $2, 'member', 'spam', 'procedente')", [AUTHOR, STRANGER],
      ), /nasce pendente|content_reports_resolution/);

      // ── A gestão lê a fila e grava só o desfecho ─────────────────────────
      const fila = await gestao.query(
        `SELECT id, target_kind::text AS target_kind, target_id, reason::text AS reason, reporter_id
           FROM content_reports WHERE status = 'pendente' ORDER BY created_at`,
      );
      assert.equal(fila.rows.length, 3);

      await assert.rejects(gestao.query(
        "INSERT INTO content_reports (target_kind, target_id, reporter_id, reporter_category, reason)"
        + " VALUES ('perfil', $1, $2, 'member', 'spam')", [AUTHOR, STRANGER],
      ), /a gestão só despacha|permission denied/i);
      await assert.rejects(gestao.query('DELETE FROM content_reports WHERE id = $1', [reportId]),
        /não são excluídas|permission denied/i);
      await assert.rejects(gestao.query(
        "UPDATE content_reports SET target_summary = 'outro' WHERE id = $1", [reportId],
      ), /permission denied|não mudam/i);

      // Assumir a análise.
      await gestao.query("UPDATE content_reports SET status = 'em_analise' WHERE id = $1", [reportId]);
      assert.equal((await pool.query('SELECT status::text AS s FROM content_reports WHERE id = $1', [reportId]))
        .rows[0].s, 'em_analise');

      // Procedente com a moderação por visibilidade que a gestão já tem.
      await gestao.query(
        `UPDATE content_reports
            SET status = 'procedente', resolution = 'ocultar_publicacao',
                resolution_note = 'Informação sem comprovação.', resolved_by = 'gestao:1'
          WHERE id = $1`, [reportId],
      );
      await gestao.query(
        `UPDATE posts SET visibility = 'hidden', moderation_reason = 'Informação sem comprovação.',
                          moderated_at = NOW(), moderated_by = 'gestao:1' WHERE id = $1`, [post],
      );
      const despachada = (await pool.query(
        `SELECT status::text AS status, resolution::text AS resolution, resolved_by, resolved_at
           FROM content_reports WHERE id = $1`, [reportId],
      )).rows[0];
      assert.equal(despachada.status, 'procedente');
      assert.equal(despachada.resolution, 'ocultar_publicacao');
      assert.equal(despachada.resolved_by, 'gestao:1');
      assert.ok(despachada.resolved_at instanceof Date);

      // Desfecho é final e não volta atrás.
      await assert.rejects(gestao.query(
        "UPDATE content_reports SET status = 'improcedente', resolution = 'conteudo_mantido' WHERE id = $1", [reportId],
      ), /despachada não muda/);

      // Post oculto não recebe denúncia nova.
      assert.equal((await call('POST', '/reports', {
        as: STRANGER, body: { targetKind: 'publicacao', targetId: post, reason: 'spam' },
      })).status, 404);

      // ── Quem denunciou vê só "analisada", nunca o desfecho ───────────────
      const minhas = await call('GET', '/reports/mine');
      assert.equal(minhas.status, 200);
      const despachadaNaLista = minhas.body.reports.find((r) => r.id === reportId);
      assert.equal(despachadaNaLista.state, 'analisada');
      assert.equal(JSON.stringify(minhas.body).includes('procedente'), false);
      assert.equal(JSON.stringify(minhas.body).includes('ocultar_publicacao'), false);

      // Depois do desfecho, o mesmo alvo pode ser denunciado de novo
      // (o índice único só vale para as denúncias em aberto).
      const perfil = await call('POST', '/reports', {
        body: { targetKind: 'perfil', targetId: AUTHOR, reason: 'outro', description: 'Perfil se passa por órgão.' },
      });
      assert.equal(perfil.status, 201, JSON.stringify(perfil.body));
      await gestao.query(
        `UPDATE content_reports SET status = 'improcedente', resolution = 'conteudo_mantido',
                resolution_note = 'Sem indício.', resolved_by = 'gestao:1' WHERE id = $1`, [perfil.body.id],
      );
      assert.equal((await call('POST', '/reports', {
        body: { targetKind: 'perfil', targetId: AUTHOR, reason: 'spam' },
      })).status, 201);

      // Desfecho e providência precisam combinar.
      await assert.rejects(pool.query(
        `UPDATE content_reports SET status = 'improcedente', resolution = 'ocultar_publicacao',
                resolution_note = 'x', resolved_by = 'gestao:1' WHERE id = $1`, [comentario.body.id],
      ), /content_reports_(resolution_kind|hide_target)/);

      // ── Limite de taxa por conta ─────────────────────────────────────────
      for (let i = 0; i < 3; i += 1) {
        const alvo = (await pool.query(
          `INSERT INTO posts (author_id, author_name, type, title, description)
           VALUES ($1, 'Autor', 'problem', 'Outro ponto', 'Descrição') RETURNING id`, [AUTHOR],
        )).rows[0].id;
        const res = await call('POST', '/reports', {
          body: { targetKind: 'publicacao', targetId: alvo, reason: 'spam' },
        });
        // 5 por hora: a conta já gravou 4, então só mais uma passa.
        if (i < 1) assert.equal(res.status, 201, JSON.stringify(res.body));
        else {
          assert.equal(res.status, 429);
          assert.equal(res.body.code, 'report_rate_limited');
          assert.ok(res.body.retryAfterSeconds > 0);
        }
      }
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await gestao.end();
      await pool.end();
    }
  });
