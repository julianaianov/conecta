// Direitos do titular (T24, LGPD art. 18) no portal. Montada em `/` no
// user-service, antes das rotas com `/:id` do perfil; pública em
// `/api/users/me/privacy/*` (o Caddy tira `/api/users`).
//
// Com token, e sempre da própria conta:
//   GET  /me/privacy                    painel: solicitações, estado da conta,
//                                       vocabulário e a regra de retenção
//   GET  /me/privacy/requests           minhas solicitações
//   POST /me/privacy/requests           abre uma solicitação (protocolo + prazo)
//   GET  /me/privacy/requests/:id       uma solicitação
//   POST /me/privacy/requests/:id/export  gera de novo o arquivo e devolve o link
//   POST /me/privacy/erasure            eliminação/anonimização da conta
//
// Acesso e portabilidade são atendidos **na hora**: o portal monta o arquivo
// com o que os três bancos guardam da conta, grava no bucket de uploads e
// devolve uma URL assinada curta. A solicitação continua existindo e vai para a
// fila da equipe na gestão, que lê `user_db.data_subject_requests`
// (dm-docs/docs/gestao/05-lgpd.md §2 e §7).

const express = require('express');
const crypto = require('node:crypto');

const {
  REQUEST_TYPES, REQUEST_TYPE_LABELS, REQUEST_TYPE_DESCRIPTIONS, SELF_SERVICE_TYPES,
  REQUEST_STATUS_LABELS, RESPONSE_DEADLINE_DAYS, EXPORT_URL_TTL_SECONDS, EXPORT_RETENTION_DAYS,
  DESCRIPTION_MAX, RETENTION_RULES, RETENTION_ACTION_LABELS,
} = require('../privacy/constants');
const store = require('../privacy/store');
const { ServiceUnavailable, createAuthClient, createPostClient } = require('../privacy/services');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONFIRMATION = 'ELIMINAR';

/** Vocabulário que a tela usa para montar o formulário e os avisos. */
const VOCABULARY = {
  requestTypes: REQUEST_TYPES.map((value) => ({
    value,
    label: REQUEST_TYPE_LABELS[value],
    description: REQUEST_TYPE_DESCRIPTIONS[value],
    selfService: SELF_SERVICE_TYPES.includes(value),
  })),
  statusLabels: REQUEST_STATUS_LABELS,
  deadlineDays: RESPONSE_DEADLINE_DAYS,
  descriptionMax: DESCRIPTION_MAX,
  exportRetentionDays: EXPORT_RETENTION_DAYS,
  erasureConfirmation: CONFIRMATION,
  retentionRules: RETENTION_RULES,
  retentionActionLabels: RETENTION_ACTION_LABELS,
};

const exportKey = (userId, requestId) => `privacy/exports/${userId}/${requestId}.json`;

module.exports = ({
  pool,
  auth,
  storage = null,
  authService = createAuthClient(),
  postService = createPostClient(),
} = {}) => {
  if (typeof auth !== 'function') throw new Error('privacy routes exigem auth');
  const router = express.Router();

  const handle = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof ServiceUnavailable) {
        return res.status(503).json({
          error: `Serviço indisponível no momento (${err.service}). Tente de novo em instantes.`,
          code: 'privacy_service_unavailable',
        });
      }
      console.error('[privacy]', err);
      res.status(500).json({ error: 'Erro interno' });
    }
  };

  const validationError = (res, fields) => res.status(422).json({
    error: 'Revise os campos destacados', code: 'validation_failed', fields,
  });

  /**
   * Monta o arquivo da exportação (os três bancos), grava no bucket e devolve
   * `{ url, expiresAt, sha256, bytes }`. Sem bucket configurado, 503.
   */
  async function buildExport(req, request) {
    if (!storage) {
      const err = new ServiceUnavailable('uploads', 'DM_UPLOADS_BUCKET ausente');
      throw err;
    }
    const authorization = req.headers.authorization ?? '';
    const [conta, postData] = await Promise.all([
      authService.accountData(authorization),
      postService.data(authorization),
    ]);
    const userData = await store.exportUserData(pool, req.user.userId);

    const document = {
      documento: 'Exportação de dados pessoais — DM Conecta',
      base: 'LGPD (Lei 13.709/2018), art. 18, II e V',
      protocolo: request.protocol,
      geradoEm: new Date().toISOString(),
      titular: { id: req.user.userId },
      aviso: 'Este arquivo traz apenas dados desta conta. Conteúdo escrito por outras pessoas não é incluído.',
      conta: conta?.conta ?? null,
      consentimentos: conta?.consentimentos ?? [],
      perfilERede: userData,
      publicacoesEDemandas: postData?.dados ?? null,
      anonimizacao: postData?.anonimizacao ?? null,
      regraDeRetencao: RETENTION_RULES,
    };

    const body = Buffer.from(`${JSON.stringify(document, null, 2)}\n`, 'utf8');
    const sha256 = crypto.createHash('sha256').update(body).digest('hex');
    const key = exportKey(req.user.userId, request.id);
    await storage.put({ key, body, contentType: 'application/json', sha256 });

    const expiresAt = new Date(Date.now() + EXPORT_RETENTION_DAYS * 86_400_000).toISOString();
    const saved = await store.recordFulfillment(pool, request.id, {
      objectKey: key, sha256, bytes: body.length, expiresAt,
    });

    const url = await storage.presignGet({
      key,
      contentType: 'application/json',
      fileName: `dmconecta-dados-${request.protocol}.json`,
      disposition: 'attachment',
      expiresIn: EXPORT_URL_TTL_SECONDS,
    });

    return {
      request: store.serializeRequest(saved ?? request),
      download: {
        url,
        expiresAt: new Date(Date.now() + EXPORT_URL_TTL_SECONDS * 1000).toISOString(),
        fileName: `dmconecta-dados-${request.protocol}.json`,
        sha256,
        bytes: body.length,
      },
    };
  }

  router.get('/me/privacy', auth, handle(async (req, res) => {
    const requests = await store.listRequests(pool, req.user.userId);
    res.json({
      vocabulary: VOCABULARY,
      anonymized: await store.isAnonymized(pool, req.user.userId),
      requests: requests.map(store.serializeRequest),
    });
  }));

  router.get('/me/privacy/requests', auth, handle(async (req, res) => {
    const requests = await store.listRequests(pool, req.user.userId);
    res.json({ requests: requests.map(store.serializeRequest) });
  }));

  router.get('/me/privacy/requests/:id', auth, handle(async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Solicitação não encontrada' });
    const request = await store.findRequest(pool, req.user.userId, req.params.id);
    if (!request) return res.status(404).json({ error: 'Solicitação não encontrada' });
    res.json({ request: store.serializeRequest(request) });
  }));

  router.post('/me/privacy/requests', auth, handle(async (req, res) => {
    const type = typeof req.body?.type === 'string' ? req.body.type.trim() : '';
    if (!REQUEST_TYPES.includes(type)) {
      return validationError(res, { type: 'Escolha um dos direitos previstos no art. 18' });
    }
    // A eliminação tem caminho próprio, com confirmação de identidade.
    if (type === 'eliminacao') {
      return res.status(409).json({
        error: 'A eliminação da conta é pedida em /me/privacy/erasure, com confirmação de senha',
        code: 'erasure_requires_confirmation',
      });
    }
    const raw = req.body?.description;
    const description = typeof raw === 'string' && raw.trim() ? raw.trim() : null;
    if (description && description.length > DESCRIPTION_MAX) {
      return validationError(res, { description: `Use no máximo ${DESCRIPTION_MAX} caracteres` });
    }

    const request = await store.openRequest(pool, { userId: req.user.userId, type, description });
    if (!SELF_SERVICE_TYPES.includes(type)) {
      return res.status(201).json({ request: store.serializeRequest(request), download: null });
    }
    const result = await buildExport(req, request);
    res.status(201).json(result);
  }));

  router.post('/me/privacy/requests/:id/export', auth, handle(async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Solicitação não encontrada' });
    const request = await store.findRequest(pool, req.user.userId, req.params.id);
    if (!request) return res.status(404).json({ error: 'Solicitação não encontrada' });
    if (!SELF_SERVICE_TYPES.includes(request.request_type)) {
      return res.status(409).json({
        error: 'Esta solicitação não gera arquivo de exportação',
        code: 'not_exportable',
      });
    }
    res.json(await buildExport(req, request));
  }));

  router.post('/me/privacy/erasure', auth, handle(async (req, res) => {
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const confirmation = typeof req.body?.confirmation === 'string' ? req.body.confirmation.trim() : '';
    const fields = {};
    if (!password) fields.password = 'Informe a senha da conta';
    if (confirmation !== CONFIRMATION) fields.confirmation = `Digite ${CONFIRMATION} para confirmar`;
    if (Object.keys(fields).length) return validationError(res, fields);

    if (await store.isAnonymized(pool, req.user.userId)) {
      return res.status(409).json({ error: 'Esta conta já foi anonimizada', code: 'already_anonymized' });
    }

    const authorization = req.headers.authorization ?? '';
    const ok = await authService.checkPassword(authorization, password);
    if (!ok) return res.status(401).json({ error: 'Senha incorreta', code: 'invalid_password' });

    const raw = req.body?.description;
    const description = typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, DESCRIPTION_MAX) : null;
    const request = await store.openRequest(pool, {
      userId: req.user.userId, type: 'eliminacao', description,
    });

    // Ordem: conteúdo (post_db) → perfil e rede (user_db) → conta (auth_db).
    // A conta é a última porque é ela que encerra o acesso; cada etapa é
    // idempotente, então repetir o pedido completa o que faltou.
    const content = await postService.anonymize(authorization, request.protocol);
    await store.recordAnonymization(pool, req.user.userId, {
      requestId: request.id, protocol: request.protocol, scope: 'conteudo', summary: content?.summary ?? {},
    });
    const profile = await store.anonymizeUserData(pool, req.user.userId, {
      requestId: request.id, protocol: request.protocol,
    });
    const account = await authService.anonymize(authorization, request.protocol);
    await store.recordAnonymization(pool, req.user.userId, {
      requestId: request.id,
      protocol: request.protocol,
      scope: 'conta',
      summary: { anonymizedAt: account?.anonymizedAt ?? null },
    });

    const saved = await store.recordFulfillment(pool, request.id, {});
    res.json({
      request: store.serializeRequest(saved ?? request),
      anonymized: { conteudo: content?.summary ?? {}, perfil: profile, conta: Boolean(account?.anonymized) },
      retentionRules: RETENTION_RULES,
      notice: 'A conta foi anonimizada. O que a lei e o interesse público mandam reter permanece sem identificação;'
        + ' a equipe confirma o atendimento pelo protocolo, dentro do prazo legal.',
    });
  }));

  return router;
};

module.exports.CONFIRMATION = CONFIRMATION;
module.exports.VOCABULARY = VOCABULARY;
