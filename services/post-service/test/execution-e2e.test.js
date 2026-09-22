// Execução, evidências do antes/depois, acompanhamento e histórico visual
// (T17) contra um PostgreSQL de verdade.
//
// Só roda com DM_E2E_DATABASE_URL apontando para um banco VAZIO e descartável
// (PostgreSQL 15+, superusuário). O jeito normal é `npm run test:e2e`
// (scripts/e2e-postgres.sh). Sem a variável, é pulado.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { createApp } = require('../src');

const DATABASE_URL = process.env.DM_E2E_DATABASE_URL;
const SECRET = 'post-service-e2e-secret-0123456789abcdef';

const AGENT = '11111111-1111-4111-8111-111111111111';
const OTHER_AGENT = '22222222-2222-4222-8222-222222222222';
const ORG_AGENT = '77777777-7777-4777-8777-777777777777';

const USERS = {
  [AGENT]: ['agent', 'associacao', 'Associação Recreio Vivo'],
  [OTHER_AGENT]: ['agent', 'ong', 'ONG Mar Limpo'],
};
const token = (userId) => {
  const [role, profileType, name] = USERS[userId];
  return jwt.sign({ userId, role, profileType, name }, SECRET);
};

async function institutionStatus(req) {
  return {
    kind: 'agente_transformacao',
    status: 'validada',
    canActInstitutionally: true,
    organizationId: req.user.userId === AGENT ? ORG_AGENT : '88888888-8888-4888-8888-888888888888',
  };
}

/** Data no passado, para o teste não depender do dia em que roda. */
const daysAgo = (days) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

function postDbFiles() {
  const services = path.join(__dirname, '../..');
  return fs.readFileSync(path.join(services, 'migrations.manifest'), 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/)).filter(([db]) => db === 'post_db')
    .map(([, file]) => path.join(services, file));
}

test('execução: evidências antes/depois, andamento, orçamento executado e histórico visual',
  { skip: !DATABASE_URL && 'defina DM_E2E_DATABASE_URL (npm run test:e2e)' }, async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    const admin = await pool.connect();
    try {
      for (let round = 0; round < 2; round += 1) {
        for (const file of postDbFiles()) await admin.query(fs.readFileSync(file, 'utf8'));
      }
    // Grants do dm-infra (db/migrations/gestao/004, 007 e 014).
      await admin.query('DO $$ BEGIN CREATE ROLE gestao_app LOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$');
      await admin.query(`GRANT SELECT ON demands, demand_events, demand_evidences,
                           demand_progress_updates, demand_progress_expenses, posts TO gestao_app`);
      await admin.query(`GRANT UPDATE (status, review_state, review_note, reviewed_by, archive_reason, updated_at)
                           ON demands TO gestao_app`);
    } catch (err) {
      admin.release();
      await pool.end();
      throw err;
    }
    admin.release();
    const gestaoUrl = new URL(DATABASE_URL);
    gestaoUrl.username = 'gestao_app';
    gestaoUrl.password = '';
    const gestao = new Pool({ connectionString: gestaoUrl.toString() });

    const server = createApp({
      pool, secret: SECRET, institutionStatus, operationUserIds: new Set(), uploadStorage: null, dossierService: null,
      partnerProfile: { get: async () => null },
      connections: { create: async () => null, get: async () => null, update: async () => null },
    }).listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (method, url, { as = AGENT, body, auth = true } = {}) => {
      const headers = { 'content-type': 'application/json' };
      if (auth) headers.authorization = `Bearer ${token(as)}`;
      const res = await fetch(`${base}${url}`, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    };

    /** Demanda publicada, com uma etapa de cronograma e dois itens de orçamento. */
    async function publishedDemand(title, { physical = true } = {}) {
      const created = await call('POST', '/demands', {
        body: {
          category: 'problema_urbano', title, description: `${title}: descrição.`, objective: 'Resolver.',
          justification: 'Necessário.', beneficiariesEstimate: 200, beneficiariesProfile: 'Moradores',
          priority: 'alta', photoRef: 'https://example.org/foto.jpg', cep: '22790-000', street: 'Rua A',
          addressNumber: '10', district: 'Recreio', municipality: 'Rio de Janeiro', uf: 'RJ',
          latitude: -23.02, longitude: -43.45, territory: 'Recreio dos Bandeirantes',
          hasPhysicalExecution: physical,
        },
      });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const id = created.body.id;
      const stage = await call('POST', `/demands/${id}/schedule-items`, {
        body: {
          stage: 'Execução da obra', activities: 'Reforma da praça',
          startsOn: '2026-10-01', endsOn: '2026-11-30', recordMilestones: ['antes', 'acompanhamento', 'depois'],
        },
      });
      assert.equal(stage.status, 201, JSON.stringify(stage.body));
      const audiovisual = await call('POST', `/demands/${id}/budget-items`, {
        body: {
          description: 'Fotografia e filmagem do antes e do depois', quantity: 1, unit: 'serviço',
          unitPriceCents: 200000, isAudiovisualRecord: true,
        },
      });
      assert.equal(audiovisual.status, 201, JSON.stringify(audiovisual.body));
      const material = await call('POST', `/demands/${id}/budget-items`, {
        body: { description: 'Material de construção', quantity: 1, unit: 'lote', unitPriceCents: 800000 },
      });
      assert.equal(material.status, 201);
      assert.equal((await call('POST', `/demands/${id}/goals`, {
        body: { goal: 'Meta', expectedResult: 'Resultado', indicator: 'Indicador', measurementMethod: 'Medição' },
      })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/resources`, { body: { kind: 'necessario', type: 'materiais' } })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/submit`)).status, 200);
      await gestao.query(
        "UPDATE demands SET status = 'publicada', reviewed_by = 'Equipe DM', updated_at = NOW() WHERE id = $1", [id],
      );
      const mine = await call('GET', `/demands/mine/${id}`);
      return {
        id,
        scheduleItemId: mine.body.scheduleItems[0].id,
        audiovisualItemId: mine.body.budgetItems.find((b) => b.isAudiovisualRecord).id,
        materialItemId: mine.body.budgetItems.find((b) => !b.isAudiovisualRecord).id,
      };
    }

    /** Upload confirmado da demanda (o e2e roda sem bucket: a linha basta). */
    async function confirmedUpload(demandId, purpose, ownerId = AGENT) {
      const id = crypto.randomUUID();
      const ext = purpose === 'demand_evidence_video' ? 'mp4' : 'jpg';
      await pool.query(
        `INSERT INTO uploads (id, owner_id, purpose, status, tmp_key, object_key, content_type,
                              declared_size_bytes, size_bytes, original_name, demand_id, confirmed_at)
         VALUES ($1, $2, $3, 'confirmado', $4, $5, $6, 1024, 1024, $7, $8, NOW())`,
        [
          id, ownerId, purpose, `tmp/${id}`, `demands/${demandId}/evidence/${id}.${ext}`,
          purpose === 'demand_evidence_video' ? 'video/mp4' : 'image/jpeg',
          `registro.${ext}`, demandId,
        ],
      );
      return `upload:${id}`;
    }

    try {
      const demand = await publishedDemand('Praça do Recreio');

      // ── Da publicação à conexão ───────────────────────────────────────────
      assert.equal((await call('POST', `/demands/${demand.id}/transitions`, { body: { action: 'buscar_parceiro' } })).status, 200);
      assert.equal((await call('POST', `/demands/${demand.id}/transitions`, { body: { action: 'conectar' } })).status, 200);

      // ── "Em execução" exige o registro do "antes" (slides 11 e 12) ────────
      const semAntes = await call('POST', `/demands/${demand.id}/transitions`, { body: { action: 'iniciar_execucao' } });
      assert.equal(semAntes.status, 409, JSON.stringify(semAntes.body));
      assert.equal(semAntes.body.code, 'evidence_required');
      assert.equal(semAntes.body.milestone, 'antes');

      // Evidência: arquivo confirmado da demanda, da finalidade do tipo.
      const semArquivo = await call('POST', `/demands/mine/${demand.id}/evidences`, {
        body: {
          reference: `upload:${crypto.randomUUID()}`, milestone: 'antes',
          mediaKind: 'foto', recordedOn: daysAgo(30),
        },
      });
      assert.equal(semArquivo.status, 422);
      assert.ok(semArquivo.body.fields.reference);

      const videoRef = await confirmedUpload(demand.id, 'demand_evidence_video');
      const tipoTrocado = await call('POST', `/demands/mine/${demand.id}/evidences`, {
        body: { reference: videoRef, milestone: 'antes', mediaKind: 'foto', recordedOn: daysAgo(30) },
      });
      assert.equal(tipoTrocado.status, 422, 'vídeo não entra como fotografia');

      const beforePhoto = await call('POST', `/demands/mine/${demand.id}/evidences`, {
        body: {
          reference: await confirmedUpload(demand.id, 'demand_evidence_photo'),
          milestone: 'antes', mediaKind: 'foto', recordedOn: daysAgo(30),
          caption: 'Praça abandonada', scheduleItemId: demand.scheduleItemId,
        },
      });
      assert.equal(beforePhoto.status, 201, JSON.stringify(beforePhoto.body));
      assert.equal(beforePhoto.body.evidence.milestone, 'antes');
      assert.equal(beforePhoto.body.evidence.stage, 'Execução da obra');
      assert.match(beforePhoto.body.evidence.url, /^\/api\/posts\/uploads\/[0-9a-f-]+\/content$/);

      const beforeVideo = await call('POST', `/demands/mine/${demand.id}/evidences`, {
        body: { reference: videoRef, milestone: 'antes', mediaKind: 'video', recordedOn: daysAgo(30) },
      });
      assert.equal(beforeVideo.status, 201);

      // Arquivo de outra pessoa e arquivo já usado são recusados.
      assert.equal((await call('POST', `/demands/mine/${demand.id}/evidences`, {
        body: {
          reference: await confirmedUpload(demand.id, 'demand_evidence_photo', OTHER_AGENT),
          milestone: 'acompanhamento', mediaKind: 'foto', recordedOn: daysAgo(20),
        },
      })).status, 422);
      assert.equal((await call('POST', `/demands/mine/${demand.id}/evidences`, {
        body: {
          reference: beforePhoto.body.evidence.reference, milestone: 'acompanhamento',
          mediaKind: 'foto', recordedOn: daysAgo(20),
        },
      })).status, 409, 'o mesmo arquivo não vira duas evidências');

      // Agora a execução começa.
      assert.equal((await call('POST', `/demands/${demand.id}/transitions`, { body: { action: 'iniciar_execucao' } })).status, 200);

      // ── Atualização de andamento (slide 23) ───────────────────────────────
      const andamento = await call('POST', `/demands/mine/${demand.id}/progress`, {
        body: {
          scheduleItemId: demand.scheduleItemId,
          stageProgress: 'em_andamento',
          onSchedule: false,
          newEndsOn: '2026-12-20',
          deadlineReason: 'Chuvas interromperam a obra por três semanas.',
          partialResults: 'Metade do piso assentado.',
          note: 'Conferir a nota fiscal do cimento.',
          expenses: [
            { budgetItemId: demand.materialItemId, executedAmountCents: 500000, description: 'Cimento e areia' },
            { scheduleItemId: demand.scheduleItemId, executedAmountCents: 30000, description: 'Transporte' },
          ],
        },
      });
      assert.equal(andamento.status, 201, JSON.stringify(andamento.body));
      assert.equal(andamento.body.progress.executedAmountCents, 530000);
      assert.equal(andamento.body.progress.stage, 'Execução da obra');
      assert.equal(andamento.body.progress.note, 'Conferir a nota fiscal do cimento.');

      // Item de orçamento e etapa de outra demanda não entram.
      const outra = await publishedDemand('Horta comunitária');
      const cruzado = await call('POST', `/demands/mine/${demand.id}/progress`, {
        body: { partialResults: 'x', expenses: [{ budgetItemId: outra.materialItemId, executedAmountCents: 100 }] },
      });
      assert.equal(cruzado.status, 422);

      // ── "Concluída" exige o registro do "depois" ──────────────────────────
      const semDepois = await call('POST', `/demands/${demand.id}/transitions`, { body: { action: 'concluir' } });
      assert.equal(semDepois.status, 409);
      assert.equal(semDepois.body.milestone, 'depois');

      const afterPhoto = await call('POST', `/demands/mine/${demand.id}/evidences`, {
        body: {
          reference: await confirmedUpload(demand.id, 'demand_evidence_photo'),
          milestone: 'depois', mediaKind: 'foto', recordedOn: daysAgo(1),
          caption: 'Praça entregue', pairEvidenceId: beforePhoto.body.evidence.id,
        },
      });
      assert.equal(afterPhoto.status, 201, JSON.stringify(afterPhoto.body));
      assert.equal(afterPhoto.body.evidence.pairEvidenceId, beforePhoto.body.evidence.id);

      // O par é exclusivo e do mesmo tipo de registro.
      const parRepetido = await call('POST', `/demands/mine/${demand.id}/evidences`, {
        body: {
          reference: await confirmedUpload(demand.id, 'demand_evidence_photo'),
          milestone: 'depois', mediaKind: 'foto', recordedOn: daysAgo(1),
          pairEvidenceId: beforePhoto.body.evidence.id,
        },
      });
      assert.equal(parRepetido.status, 409);
      assert.equal(parRepetido.body.code, 'pair_taken');

      const parTipoTrocado = await call('POST', `/demands/mine/${demand.id}/evidences`, {
        body: {
          reference: await confirmedUpload(demand.id, 'demand_evidence_video'),
          milestone: 'depois', mediaKind: 'video', recordedOn: daysAgo(1),
          pairEvidenceId: beforePhoto.body.evidence.id,
        },
      });
      assert.equal(parTipoTrocado.status, 422, JSON.stringify(parTipoTrocado.body));
      assert.match(parTipoTrocado.body.fields.pairEvidenceId, /mesmo tipo de registro/);

      const afterVideo = await call('POST', `/demands/mine/${demand.id}/evidences`, {
        body: {
          reference: await confirmedUpload(demand.id, 'demand_evidence_video'),
          milestone: 'depois', mediaKind: 'video', recordedOn: daysAgo(1),
          pairEvidenceId: beforeVideo.body.evidence.id,
        },
      });
      assert.equal(afterVideo.status, 201);

      assert.equal((await call('POST', `/demands/${demand.id}/transitions`, { body: { action: 'concluir' } })).status, 200);

      // ── Legenda muda; o par registrado não é desfeito ─────────────────────
      const legenda = await call('PUT', `/demands/mine/${demand.id}/evidences/${afterPhoto.body.evidence.id}`, {
        body: { caption: 'Praça entregue à comunidade' },
      });
      assert.equal(legenda.status, 200);
      assert.equal(legenda.body.evidence.caption, 'Praça entregue à comunidade');
      assert.equal((await call('PUT', `/demands/mine/${demand.id}/evidences/${afterPhoto.body.evidence.id}`, {
        body: { pairEvidenceId: null },
      })).status, 409);
      assert.equal((await call('PUT', `/demands/mine/${demand.id}/evidences/${afterPhoto.body.evidence.id}`, {
        as: OTHER_AGENT, body: { caption: 'Sequestro de legenda' },
      })).status, 404, 'evidência é do Agente autor');

      // ── Visão pública: histórico visual e transparência da execução ───────
      const publica = await call('GET', `/demands/${demand.id}/execution`, { auth: false });
      assert.equal(publica.status, 200);
      assert.equal(publica.body.evidences.length, 4);
      assert.equal(publica.body.milestones.antes, 2);
      assert.equal(publica.body.milestones.depois, 2);
      assert.equal(publica.body.pairs.length, 2, 'dois pares antes↔depois (foto e vídeo)');
      const parFoto = publica.body.pairs.find((p) => p.mediaKind === 'foto');
      assert.equal(parFoto.before.caption, 'Praça abandonada');
      assert.equal(parFoto.after.caption, 'Praça entregue à comunidade');
      assert.ok(publica.body.evidences.every((e) => e.author === undefined), 'o público não vê o autor do registro');
      assert.equal(publica.body.progress.length, 1);
      assert.equal(publica.body.progress[0].note, undefined, 'a nota interna não é pública');
      assert.equal(publica.body.progress[0].partialResults, 'Metade do piso assentado.');
      assert.equal(publica.body.progress[0].newEndsOn, '2026-12-20');
      assert.equal(publica.body.progress[0].executedAmountCents, 530000);
      assert.equal(publica.body.budgetExecution.executedCents, 530000);
      assert.equal(publica.body.budgetExecution.plannedCents, 1000000);
      const itemAudiovisual = publica.body.budgetExecution.items.find((i) => i.isAudiovisualRecord);
      assert.equal(itemAudiovisual.plannedCents, 200000);
      assert.equal(itemAudiovisual.executedCents, 0);
      assert.equal(publica.body.schedule[0].stageProgress, 'em_andamento');
      assert.equal(publica.body.schedule[0].currentEndsOn, '2026-12-20');
      assert.equal(publica.body.schedule[0].endsOn, '2026-11-30');

      // ── Linha do tempo pública ────────────────────────────────────────────
      const timeline = await call('GET', `/demands/${demand.id}/timeline`, { auth: false });
      assert.equal(timeline.status, 200);
      const tipos = timeline.body.events.map((e) => e.type);
      for (const tipo of ['evidencia_registrada', 'andamento_registrado', 'prazo_alterado']) {
        assert.ok(tipos.includes(tipo), `evento ${tipo} ausente na linha do tempo`);
      }
      const registro = timeline.body.events.find((e) => e.type === 'evidencia_registrada');
      assert.equal(registro.details.milestone, 'antes');
      assert.equal(registro.details.mediaKind, 'foto');
      assert.equal(registro.details.stage, 'Execução da obra');
      assert.equal(registro.details.evidence_id, undefined, 'o id interno não sai na rota pública');
      const andamentoEvt = timeline.body.events.find((e) => e.type === 'andamento_registrado');
      assert.equal(andamentoEvt.details.executedAmountCents, 530000);
      assert.equal(andamentoEvt.details.partialResults, 'Metade do piso assentado.');
      const prazoEvt = timeline.body.events.find((e) => e.type === 'prazo_alterado');
      assert.equal(prazoEvt.details.newEndsOn, '2026-12-20');
      assert.match(prazoEvt.details.deadlineReason, /Chuvas/);

      // ── Imutabilidade e append-only ───────────────────────────────────────
      await assert.rejects(
        pool.query("UPDATE demand_progress_updates SET partial_results = 'outro' WHERE demand_id = $1", [demand.id]),
        /não muda nem é excluído/,
      );
      await assert.rejects(
        pool.query('DELETE FROM demand_progress_updates WHERE demand_id = $1', [demand.id]),
        /não muda nem é excluído/,
      );
      await assert.rejects(
        pool.query('DELETE FROM demand_evidences WHERE demand_id = $1', [demand.id]),
        /não são excluídas/,
      );
      await assert.rejects(
        pool.query("UPDATE demand_evidences SET milestone = 'antes' WHERE id = $1", [afterPhoto.body.evidence.id]),
        /não mudam/,
      );
      await assert.rejects(
        pool.query('DELETE FROM demand_progress_expenses WHERE demand_id = $1', [demand.id]),
        /não muda nem é excluída/,
      );
      await assert.rejects(pool.query('TRUNCATE demand_evidences CASCADE'), /não é apagada/);

      // A gestão lê tudo e não escreve nada.
      const { rows: lidas } = await gestao.query(
        'SELECT milestone::text AS milestone FROM demand_evidences WHERE demand_id = $1 ORDER BY created_at', [demand.id],
      );
      assert.equal(lidas.length, 4);
      const { rows: [somaGestao] } = await gestao.query(
        'SELECT coalesce(sum(executed_amount_cents), 0)::bigint AS total FROM demand_progress_expenses WHERE demand_id = $1',
        [demand.id],
      );
      assert.equal(Number(somaGestao.total), 530000);
      await assert.rejects(
        gestao.query("UPDATE demand_evidences SET caption = 'gestão' WHERE demand_id = $1", [demand.id]),
        /permission denied|a gestão só lê/,
      );
      await assert.rejects(
        gestao.query('DELETE FROM demand_progress_updates WHERE demand_id = $1', [demand.id]),
        /permission denied|a gestão só lê/,
      );

      // ── Sem execução física: justificativa no lugar do antes/depois ───────
      const social = await publishedDemand('Oficina de leitura', { physical: false });
      assert.equal((await call('POST', `/demands/${social.id}/transitions`, { body: { action: 'conectar' } })).status, 200);
      assert.equal((await call('POST', `/demands/${social.id}/transitions`, { body: { action: 'iniciar_execucao' } })).body.code,
        'evidence_required');

      assert.equal((await call('POST', `/demands/mine/${social.id}/record-waiver`, { body: {} })).status, 422);
      const waiver = await call('POST', `/demands/mine/${social.id}/record-waiver`, {
        body: { reason: 'Ação de formação, sem intervenção física a fotografar.' },
      });
      assert.equal(waiver.status, 200, JSON.stringify(waiver.body));
      assert.ok(waiver.body.recordWaiverAt);
      assert.equal((await call('POST', `/demands/mine/${social.id}/record-waiver`, {
        body: { reason: 'Outro motivo' },
      })).status, 409, 'a justificativa não muda');

      assert.equal((await call('POST', `/demands/${social.id}/transitions`, { body: { action: 'iniciar_execucao' } })).status, 200);
      assert.equal((await call('POST', `/demands/${social.id}/transitions`, { body: { action: 'concluir' } })).status, 200);

      const socialTimeline = await call('GET', `/demands/${social.id}/timeline`, { auth: false });
      const dispensa = socialTimeline.body.events.find((e) => e.type === 'registro_dispensado');
      assert.ok(dispensa, 'a dispensa do registro entra na linha do tempo pública');
      assert.match(dispensa.details.reason, /sem intervenção física/);

      const socialPublica = await call('GET', `/demands/${social.id}/execution`, { auth: false });
      assert.equal(socialPublica.body.hasPhysicalExecution, false);
      assert.match(socialPublica.body.recordWaiverReason, /Ação de formação/);

      // ── Andamento só a partir do início da execução ───────────────────────
      const naoIniciada = await publishedDemand('Mutirão de limpeza');
      const cedo = await call('POST', `/demands/mine/${naoIniciada.id}/progress`, {
        body: { partialResults: 'Ainda nem começou.' },
      });
      assert.equal(cedo.status, 409);
      assert.equal(cedo.body.code, 'demand_not_open');

      // ── Visão do autor: pendências e permissões ───────────────────────────
      const minha = await call('GET', `/demands/mine/${naoIniciada.id}/execution`);
      assert.equal(minha.status, 200);
      assert.equal(minha.body.canRegisterEvidence, true, 'o "antes" é registrado antes de iniciar');
      assert.equal(minha.body.canRegisterProgress, false);
      assert.equal(minha.body.canWaiveRecord, true);
      assert.deepEqual(minha.body.pending, { antes: true, depois: true });
      assert.equal((await call('GET', `/demands/mine/${naoIniciada.id}/execution`, { as: OTHER_AGENT })).status, 404);

      const minhaConcluida = await call('GET', `/demands/mine/${demand.id}/execution`);
      assert.deepEqual(minhaConcluida.body.pending, { antes: false, depois: false });
      assert.equal(minhaConcluida.body.canWaiveRecord, false);
      assert.equal(minhaConcluida.body.progress[0].note, 'Conferir a nota fiscal do cimento.');
      assert.equal(minhaConcluida.body.evidences[0].author.userId, AGENT);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await gestao.end();
      await pool.end();
    }
  });
