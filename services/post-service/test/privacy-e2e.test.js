// Direitos do titular no post_db (T24) contra um PostgreSQL de verdade: a
// anonimização troca o retrato de identidade do feed, revoga os consentimentos
// de exibição e **não** toca a trilha imutável; a gestão (papel `gestao_app`,
// com o grant do dm-infra db/migrations/gestao/020) só lê.
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

const TITULAR = '11111111-1111-4111-8111-111111111111';
const OUTRO = '22222222-2222-4222-8222-222222222222';
const token = (userId) => jwt.sign(
  { userId, role: 'member', profileType: 'morador', name: 'Ana Moradora' }, SECRET,
);

function postDbFiles() {
  const services = path.join(__dirname, '../..');
  return fs.readFileSync(path.join(services, 'migrations.manifest'), 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/)).filter(([db]) => db === 'post_db')
    .map(([, file]) => path.join(services, file));
}

test('anonimização do titular no post_db: identidade some, trilha fica, gestão só lê',
  { skip: !DATABASE_URL && 'defina DM_E2E_DATABASE_URL (npm run test:e2e)' }, async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    const admin = await pool.connect();
    // O deploy reaplica o manifesto inteiro: tudo tem de ser idempotente.
    for (let round = 0; round < 2; round += 1) {
      for (const file of postDbFiles()) await admin.query(fs.readFileSync(file, 'utf8'));
    }
    await admin.query('DO $$ BEGIN CREATE ROLE gestao_app LOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$');
    await admin.query('GRANT SELECT ON posts, comments, supports, anonymized_users TO gestao_app');

    const post = (await admin.query(
      `INSERT INTO posts (author_id, author_name, author_avatar, type, title, description)
       VALUES ($1, 'Ana Moradora', 'https://exemplo/ana.png', 'problem', 'Buraco na rua', 'Descrição')
       RETURNING id`,
      [TITULAR],
    )).rows[0].id;
    const postDeOutro = (await admin.query(
      `INSERT INTO posts (author_id, author_name, type, title, description)
       VALUES ($1, 'Bruno Vizinho', 'problem', 'Poste apagado', 'Descrição') RETURNING id`,
      [OUTRO],
    )).rows[0].id;
    await admin.query(
      `INSERT INTO comments (post_id, author_id, author_name, content)
       VALUES ($1, $2, 'Ana Moradora', 'Também vi isso')`,
      [postDeOutro, TITULAR],
    );
    await admin.query(
      `INSERT INTO supports (post_id, user_id, user_name, type, display_consent, public_name)
       VALUES ($1, $2, 'Ana Moradora', 'volunteering', true, 'Ana Moradora')`,
      [postDeOutro, TITULAR],
    );
    await admin.query('INSERT INTO ranking_consents (user_id, consent) VALUES ($1, true)', [TITULAR]);
    await admin.query(
      `INSERT INTO content_shares (target_kind, post_id, user_id, user_name, channel)
       VALUES ('post', $1, $2, 'Ana Moradora', 'copiar_link')`,
      [postDeOutro, TITULAR],
    );
    admin.release();

    const server = createApp({
      pool, secret: SECRET, operationUserIds: new Set(), uploadStorage: null, dossierService: null, rankings: null,
      institutionStatus: async () => ({ kind: null, status: null, canActInstitutionally: true, organizationId: null }),
    }).listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;

    try {
      // Exportação: só o que é do titular.
      const exportado = await (await fetch(`${base}/me/privacy/data`, {
        headers: { authorization: `Bearer ${token(TITULAR)}` },
      })).json();
      assert.equal(exportado.dados.publicacoes.length, 1);
      assert.equal(exportado.dados.publicacoes[0].id, post);
      assert.equal(exportado.dados.comentarios.length, 1);
      assert.equal(exportado.dados.compartilhamentos.length, 1);
      assert.equal(exportado.anonimizacao, null);
      assert.ok(!JSON.stringify(exportado).includes('Bruno Vizinho'), 'nada de terceiros na exportação');

      // Anonimização.
      const res = await fetch(`${base}/me/privacy/anonymize`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token(TITULAR)}`, 'content-type': 'application/json' },
        body: JSON.stringify({ protocol: 'LGPD-2026-900001' }),
      });
      assert.equal(res.status, 200);
      const resultado = await res.json();
      assert.equal(resultado.alreadyAnonymized, false);
      assert.equal(resultado.summary.publicacoes, 1);
      assert.equal(resultado.summary.comentarios, 1);
      assert.equal(resultado.summary.apoiosComExibicaoRevogada, 1);

      const depois = await pool.query(
        'SELECT author_name, author_avatar FROM posts WHERE id = $1', [post],
      );
      assert.equal(depois.rows[0].author_name, 'Conta removida');
      assert.equal(depois.rows[0].author_avatar, null);
      assert.equal(
        (await pool.query('SELECT author_name FROM comments WHERE author_id = $1', [TITULAR])).rows[0].author_name,
        'Conta removida',
      );
      assert.equal(
        (await pool.query('SELECT display_consent FROM supports WHERE user_id = $1', [TITULAR])).rows[0].display_consent,
        false,
      );
      assert.equal(
        (await pool.query('SELECT consent FROM ranking_consents WHERE user_id = $1', [TITULAR])).rows[0].consent,
        false,
      );
      // Publicação de outra conta continua intacta.
      assert.equal(
        (await pool.query('SELECT author_name FROM posts WHERE id = $1', [postDeOutro])).rows[0].author_name,
        'Bruno Vizinho',
      );
      // A trilha imutável não é reescrita: o compartilhamento guarda o retrato.
      assert.equal(
        (await pool.query('SELECT user_name FROM content_shares WHERE user_id = $1', [TITULAR])).rows[0].user_name,
        'Ana Moradora',
      );

      // Idempotente.
      const denovo = await (await fetch(`${base}/me/privacy/anonymize`, {
        method: 'POST', headers: { authorization: `Bearer ${token(TITULAR)}` },
      })).json();
      assert.equal(denovo.alreadyAnonymized, true);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM anonymized_users')).rows[0].n, 1);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }

    // O registro é imutável, inclusive para o superusuário.
    await assert.rejects(
      () => pool.query('UPDATE anonymized_users SET protocol = $1 WHERE user_id = $2', ['LGPD-2026-900002', TITULAR]),
      /registro imutável/,
    );
    await assert.rejects(
      () => pool.query('DELETE FROM anonymized_users WHERE user_id = $1', [TITULAR]),
      /registro imutável/,
    );

    // A gestão lê e não escreve.
    const gestaoUrl = new URL(DATABASE_URL);
    gestaoUrl.username = 'gestao_app';
    gestaoUrl.password = '';
    const gestao = new Pool({ connectionString: gestaoUrl.toString() });
    try {
      const lido = await gestao.query('SELECT user_id, protocol FROM anonymized_users');
      assert.equal(lido.rows.length, 1);
      assert.equal(lido.rows[0].protocol, 'LGPD-2026-900001');
      await assert.rejects(
        () => gestao.query(
          'INSERT INTO anonymized_users (user_id) VALUES ($1)', ['33333333-3333-4333-8333-333333333333'],
        ),
        /permission denied|só lê/i,
      );
    } finally {
      await gestao.end();
      await pool.end();
    }
  });
