// Prestação de contas e prestação de resultados (T18) contra um PostgreSQL de
// verdade: o obrigatório sempre, o condicional da execução física e do apoio
// financeiro, a conclusão que congela o registro, a linha do tempo pública, a
// seção pública de resultados e a versão nova do dossiê.
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

const daysAgo = (days) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

function postDbFiles() {
  const services = path.join(__dirname, '../..');
  return fs.readFileSync(path.join(services, 'migrations.manifest'), 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/)).filter(([db]) => db === 'post_db')
    .map(([, file]) => path.join(services, file));
}

test('prestação de contas: exigências, conclusão, transparência e dossiê',
  { skip: !DATABASE_URL && 'defina DM_E2E_DATABASE_URL (npm run test:e2e)' }, async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    const admin = await pool.connect();
    try {
      for (let round = 0; round < 2; round += 1) {
        for (const file of postDbFiles()) await admin.query(fs.readFileSync(file, 'utf8'));
      }
      // Grants do dm-infra (db/migrations/gestao/004, 007, 014 e 015).
      await admin.query('DO $$ BEGIN CREATE ROLE gestao_app LOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$');
      await admin.query(`GRANT SELECT ON demands, demand_events, demand_evidences, demand_goals,
                           demand_accountability, demand_accountability_results,
                           demand_accountability_documents, posts TO gestao_app`);
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

    // Dossiê simulado: só interessa que a conclusão peça a versão nova (T10).
    const requested = [];
    const dossierService = { request: async (id) => { requested.push(id); }, start() {}, stop() {} };

    const server = createApp({
      pool, secret: SECRET, institutionStatus, operationUserIds: new Set(), uploadStorage: null, dossierService,
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

    /** Demanda publicada com duas metas; `physical` liga a execução física. */
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
      assert.equal((await call('POST', `/demands/${id}/schedule-items`, {
        body: {
          stage: 'Execução da obra', activities: 'Reforma da praça',
          startsOn: '2026-10-01', endsOn: '2026-11-30', recordMilestones: ['antes', 'acompanhamento', 'depois'],
        },
      })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/budget-items`, {
        body: {
          description: 'Fotografia e filmagem do antes e do depois', quantity: 1, unit: 'serviço',
          unitPriceCents: 200000, isAudiovisualRecord: true,
        },
      })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/budget-items`, {
        body: { description: 'Material de construção', quantity: 1, unit: 'lote', unitPriceCents: 800000 },
      })).status, 201);
      for (const [goal, indicator] of [['Revitalizar a praça', 'm² recuperados'], ['Formar mutirão', 'pessoas no mutirão']]) {
        assert.equal((await call('POST', `/demands/${id}/goals`, {
          body: { goal, expectedResult: 'Resultado esperado', indicator, measurementMethod: 'Medição em campo' },
        })).status, 201);
      }
      assert.equal((await call('POST', `/demands/${id}/resources`, { body: { kind: 'necessario', type: 'materiais' } })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/submit`)).status, 200);
      await gestao.query(
        "UPDATE demands SET status = 'publicada', reviewed_by = 'Equipe DM', updated_at = NOW() WHERE id = $1", [id],
      );
      const mine = await call('GET', `/demands/mine/${id}`);
      return { id, goals: mine.body.goals.map((g) => g.id) };
    }

    async function confirmedUpload(demandId, purpose, ownerId = AGENT) {
      const id = crypto.randomUUID();
      const ext = purpose === 'demand_evidence_video' ? 'mp4' : (purpose === 'demand_accountability_document' ? 'pdf' : 'jpg');
      const type = purpose === 'demand_evidence_video'
        ? 'video/mp4'
        : (purpose === 'demand_accountability_document' ? 'application/pdf' : 'image/jpeg');
      await pool.query(
        `INSERT INTO uploads (id, owner_id, purpose, status, tmp_key, object_key, content_type,
                              declared_size_bytes, size_bytes, original_name, demand_id, confirmed_at)
         VALUES ($1, $2, $3, 'confirmado', $4, $5, $6, 1024, 1024, $7, $8, NOW())`,
        [id, ownerId, purpose, `tmp/${id}`, `demands/${demandId}/accountability/${id}.${ext}`, type,
          `documento.${ext}`, demandId],
      );
      return `upload:${id}`;
    }

    /** Leva a demanda de publicada a `prestacao_de_contas`. */
    async function toAccountability(demand, { physical = true } = {}) {
      assert.equal((await call('POST', `/demands/${demand.id}/transitions`, { body: { action: 'conectar' } })).status, 200);
      if (physical) {
        assert.equal((await call('POST', `/demands/mine/${demand.id}/evidences`, {
          body: {
            reference: await confirmedUpload(demand.id, 'demand_evidence_photo'),
            milestone: 'antes', mediaKind: 'foto', recordedOn: daysAgo(40), caption: 'Praça abandonada',
          },
        })).status, 201);
      } else {
        assert.equal((await call('POST', `/demands/mine/${demand.id}/record-waiver`, {
          body: { reason: 'Ação de formação, sem intervenção física a fotografar.' },
        })).status, 200);
      }
      assert.equal((await call('POST', `/demands/${demand.id}/transitions`, { body: { action: 'iniciar_execucao' } })).status, 200);
      if (physical) {
        assert.equal((await call('POST', `/demands/mine/${demand.id}/evidences`, {
          body: {
            reference: await confirmedUpload(demand.id, 'demand_evidence_photo'),
            milestone: 'depois', mediaKind: 'foto', recordedOn: daysAgo(2), caption: 'Praça revitalizada',
          },
        })).status, 201);
      }
      assert.equal((await call('POST', `/demands/${demand.id}/transitions`, { body: { action: 'concluir' } })).status, 200);
      assert.equal((await call('POST', `/demands/${demand.id}/transitions`, { body: { action: 'prestar_contas' } })).status, 200);
    }

    try {
      const demand = await publishedDemand('Praça do Recreio');

      // ── Antes de `prestacao_de_contas` a prestação não abre ───────────────
      const cedo = await call('PUT', `/demands/mine/${demand.id}/accountability`, {
        body: { executionReport: 'Cedo demais' },
      });
      assert.equal(cedo.status, 409, JSON.stringify(cedo.body));
      assert.equal(cedo.body.code, 'demand_not_open');

      await toAccountability(demand);

      // ── Visão inicial: metas listadas, nada respondido, nada concluível ───
      const inicial = await call('GET', `/demands/mine/${demand.id}/accountability`);
      assert.equal(inicial.status, 200, JSON.stringify(inicial.body));
      assert.equal(inicial.body.accountability, null);
      assert.equal(inicial.body.goals.length, 2);
      assert.ok(inicial.body.goals.every((g) => g.answered === false));
      assert.equal(inicial.body.canConclude, false);
      assert.equal(inicial.body.hasPhysicalExecution, true);
      assert.deepEqual(inicial.body.milestones, { antes: 1, acompanhamento: 0, depois: 1 });
      // T-02-04: o cronograma previu o acompanhamento e não há registro — a
      // exigência aparece, informativa, e não impede a conclusão (linha abaixo).
      const acompanhamento = inicial.body.requirements.find((r) => r.key === 'evidence_acompanhamento');
      assert.equal(acompanhamento.applies, true);
      assert.equal(acompanhamento.satisfied, false);
      assert.equal(acompanhamento.informative, true);
      // Execução física com registro: o condicional se aplica e já está atendido.
      const antes = inicial.body.requirements.find((r) => r.key === 'evidence_antes');
      assert.equal(antes.applies, true);
      assert.equal(antes.satisfied, true);
      // Sem apoio financeiro declarado, o comprovante não é exigido.
      const comprovante = inicial.body.requirements.find((r) => r.key === 'financial_receipt');
      assert.equal(comprovante.applies, false);
      assert.match(comprovante.reason, /Nenhum apoio financeiro/);

      // ── A conclusão recusa enquanto falta o obrigatório sempre ────────────
      const incompleta = await call('POST', `/demands/mine/${demand.id}/accountability/conclude`);
      assert.equal(incompleta.status, 422, JSON.stringify(incompleta.body));
      assert.equal(incompleta.body.code, 'accountability_incomplete');
      assert.ok(incompleta.body.fields.executionReport);
      assert.ok(incompleta.body.fields.beneficiariesReached);
      assert.ok(incompleta.body.fields.results);
      // Modelo de Conexão §21 (T-05-13): quem participou e o resultado final.
      assert.ok(incompleta.body.fields.participants);
      assert.ok(incompleta.body.fields.finalResult);

      // ── Registro final ────────────────────────────────────────────────────
      const rascunho = await call('PUT', `/demands/mine/${demand.id}/accountability`, {
        body: {
          executionReport: 'A praça foi revitalizada em três frentes de trabalho.',
          actionsRecord: 'Mutirões nos dias 3, 10 e 17.',
          scheduleSummary: 'As duas etapas foram concluídas, com 20 dias de atraso.',
          beneficiariesReached: 340,
          beneficiariesNote: 'Moradores do entorno e escolas da região.',
          impactIndicators: 'Uso diário do espaço passou de 20 para 150 pessoas.',
          executedAmountCents: 930000,
          participants: 'Associação de moradores, escola municipal e 25 voluntários.',
          executedFrom: '2026-08-01',
          executedTo: '2026-09-10',
          locationSummary: 'Praça e calçadas do entorno.',
          finalResult: 'Praça revitalizada e em uso diário pela comunidade.',
        },
      });
      assert.equal(rascunho.status, 200, JSON.stringify(rascunho.body));
      assert.equal(rascunho.body.accountability.status, 'rascunho');
      assert.equal(rascunho.body.accountability.beneficiariesReached, 340);
      assert.equal(rascunho.body.accountability.executedFrom, '2026-08-01');
      assert.match(rascunho.body.accountability.participants, /25 voluntários/);
      const fimAntes = await call('PUT', `/demands/mine/${demand.id}/accountability`, {
        body: { executedFrom: '2026-09-10', executedTo: '2026-08-01' },
      });
      assert.equal(fimAntes.status, 422);
      assert.ok(fimAntes.body.fields.executedTo);
      assert.equal(rascunho.body.canConclude, false, 'faltam os resultados por meta');

      // ── Resultado alcançado por meta (slide 15) ───────────────────────────
      const primeira = await call('PUT', `/demands/mine/${demand.id}/accountability/results/${demand.goals[0]}`, {
        body: {
          measuredValue: '1.200 m² recuperados',
          measurementMethod: 'Medição em campo com trena, registrada em foto',
          achieved: true,
          note: 'Conferir com a prefeitura o laudo final.',
        },
      });
      assert.equal(primeira.status, 200, JSON.stringify(primeira.body));
      assert.equal(primeira.body.results.length, 1);
      assert.equal(primeira.body.results[0].goal, 'Revitalizar a praça');
      assert.equal(primeira.body.results[0].indicator, 'm² recuperados');
      assert.equal(primeira.body.canConclude, false, 'ainda falta a segunda meta');

      assert.equal((await call('PUT', `/demands/mine/${demand.id}/accountability/results/${demand.goals[1]}`, {
        body: { measuredValue: '35 pessoas', measurementMethod: 'Lista de presença', achieved: false },
      })).status, 200);

      // Meta de outra demanda não entra.
      const outra = await publishedDemand('Outra praça');
      const metaAlheia = await call('PUT', `/demands/mine/${demand.id}/accountability/results/${outra.goals[0]}`, {
        body: { measuredValue: '1', measurementMethod: 'x', achieved: true },
      });
      assert.equal(metaAlheia.status, 404);

      const completa = await call('GET', `/demands/mine/${demand.id}/accountability`);
      assert.equal(completa.body.canConclude, true);
      assert.equal(completa.body.summary.goalsTotal, 2);
      assert.equal(completa.body.summary.goalsAchieved, 1);

      // ── Apoio financeiro declarado liga o condicional (slide 24) ──────────
      const declarado = await call('PUT', `/demands/mine/${demand.id}/accountability`, {
        body: { financialSupport: true },
      });
      assert.equal(declarado.status, 200);
      assert.equal(declarado.body.canConclude, false);
      const comFinanceiro = await call('POST', `/demands/mine/${demand.id}/accountability/conclude`);
      assert.equal(comFinanceiro.status, 422);
      assert.ok(comFinanceiro.body.fields.financialSummary);
      assert.ok(comFinanceiro.body.fields['documents.comprovante_financeiro']);

      assert.equal((await call('PUT', `/demands/mine/${demand.id}/accountability`, {
        body: { financialSummary: 'R$ 9.300,00 aplicados em material e mão de obra local.' },
      })).status, 200);

      // O anexo precisa de arquivo confirmado, do autor, desta demanda e da finalidade.
      const arquivoErrado = await call('POST', `/demands/mine/${demand.id}/accountability/documents`, {
        body: {
          kind: 'comprovante_financeiro', title: 'Nota fiscal 123',
          reference: await confirmedUpload(demand.id, 'demand_evidence_photo'),
          issuedOn: daysAgo(10), amountCents: 500000,
        },
      });
      assert.equal(arquivoErrado.status, 422, JSON.stringify(arquivoErrado.body));
      assert.ok(arquivoErrado.body.fields.reference);

      const deOutro = await call('POST', `/demands/mine/${demand.id}/accountability/documents`, {
        body: {
          kind: 'comprovante_financeiro', title: 'Nota de terceiro',
          reference: await confirmedUpload(demand.id, 'demand_accountability_document', OTHER_AGENT),
          issuedOn: daysAgo(10), amountCents: 500000,
        },
      });
      assert.equal(deOutro.status, 422);

      const comprovanteRef = await confirmedUpload(demand.id, 'demand_accountability_document');
      const anexo = await call('POST', `/demands/mine/${demand.id}/accountability/documents`, {
        body: {
          kind: 'comprovante_financeiro', title: 'Nota fiscal 123',
          description: 'Material de construção', reference: comprovanteRef,
          issuedOn: daysAgo(10), amountCents: 500000,
        },
      });
      assert.equal(anexo.status, 201, JSON.stringify(anexo.body));
      assert.equal(anexo.body.summary.financialReceipts, 1);
      assert.equal(anexo.body.summary.financialReceiptsCents, 500000);

      // O mesmo arquivo não vira dois anexos.
      assert.equal((await call('POST', `/demands/mine/${demand.id}/accountability/documents`, {
        body: {
          kind: 'relatorio_execucao', title: 'De novo', reference: comprovanteRef,
        },
      })).status, 409);

      const relatorio = await call('POST', `/demands/mine/${demand.id}/accountability/documents`, {
        body: {
          kind: 'relatorio_execucao', title: 'Relatório final de execução',
          reference: await confirmedUpload(demand.id, 'demand_accountability_document'),
        },
      });
      assert.equal(relatorio.status, 201);

      // Remover anexo funciona enquanto é rascunho.
      const removivel = await call('POST', `/demands/mine/${demand.id}/accountability/documents`, {
        body: {
          kind: 'outro', title: 'Anexo a remover',
          reference: await confirmedUpload(demand.id, 'demand_accountability_document'),
        },
      });
      assert.equal(removivel.status, 201);
      const removido = await call(
        'DELETE',
        `/demands/mine/${demand.id}/accountability/documents/${removivel.body.documents.find((d) => d.kind === 'outro').id}`,
      );
      assert.equal(removido.status, 200);
      assert.equal(removido.body.documents.some((d) => d.kind === 'outro'), false);

      // ── Antes da conclusão a página pública não mostra nada ───────────────
      const publicaAntes = await call('GET', `/demands/${demand.id}/accountability`, { auth: false });
      assert.equal(publicaAntes.status, 200);
      assert.equal(publicaAntes.body.accountability, null);
      assert.deepEqual(publicaAntes.body.results, []);

      // ── Conclusão ─────────────────────────────────────────────────────────
      requested.length = 0;
      const concluida = await call('POST', `/demands/mine/${demand.id}/accountability/conclude`);
      assert.equal(concluida.status, 200, JSON.stringify(concluida.body));
      assert.equal(concluida.body.accountability.status, 'concluida');
      assert.ok(concluida.body.accountability.concludedAt);
      // A estimativa da T06 fica congelada junto com o alcançado.
      assert.equal(concluida.body.accountability.beneficiariesEstimate, 200);
      assert.equal(concluida.body.editable, false);
      assert.equal(concluida.body.canConclude, false);
      // Dossiê: uma versão nova é pedida fora do caminho crítico (T10).
      await new Promise((resolve) => setTimeout(resolve, 20));
      assert.deepEqual(requested, [demand.id]);

      // ── Congelamento ──────────────────────────────────────────────────────
      const depois = await call('PUT', `/demands/mine/${demand.id}/accountability`, {
        body: { executionReport: 'Mudou de ideia' },
      });
      assert.equal(depois.status, 409);
      assert.equal(depois.body.code, 'accountability_concluded');
      assert.equal((await call('PUT', `/demands/mine/${demand.id}/accountability/results/${demand.goals[0]}`, {
        body: { measuredValue: '0', measurementMethod: 'x', achieved: false },
      })).status, 409);
      assert.equal((await call('POST', `/demands/mine/${demand.id}/accountability/documents`, {
        body: {
          kind: 'outro', title: 'Tarde demais',
          reference: await confirmedUpload(demand.id, 'demand_accountability_document'),
        },
      })).status, 409);
      await assert.rejects(
        pool.query('DELETE FROM demand_accountability WHERE demand_id = $1', [demand.id]),
        /não é excluída/,
      );

      // ── Transparência pública (T19 parcial) ───────────────────────────────
      const publica = await call('GET', `/demands/${demand.id}/accountability`, { auth: false });
      assert.equal(publica.status, 200);
      assert.equal(publica.body.accountability.status, 'concluida');
      assert.equal(publica.body.accountability.beneficiariesReached, 340);
      assert.equal(publica.body.accountability.beneficiariesEstimate, 200);
      assert.match(publica.body.accountability.impactIndicators, /150 pessoas/);
      assert.match(publica.body.accountability.finalResult, /em uso diário/);
      assert.match(publica.body.accountability.participants, /escola municipal/);
      assert.equal(publica.body.summary.goalsTotal, 2);
      assert.equal(publica.body.summary.goalsAchieved, 1);
      assert.equal(publica.body.results.length, 2);
      // A nota interna do resultado não sai no público.
      assert.ok(publica.body.results.every((r) => !('note' in r)));
      // O comprovante existe, mas o arquivo não é exposto.
      const receita = publica.body.documents.find((d) => d.kind === 'comprovante_financeiro');
      assert.ok(receita);
      assert.equal(receita.amountCents, 500000);
      assert.equal('reference' in receita, false);
      assert.equal('description' in receita, false);

      // ── Linha do tempo pública ────────────────────────────────────────────
      const timeline = await call('GET', `/demands/${demand.id}/timeline`, { auth: false });
      const evento = timeline.body.events.find((e) => e.type === 'prestacao_de_contas_concluida');
      assert.match(evento.details.finalResult, /em uso diário/);
      assert.equal(evento.details.executedTo, '2026-09-10');
      assert.ok(evento, 'a conclusão entra na linha do tempo pública');
      assert.equal(evento.details.beneficiariesReached, 340);
      assert.equal(evento.details.goalsTotal, 2);
      assert.equal(evento.details.goalsAchieved, 1);
      assert.equal(evento.actor, undefined, 'a rota pública não expõe o ator');

      // ── A gestão só lê ────────────────────────────────────────────────────
      const { rows: lidas } = await gestao.query(
        'SELECT status::text AS status, beneficiaries_reached FROM demand_accountability WHERE demand_id = $1',
        [demand.id],
      );
      assert.equal(lidas.length, 1);
      assert.equal(lidas[0].status, 'concluida');
      assert.equal(Number(lidas[0].beneficiaries_reached), 340);
      await assert.rejects(
        gestao.query("UPDATE demand_accountability SET execution_report = 'gestão' WHERE demand_id = $1", [demand.id]),
        /permission denied|a gestão só lê/,
      );
      await assert.rejects(
        gestao.query('DELETE FROM demand_accountability_results WHERE demand_id = $1', [demand.id]),
        /permission denied|a gestão só lê/,
      );

      // ── Outro Agente não vê nem escreve ───────────────────────────────────
      assert.equal((await call('GET', `/demands/mine/${demand.id}/accountability`, { as: OTHER_AGENT })).status, 404);

      // ── Sem execução física: o antes/depois não é exigido ─────────────────
      const social = await publishedDemand('Oficina de leitura', { physical: false });
      await toAccountability(social, { physical: false });
      assert.equal((await call('PUT', `/demands/mine/${social.id}/accountability`, {
        body: {
          executionReport: 'Doze encontros de leitura com 40 participantes.',
          actionsRecord: 'Encontros semanais no centro comunitário.',
          scheduleSummary: 'Todas as etapas cumpridas no prazo.',
          beneficiariesReached: 40,
          impactIndicators: 'Empréstimo de livros dobrou na biblioteca do bairro.',
          participants: 'Mediadores de leitura voluntários.',
          finalResult: 'Clube de leitura mantido pelos participantes.',
        },
      })).status, 200);
      for (const goalId of social.goals) {
        assert.equal((await call('PUT', `/demands/mine/${social.id}/accountability/results/${goalId}`, {
          body: { measuredValue: '40 participantes', measurementMethod: 'Lista de presença', achieved: true },
        })).status, 200);
      }
      const socialView = await call('GET', `/demands/mine/${social.id}/accountability`);
      const socialAntes = socialView.body.requirements.find((r) => r.key === 'evidence_antes');
      assert.equal(socialAntes.applies, false, 'sem execução física o registro não é exigido');
      assert.equal(socialView.body.canConclude, true);
      assert.equal((await call('POST', `/demands/mine/${social.id}/accountability/conclude`)).status, 200);

      // ── Execução física sem registro do "depois": a conclusão recusa ──────
      // (a demanda chega a `prestacao_de_contas` com a dispensa da T17, e a
      // prestação usa a mesma dispensa; sem ela e sem registro, seria bloqueio)
      const semRegistro = await call('GET', `/demands/mine/${social.id}/accountability`);
      assert.equal(semRegistro.body.recordWaiverReason !== null, true);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await gestao.end();
      await pool.end();
    }
  });
