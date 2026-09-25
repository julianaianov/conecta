// Comunicação do Processo de Conexão (T-05-02). Montada na raiz do
// post-service junto das rotas do processo; público em /api/posts/... .
// Fonte: Modelo de Conexão §12 ("usuário, instituição, cargo/perfil, data,
// horário, destinatário, mensagem, documentos anexados, histórico") e §08
// ("Nova mensagem"); decisão 13 (a conversa T27 do user_db vale na fase de
// pedido; a partir do protocolo, a comunicação é esta).
//
// Só o Agente autor da demanda e a parte conectada (conta do Parceiro ou órgão
// do Poder Público, por cadastro próprio ou vínculo T29); para os demais, 404.
//
//   GET  /processes/:ref/messages   conversa em ordem cronológica; `limit` ≤ 100 e
//                                   `before=<ISO>` paginam para trás; grava a leitura
//                                   e marca lido o aviso `nova_mensagem` do processo
//   POST /processes/:ref/messages   { body, recipient: agente|conectado|todos, attachments[] }
//                                   (anexos: `upload:<id>` da finalidade `process_attachment`,
//                                   confirmados pelo autor para este processo; 422 se não)
//
// Cada mensagem grava o retrato do autor (nome, instituição e cargo/perfil,
// pelo GET /me/institution/status do user-service), entra na linha do tempo do
// processo como `mensagem_registrada` (privado; trigger da migração 027) e
// avisa o outro lado na central de notificações (`nova_mensagem`).

const express = require('express');
const {
  sideOfRole, validateMessage, parseMessagesQuery, messageRecipients, serializeMessage,
} = require('../process/communication');
const store = require('../process/store');
const demandStore = require('../demand/store');
const { evaluateDemandAuthor } = require('../demand/gate');
const { describeUploads } = require('../uploads');
const { notify } = require('../notifications');
const { listHelpers } = require('./demands');

const { HttpError, withTransaction } = demandStore;
const { validationError } = listHelpers;

const MESSAGE_SQL = `SELECT id, process_id, author_id, author_side, author_name, author_organization_name,
                            author_role_label, recipient_party, body, attachments::text[] AS attachments, created_at
                       FROM connection_process_messages`;

const READ_SQL = `INSERT INTO connection_process_message_reads (process_id, user_id, last_read_at)
                  VALUES ($1, $2, NOW())
                  ON CONFLICT (process_id, user_id) DO UPDATE SET last_read_at = NOW()`;

/** Aviso na transação da ação, sem desfazê-la se falhar (savepoint). */
async function safeNotify(client, input) {
  await client.query('SAVEPOINT process_notify');
  try {
    await notify(client, input);
    await client.query('RELEASE SAVEPOINT process_notify');
  } catch (err) {
    await client.query('ROLLBACK TO SAVEPOINT process_notify');
    console.warn(`[processes] aviso não gerado: ${err.message}`);
  }
}

module.exports = ({ pool, auth, institutionStatus, uploadStorage = null }) => {
  if (typeof auth !== 'function') throw new Error('process communication routes exigem auth');
  const router = express.Router();
  router.param('ref', (req, res, next, ref) => (store.isProcessRef(ref) ? next() : res.status(404).json({ error: 'Processo não encontrado' })));

  const handle = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      const mapped = store.mapProcessError(err);
      if (mapped) return res.status(mapped.status).json(mapped.body);
      console.error(err);
      return res.status(500).json({ error: 'Erro interno' });
    }
  };

  /** Estado institucional de quem escreve (retrato e, para o Agente, a validação). */
  async function accessOf(req) {
    try {
      return await institutionStatus(req);
    } catch (err) {
      console.error(`[processes] ${err.message}`);
      return null;
    }
  }

  /** Nome, instituição e cargo/perfil no envio (§12). */
  function authorSnapshot(req, row, side, access) {
    const name = typeof req.user?.name === 'string' && req.user.name.trim() ? req.user.name.trim() : null;
    const organizationName = access?.organizationName
      ?? (side === 'conectado' && row.party_kind === 'poder_publico' ? row.party_name : null);
    return {
      name: (name ?? (side === 'agente' ? 'Agente de Transformação' : row.party_name)).slice(0, 255),
      organizationName: organizationName ? String(organizationName).slice(0, 255) : null,
      roleLabel: access?.roleLabel ? String(access.roleLabel).slice(0, 120) : null,
    };
  }

  router.get('/processes/:ref/messages', auth, handle(async (req, res) => {
    const { value, errors } = parseMessagesQuery(req.query);
    if (Object.keys(errors).length) throw validationError(errors);
    const { row } = await store.loadVisibleProcess(pool, req, req.params.ref, institutionStatus);
    const params = [row.id];
    let where = 'process_id = $1';
    if (value.before) {
      params.push(value.before);
      where += ` AND created_at < $${params.length}`;
    }
    params.push(value.limit + 1);
    const { rows } = await pool.query(
      `${MESSAGE_SQL} WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT $${params.length}`,
      params,
    );
    const hasMore = rows.length > value.limit;
    const page = rows.slice(0, value.limit).reverse();
    const files = await describeUploads(pool, uploadStorage, page.flatMap((m) => m.attachments ?? []), 'process_id');
    await pool.query(READ_SQL, [row.id, req.user.userId]);
    // Abrir a conversa lê o aviso de nova mensagem deste processo (da conta e,
    // quando a parte é órgão, do órgão).
    try {
      const organizationId = row.party_kind === 'poder_publico'
        ? await store.governmentOrganizationOf(req, institutionStatus) : null;
      await pool.query(
        `UPDATE notifications SET read_at = NOW()
          WHERE kind = 'nova_mensagem' AND process_id = $1 AND read_at IS NULL
            AND (user_id = $2 OR ($3::uuid IS NOT NULL AND organization_id = $3::uuid))`,
        [row.id, req.user.userId, organizationId],
      );
    } catch (err) {
      console.warn(`[processes] aviso não marcado como lido: ${err.message}`);
    }
    res.json({
      messages: page.map((m) => serializeMessage(m, { viewerId: req.user.userId, files })),
      hasMore,
      open: !row.closed_at,
    });
  }));

  router.post('/processes/:ref/messages', auth, handle(async (req, res) => {
    const { value, errors } = validateMessage(req.body);
    if (Object.keys(errors).length) throw validationError(errors);
    const message = await withTransaction(pool, async (client) => {
      const { row, role } = await store.loadVisibleProcess(client, req, req.params.ref, institutionStatus, { forUpdate: true });
      const access = await accessOf(req);
      if (role === 'agente') {
        if (!access) throw new HttpError(503, { error: 'Não foi possível confirmar a validação institucional' });
        const gate = evaluateDemandAuthor(req.user, access);
        if (!gate.allowed) throw new HttpError(gate.httpStatus, { error: gate.error, code: gate.code });
      }
      if (row.closed_at) {
        throw new HttpError(409, {
          error: 'O processo foi encerrado; a conversa fica registrada e não recebe novas mensagens',
          code: 'process_closed',
        });
      }
      if (value.attachments.length) {
        const { rows: found } = await client.query(
          `SELECT id FROM uploads
            WHERE id = ANY($1::uuid[]) AND owner_id = $2 AND purpose = 'process_attachment'
              AND status = 'confirmado' AND process_id = $3`,
          [value.attachments, req.user.userId, row.id],
        );
        if (found.length !== value.attachments.length) {
          throw validationError({ attachments: 'Anexo não encontrado: envie e confirme o arquivo neste processo' });
        }
      }
      const side = sideOfRole(role);
      const author = authorSnapshot(req, row, side, access);
      const { rows: [created] } = await client.query(
        `INSERT INTO connection_process_messages
           (process_id, demand_id, author_id, author_side, author_name, author_organization_name, author_role_label,
            recipient_party, body, attachments)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::uuid[])
         RETURNING id`,
        [row.id, row.demand_id, req.user.userId, side, author.name, author.organizationName, author.roleLabel,
          value.recipient, value.body, value.attachments],
      );
      await client.query(READ_SQL, [row.id, req.user.userId]);
      for (const target of messageRecipients(row, side, value.recipient)) {
        await safeNotify(client, {
          ...target,
          kind: 'nova_mensagem',
          title: `Nova mensagem no processo ${row.protocol}`,
          body: row.demand_title ?? null,
          href: `/processos/${row.protocol}`,
          demandId: row.demand_id,
          processId: row.id,
          dedupeKey: `processo-mensagem:${row.id}`,
        });
      }
      const { rows } = await client.query(`${MESSAGE_SQL} WHERE id = $1`, [created.id]);
      return rows[0];
    });
    const files = await describeUploads(pool, uploadStorage, message.attachments ?? [], 'process_id');
    res.status(201).json({ message: serializeMessage(message, { viewerId: req.user.userId, files }) });
  }));

  return router;
};

module.exports.MESSAGE_SQL = MESSAGE_SQL;
