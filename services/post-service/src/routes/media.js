// Pautas da Comunicação e divulgação registrada (T28). Montada em `/` no
// post-service ANTES das rotas de demanda e de posts; público em
// `/api/posts/media/agenda*` e `/api/posts/demands/:id/coverage`.
//
// Fonte: Arquitetura de Perfis §3.5 (Comunicação: "Identificar pautas",
// "Divulgar projetos e resultados", "Compartilhar iniciativas") e §6, etapa 6
// (AMPLIFICAÇÃO). Migração post 025.
//
// Comunicação (Imprensa, Veículos, Jornalistas), com token:
//   GET  /media/agenda/discover   pautas sugeridas pelos sinais do território
//   GET  /media/agenda            minhas pautas (?status=)
//   POST /media/agenda            identificar pauta { targetKind, targetId, angle }
//   PUT  /media/agenda/:id        { status?, angle?, outletName?, publishedUrl?, publishedOn? }
// Público, sem token:
//   GET  /demands/:id/coverage    divulgações publicadas da demanda
//
// Quem não é Comunicação recebe 403 `not_media`. Nada aqui expõe nome nem id
// da conta na projeção pública: a cobertura mostra o veículo, o endereço e a
// data.

const express = require('express');
const { normalizeRole } = require('../roles');
const { HttpError, sendError } = require('../demand/store');
const { isUuid } = require('../security');
const {
  MEDIA_ROLES, STATUSES, STATUS_LABELS, STATUS_TRANSITIONS, TARGET_KINDS, TARGET_LABELS,
  SIGNALS, SIGNAL_LABELS, ANGLE_MAX, OUTLET_MAX,
} = require('../media/constants');
const { validateCreate, validateUpdate } = require('../media/validation');
const store = require('../media/store');

const validationError = (fields) => new HttpError(422, {
  error: 'Revise os campos destacados',
  code: 'validation_failed',
  fields,
});

const VOCABULARY = {
  statuses: STATUSES.map((value) => ({ value, label: STATUS_LABELS[value], next: STATUS_TRANSITIONS[value] })),
  targetKinds: TARGET_KINDS.map((value) => ({ value, label: TARGET_LABELS[value] })),
  signals: SIGNALS.map((value) => ({ value, label: SIGNAL_LABELS[value] })),
  angleMax: ANGLE_MAX,
  outletMax: OUTLET_MAX,
};

/** Só a Comunicação identifica pautas. */
function requireMedia(req, res, next) {
  if (!MEDIA_ROLES.includes(normalizeRole(req.user?.role, req.user?.profileType))) {
    return res.status(403).json({
      error: 'Identificar pautas e registrar divulgação é da Comunicação',
      code: 'not_media',
    });
  }
  return next();
}

module.exports = ({ pool, auth }) => {
  if (typeof auth !== 'function') throw new Error('media routes exigem auth');
  const router = express.Router();

  const handle = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      sendError(res, err);
    }
  };

  router.get('/media/agenda/discover', auth, requireMedia, handle(async (req, res) => {
    const candidates = await store.discover(pool, String(req.user.userId).toLowerCase());
    res.json({ vocabulary: VOCABULARY, candidates });
  }));

  router.get('/media/agenda', auth, requireMedia, handle(async (req, res) => {
    const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : null;
    if (status && !STATUSES.includes(status)) throw validationError({ status: 'Estado inválido' });
    const items = await store.listMine(pool, String(req.user.userId).toLowerCase(), status);
    res.json({ vocabulary: VOCABULARY, items });
  }));

  router.post('/media/agenda', auth, requireMedia, handle(async (req, res) => {
    const { errors, value } = validateCreate(req.body);
    if (Object.keys(errors).length) throw validationError(errors);
    const target = await store.loadPublicTarget(pool, value.targetKind, value.targetId);
    if (!target) throw new HttpError(404, { error: 'Alvo não encontrado ou não público', code: 'target_not_found' });
    const userId = String(req.user.userId).toLowerCase();
    const { rows } = await pool.query(
      `INSERT INTO media_agenda_items
         (user_id, user_name, user_category, profile_type, target_kind, target_id, target_title, angle)
       VALUES ($1, $2, 'comunicacao', $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, target_kind, target_id) DO NOTHING
       RETURNING id`,
      [userId, req.user.name || null, typeof req.user.profileType === 'string' ? req.user.profileType : null,
        value.targetKind, value.targetId, String(target.title ?? '').slice(0, 255) || null, value.angle],
    );
    if (!rows.length) {
      throw new HttpError(409, { error: 'Você já identificou esta pauta', code: 'agenda_item_exists' });
    }
    const item = await store.loadMine(pool, rows[0].id, userId);
    res.status(201).json({ item: store.serializeItem(item) });
  }));

  router.put('/media/agenda/:id', auth, requireMedia, handle(async (req, res) => {
    if (!isUuid(req.params.id)) throw new HttpError(404, { error: 'Pauta não encontrada', code: 'agenda_item_not_found' });
    const userId = String(req.user.userId).toLowerCase();
    const current = await store.loadMine(pool, req.params.id, userId);
    if (!current) throw new HttpError(404, { error: 'Pauta não encontrada', code: 'agenda_item_not_found' });
    if (current.status === 'publicada') {
      throw new HttpError(409, { error: 'Divulgação publicada não muda', code: 'agenda_item_closed' });
    }
    const { errors, value } = validateUpdate(req.body, current);
    if (Object.keys(errors).length) throw validationError(errors);
    const sets = [];
    const params = [current.id];
    const set = (column, v) => { params.push(v); sets.push(`${column} = $${params.length}`); };
    if (value.status !== undefined) set('status', value.status);
    if (value.angle !== undefined) set('angle', value.angle);
    if (value.outletName !== undefined) set('outlet_name', value.outletName);
    if (value.publishedUrl !== undefined) set('published_url', value.publishedUrl);
    if (value.publishedOn !== undefined) set('published_on', value.publishedOn);
    if (sets.length) {
      await pool.query(`UPDATE media_agenda_items SET ${sets.join(', ')} WHERE id = $1`, params);
    }
    const item = await store.loadMine(pool, current.id, userId);
    res.json({ item: store.serializeItem(item) });
  }));

  // Público: divulgações publicadas da demanda (seção "Divulgação").
  router.get('/demands/:id/coverage', handle(async (req, res) => {
    if (!isUuid(req.params.id)) throw new HttpError(404, { error: 'Demanda não encontrada' });
    const coverages = await store.listCoverage(pool, 'demanda', req.params.id.toLowerCase());
    res.json({ coverages });
  }));

  return router;
};

module.exports.requireMedia = requireMedia;
module.exports.VOCABULARY = VOCABULARY;
