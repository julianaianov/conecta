// Acesso ao banco dos rankings, selos e compartilhamentos (T21).
//
// Regra de desempenho da tarefa: **nenhuma requisição pública roda agregação**.
// `refresh()` recalcula os 7 rankings × 3 períodos e os selos de uma vez, num
// laço de fundo, e troca o conteúdo de `ranking_snapshots`, `profile_badges` e
// `profile_engagement` numa transação. As rotas leem só essas tabelas, por
// índice.
//
// Neutralidade (slide 13): a conta só entra num ranking de pessoas se a
// categoria dela for conhecida e diferente de `poder_publico` — falha fechada.
// Para o Poder Público, `profile_engagement.metrics` guarda os indicadores de
// atuação, sem pontos e sem posição.

const {
  BOARDS, BADGES, EXCLUDED_CATEGORY, COMPANY_PROFILE_TYPES,
  SUPPORT_BOARD_EXCLUDED_CATEGORIES, SPONSOR_BOARD_EXCLUDED_CATEGORIES, normalizeActorCategory,
} = require('./constants');
const { PERIODS } = require('./constants');
const { periodStart, pointsFor, rankEntries } = require('./scoring');

// Apoio que conta: confirmado pelo Agente autor, não cancelado nem rejeitado.
const confirmedSupport = (alias = '') => {
  const p = alias ? `${alias}.` : '';
  return `${p}canceled_at IS NULL AND ${p}status = 'confirmed'
    AND (${p}receipt_status IS NULL OR ${p}receipt_status = 'confirmado')`;
};
const CONFIRMED_SUPPORT = confirmedSupport();
const SPONSOR_MODALITIES = "('patrocinar_projeto', 'financiar_evento')";
// Demanda que aparece em ranking: publicada e fora do arquivo.
const publicDemand = (alias = '') => {
  const prefix = alias ? `${alias}.` : '';
  return `${prefix}published_at IS NOT NULL AND ${prefix}status <> 'arquivada'`;
};
const PUBLIC_DEMAND = publicDemand();

// Teto de linhas guardadas por ranking × período. A leitura pública nunca pede
// mais do que isso, e o recálculo não grava uma tabela inteira de demandas.
const SNAPSHOT_LIMIT = 100;

const asCount = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
};

/** Chave estável do bairro (não há id: o território é texto da demanda). */
function placeKey(uf, municipality, district) {
  return [uf ?? '', municipality ?? '', district ?? ''].join('|').toLowerCase();
}

function placeLabel(uf, municipality, district) {
  const parts = [district, municipality, uf].filter((p) => typeof p === 'string' && p.trim());
  return parts.join(' · ');
}

// ── Identidade das contas (retratos gravados no próprio post_db) ────────────
// O post_db não conhece `profiles` (outra base). Cada tabela do fluxo já grava
// o retrato do nome de quem agiu; aqui esses retratos viram uma identidade só.
//
// Poder Público (§4 de Perfis: "indicadores de atuação, respostas,
// encaminhamentos e resultados"): quem registra atuação institucional (abre
// acompanhamento, responde, oferece apoio, encaminha, divulga ação ou organiza
// evento do órgão) é Poder Público por definição, mesmo sem nunca ter apoiado,
// demonstrado interesse, compartilhado, publicado ou comentado. Sem essas
// linhas a categoria ficava desconhecida e o órgão recebia selos vazios e a
// opção de consentimento de ranking. Vale também para a conta que age pelo
// órgão por vínculo (T29): essas rotas só aceitam o papel efetivo de Poder
// Público, e a conta fica fora de ranking de pessoas, como já ocorria quando o
// apoio ou o interesse era registrado por delegação. `GOVERNMENT_SQL` (abaixo)
// lê as mesmas tabelas; o teste de domínio confere que nenhuma fica de fora.
const ACTORS_SQL = `
  WITH snap AS (
    SELECT user_id, supporter_category AS category, profile_type,
           COALESCE(public_name, user_name) AS name, NULL::varchar AS avatar,
           display_consent AS consent, created_at
      FROM supports
    UNION ALL
    SELECT user_id, user_category, profile_type, user_name, user_avatar, false, created_at
      FROM demand_interests
    UNION ALL
    SELECT author_id, 'agente', NULL, author_name, author_avatar, false, created_at
      FROM demands
    UNION ALL
    SELECT user_id, user_role, profile_type, user_name, user_avatar, false, created_at
      FROM content_shares
    UNION ALL
    SELECT author_id, NULL, NULL, author_name, author_avatar, false, created_at
      FROM posts
    UNION ALL
    SELECT author_id, NULL, NULL, author_name, NULL, false, created_at
      FROM comments
    UNION ALL
    SELECT opened_by, 'poder_publico', NULL, opened_by_name, NULL, false, created_at
      FROM demand_institutional_tracks
    UNION ALL
    SELECT author_id, 'poder_publico', NULL, author_name, NULL, false, created_at
      FROM demand_institutional_responses
    UNION ALL
    SELECT author_id, 'poder_publico', NULL, author_name, NULL, false, created_at
      FROM demand_institutional_offers
    UNION ALL
    SELECT forwarded_by, 'poder_publico', NULL, forwarded_by_name, NULL, false, created_at
      FROM demand_forwardings
    UNION ALL
    SELECT author_id, 'poder_publico', NULL, author_name, NULL, false, created_at
      FROM demand_forwarding_updates
    UNION ALL
    SELECT author_id, 'poder_publico', NULL, author_name, NULL, false, created_at
      FROM government_actions
    UNION ALL
    SELECT organizer_id, organizer_category, organizer_profile_type, organizer_name,
           organizer_avatar, false, created_at
      FROM events
     WHERE organizer_category = 'poder_publico'
  ), agg AS (
    SELECT user_id,
           array_agg(DISTINCT category) FILTER (WHERE category IS NOT NULL) AS categories,
           (array_agg(category ORDER BY created_at DESC NULLS LAST)
              FILTER (WHERE category IS NOT NULL))[1] AS latest_category,
           (array_agg(name ORDER BY created_at DESC NULLS LAST)
              FILTER (WHERE name IS NOT NULL AND btrim(name) <> ''))[1] AS name,
           (array_agg(avatar ORDER BY created_at DESC NULLS LAST)
              FILTER (WHERE avatar IS NOT NULL))[1] AS avatar,
           (array_agg(profile_type ORDER BY created_at DESC NULLS LAST)
              FILTER (WHERE profile_type IS NOT NULL))[1] AS profile_type,
           bool_or(consent) AS support_consent
      FROM snap
     WHERE user_id IS NOT NULL
     GROUP BY user_id
  )
  SELECT a.user_id, a.categories, a.latest_category, a.name, a.avatar, a.profile_type,
         COALESCE(a.support_consent, false) AS support_consent,
         COALESCE(c.consent, false) AS profile_consent
    FROM agg a
    LEFT JOIN ranking_consents c ON c.user_id = a.user_id`;

async function loadActors(db) {
  const { rows } = await db.query(ACTORS_SQL);
  const actors = new Map();
  for (const row of rows) {
    const categories = (row.categories ?? []).map(normalizeActorCategory).filter(Boolean);
    const government = categories.includes(EXCLUDED_CATEGORY);
    const category = normalizeActorCategory(row.latest_category);
    actors.set(row.user_id, {
      userId: row.user_id,
      government,
      // Sem categoria conhecida, a conta fica fora dos rankings de pessoas: é
      // a única forma de garantir que nenhum órgão entre sem ser percebido.
      category: government ? EXCLUDED_CATEGORY : category,
      name: row.name ?? null,
      avatar: row.avatar ?? null,
      profileType: row.profile_type ?? null,
      supportConsent: row.support_consent === true,
      profileConsent: row.profile_consent === true,
    });
  }
  return actors;
}

// ── Métricas por período ───────────────────────────────────────────────────

const ACTIVITY_SQL = `
  SELECT user_id, kind, count(*)::int AS total FROM (
    SELECT user_id, 'reactions' AS kind FROM reactions
     WHERE ($1::timestamptz IS NULL OR created_at >= $1)
    UNION ALL
    SELECT author_id, 'comments' FROM comments
     WHERE ($1::timestamptz IS NULL OR created_at >= $1)
    UNION ALL
    SELECT s.user_id, 'shares' FROM content_shares s
      LEFT JOIN demands d ON d.id = s.demand_id
      LEFT JOIN posts p ON p.id = s.post_id
     WHERE ($1::timestamptz IS NULL OR s.created_at >= $1)
       AND s.user_id IS DISTINCT FROM COALESCE(d.author_id, p.author_id)
    UNION ALL
    SELECT user_id, 'interests' FROM demand_interests
     WHERE withdrawn_at IS NULL AND ($1::timestamptz IS NULL OR created_at >= $1)
    UNION ALL
    SELECT user_id, 'supports' FROM supports
     WHERE canceled_at IS NULL AND status <> 'rejected'
       AND ($1::timestamptz IS NULL OR created_at >= $1)
    UNION ALL
    SELECT author_id, 'demands' FROM demands
     WHERE ${PUBLIC_DEMAND} AND ($1::timestamptz IS NULL OR published_at >= $1)
  ) t
  WHERE user_id IS NOT NULL
  GROUP BY 1, 2`;

const SUPPORTER_SQL = `
  SELECT user_id,
         count(*)::int AS confirmed_supports,
         count(DISTINCT demand_id)::int AS supported_demands,
         count(DISTINCT modality)::int AS modalities,
         count(*) FILTER (WHERE type = 'volunteering')::int AS volunteering_supports,
         count(*) FILTER (WHERE modality IN ${SPONSOR_MODALITIES})::int AS sponsor_supports,
         COALESCE(SUM(amount) FILTER (
           WHERE modality IN ${SPONSOR_MODALITIES}
             AND display_consent AND amount_public AND amount > 0), 0)::numeric AS sponsor_amount,
         bool_or(display_consent) AS display_consent
    FROM supports
   WHERE ${CONFIRMED_SUPPORT}
     AND (supporter_category IS NULL OR supporter_category <> 'poder_publico')
     AND ($1::timestamptz IS NULL OR created_at >= $1)
   GROUP BY user_id`;

const VOLUNTEER_SQL = `
  SELECT user_id,
         count(*)::int AS interests,
         count(*) FILTER (WHERE connection_status = 'aceita')::int AS accepted_connections
    FROM demand_interests
   WHERE user_category = 'comunidade' AND kind IN ('voluntariado', 'participacao')
     AND withdrawn_at IS NULL
     AND ($1::timestamptz IS NULL OR created_at >= $1)
   GROUP BY user_id`;

const PLACES_SQL = `
  SELECT uf, municipality, district, kind, sum(n)::bigint AS total FROM (
    SELECT d.uf, d.municipality, d.district, 'demands' AS kind, 1 AS n
      FROM demands d
     WHERE ${publicDemand('d')} AND d.district IS NOT NULL
       AND ($1::timestamptz IS NULL OR d.published_at >= $1)
    UNION ALL
    SELECT d.uf, d.municipality, d.district, 'confirmedSupports', 1
      FROM supports s JOIN demands d ON d.id = s.demand_id
     WHERE ${publicDemand('d')} AND d.district IS NOT NULL
       AND ${confirmedSupport('s')}
       AND (s.supporter_category IS NULL OR s.supporter_category <> 'poder_publico')
       AND ($1::timestamptz IS NULL OR s.created_at >= $1)
    UNION ALL
    SELECT d.uf, d.municipality, d.district, 'interests', 1
      FROM demand_interests i JOIN demands d ON d.id = i.demand_id
     WHERE ${publicDemand('d')} AND d.district IS NOT NULL AND i.withdrawn_at IS NULL
       AND ($1::timestamptz IS NULL OR i.created_at >= $1)
    UNION ALL
    SELECT d.uf, d.municipality, d.district, 'shares', 1
      FROM content_shares s JOIN demands d ON d.id = s.demand_id
     WHERE ${publicDemand('d')} AND d.district IS NOT NULL
       AND s.user_id IS DISTINCT FROM d.author_id
       AND ($1::timestamptz IS NULL OR s.created_at >= $1)
  ) t
  GROUP BY 1, 2, 3, 4`;

const DEMANDS_SQL = `
  WITH pub AS (
    SELECT id, title, category, status, district, municipality, uf, territory
      FROM demands WHERE ${PUBLIC_DEMAND}
  ), sup AS (
    SELECT demand_id, count(*)::int AS n FROM supports
     WHERE demand_id IS NOT NULL AND ${CONFIRMED_SUPPORT}
       AND (supporter_category IS NULL OR supporter_category <> 'poder_publico')
       AND ($1::timestamptz IS NULL OR created_at >= $1)
     GROUP BY demand_id
  ), ints AS (
    SELECT demand_id, count(*)::int AS n FROM demand_interests
     WHERE withdrawn_at IS NULL AND ($1::timestamptz IS NULL OR created_at >= $1)
     GROUP BY demand_id
  ), sh AS (
    SELECT s.demand_id, count(*)::int AS n
      FROM content_shares s JOIN demands d ON d.id = s.demand_id
     WHERE s.demand_id IS NOT NULL AND s.user_id IS DISTINCT FROM d.author_id
       AND ($1::timestamptz IS NULL OR s.created_at >= $1)
     GROUP BY s.demand_id
  ), eng AS (
    SELECT p.demand_id,
           count(*) FILTER (WHERE x.src = 'r')::int AS reactions,
           count(*) FILTER (WHERE x.src = 'c')::int AS comments
      FROM (
        SELECT post_id, 'r' AS src, created_at FROM reactions
        UNION ALL SELECT post_id, 'c', created_at FROM comments
      ) x
      JOIN posts p ON p.id = x.post_id
     WHERE p.demand_id IS NOT NULL AND p.visibility = 'visible'
       AND ($1::timestamptz IS NULL OR x.created_at >= $1)
     GROUP BY p.demand_id
  )
  SELECT pub.id, pub.title, pub.category, pub.status, pub.district, pub.municipality,
         pub.uf, pub.territory,
         COALESCE(sup.n, 0) AS confirmed_supports, COALESCE(ints.n, 0) AS interests,
         COALESCE(sh.n, 0) AS shares, COALESCE(eng.reactions, 0) AS reactions,
         COALESCE(eng.comments, 0) AS comments
    FROM pub
    LEFT JOIN sup  ON sup.demand_id = pub.id
    LEFT JOIN ints ON ints.demand_id = pub.id
    LEFT JOIN sh   ON sh.demand_id = pub.id
    LEFT JOIN eng  ON eng.demand_id = pub.id`;

async function loadPeriodMetrics(db, since) {
  const params = [since];
  const [activity, supporters, volunteers, places, demands] = await Promise.all([
    db.query(ACTIVITY_SQL, params),
    db.query(SUPPORTER_SQL, params),
    db.query(VOLUNTEER_SQL, params),
    db.query(PLACES_SQL, params),
    db.query(DEMANDS_SQL, params),
  ]);
  return { activity, supporters, volunteers, places, demands };
}

// ── Montagem dos sete rankings ─────────────────────────────────────────────

function userEntry(actor, points, metrics, consented) {
  return {
    subjectKind: 'usuario',
    subjectId: actor.userId,
    identified: consented && Boolean(actor.name),
    displayName: consented ? actor.name : null,
    avatarUrl: consented ? actor.avatar : null,
    category: actor.category,
    profileType: actor.profileType,
    place: null,
    points,
    metrics,
  };
}

/**
 * Um ranking de pessoas só admite conta de categoria conhecida e diferente de
 * `poder_publico` (slide 13). `categories` restringe ainda mais (Parceiro em
 * "Empresas em destaque", Membro da Comunidade em "Voluntários...").
 */
function eligible(actor, categories) {
  if (!actor || !actor.category || actor.government) return false;
  if (actor.category === EXCLUDED_CATEGORY) return false;
  return !categories || categories.includes(actor.category);
}

function buildBoards(actors, metrics) {
  const boards = new Map(BOARDS.map((board) => [board.id, []]));

  // 1. Usuários mais ativos.
  const activity = new Map();
  for (const row of metrics.activity.rows) {
    const current = activity.get(row.user_id) ?? {};
    current[row.kind] = asCount(row.total);
    activity.set(row.user_id, current);
  }
  for (const [userId, values] of activity) {
    const actor = actors.get(userId);
    if (!eligible(actor)) continue;
    const points = pointsFor('usuarios_mais_ativos', values);
    if (points <= 0) continue;
    boards.get('usuarios_mais_ativos').push(
      userEntry(actor, points, values, actor.profileConsent),
    );
  }

  // 2, 3 e 5. Apoiadores, empresas e patrocinadores.
  const volunteers = new Map(metrics.volunteers.rows.map((row) => [row.user_id, row]));
  for (const row of metrics.supporters.rows) {
    const actor = actors.get(row.user_id);
    if (!eligible(actor)) continue;
    if (SUPPORT_BOARD_EXCLUDED_CATEGORIES.includes(actor.category)) continue;
    const base = {
      confirmedSupports: asCount(row.confirmed_supports),
      supportedDemands: asCount(row.supported_demands),
      modalities: asCount(row.modalities),
    };
    // O consentimento do próprio apoio (T16) vale nos rankings de apoio.
    const consented = actor.profileConsent || row.display_consent === true;

    const supporterPoints = pointsFor('maiores_apoiadores', base);
    if (supporterPoints > 0) {
      boards.get('maiores_apoiadores').push(userEntry(actor, supporterPoints, base, consented));
    }
    if (actor.category === 'parceiro') {
      const companyPoints = pointsFor('empresas_em_destaque', base);
      if (companyPoints > 0) {
        boards.get('empresas_em_destaque').push(userEntry(actor, companyPoints, {
          ...base,
          company: COMPANY_PROFILE_TYPES.includes(actor.profileType ?? ''),
        }, consented));
      }
    }
    const sponsorMetrics = {
      amount: Number(row.sponsor_amount) || 0,
      confirmedSupports: asCount(row.sponsor_supports),
    };
    const sponsorPoints = SPONSOR_BOARD_EXCLUDED_CATEGORIES.includes(actor.category)
      ? 0 : pointsFor('maiores_patrocinadores', sponsorMetrics);
    if (sponsorPoints > 0) {
      // Só entra apoio com nome **e** valor autorizados: aqui o nome sempre aparece.
      boards.get('maiores_patrocinadores').push(userEntry(actor, sponsorPoints, sponsorMetrics, true));
    }
  }

  // 4. Voluntários mais participativos.
  const supporters = new Map(metrics.supporters.rows.map((row) => [row.user_id, row]));
  for (const [userId, row] of volunteers) {
    const actor = actors.get(userId);
    if (!eligible(actor, ['comunidade'])) continue;
    const supporter = supporters.get(userId);
    const values = {
      interests: asCount(row.interests),
      acceptedConnections: asCount(row.accepted_connections),
      confirmedSupports: asCount(supporter?.volunteering_supports),
    };
    const points = pointsFor('voluntarios_mais_participativos', values);
    if (points <= 0) continue;
    const consented = actor.profileConsent || supporter?.display_consent === true;
    boards.get('voluntarios_mais_participativos').push(userEntry(actor, points, values, consented));
  }

  // 6. Bairros mais engajados (sem dado pessoal).
  const places = new Map();
  for (const row of metrics.places.rows) {
    const key = placeKey(row.uf, row.municipality, row.district);
    const current = places.get(key) ?? {
      uf: row.uf, municipality: row.municipality, district: row.district, values: {},
    };
    current.values[row.kind] = asCount(row.total);
    places.set(key, current);
  }
  for (const [key, place] of places) {
    const points = pointsFor('bairros_mais_engajados', place.values);
    if (points <= 0) continue;
    boards.get('bairros_mais_engajados').push({
      subjectKind: 'bairro',
      subjectId: key,
      identified: true,
      displayName: placeLabel(place.uf, place.municipality, place.district),
      avatarUrl: null,
      category: null,
      profileType: null,
      place: placeLabel(place.uf, place.municipality, place.district),
      points,
      metrics: place.values,
    });
  }

  // 7. Projetos mais apoiados (a demanda publicada já é pública).
  for (const row of metrics.demands.rows) {
    const values = {
      confirmedSupports: asCount(row.confirmed_supports),
      interests: asCount(row.interests),
      shares: asCount(row.shares),
      reactions: asCount(row.reactions),
      comments: asCount(row.comments),
    };
    const points = pointsFor('projetos_mais_apoiados', values);
    if (points <= 0) continue;
    boards.get('projetos_mais_apoiados').push({
      subjectKind: 'demanda',
      subjectId: row.id,
      identified: true,
      displayName: row.title ?? null,
      avatarUrl: null,
      category: row.category ?? null,
      profileType: row.status ?? null,
      place: placeLabel(row.uf, row.municipality, row.district) || row.territory || null,
      points,
      metrics: values,
    });
  }

  const result = new Map();
  for (const [boardId, entries] of boards) result.set(boardId, rankEntries(entries));
  return result;
}

// ── Selos de impacto e números do perfil ───────────────────────────────────

const BADGE_SUPPORTS_SQL = `
  SELECT user_id, count(*)::int AS total, min(created_at) AS first_at,
         (array_agg(created_at ORDER BY created_at))[5] AS fifth_at,
         min(created_at) FILTER (WHERE modality IN ${SPONSOR_MODALITIES}) AS sponsor_at,
         count(*) FILTER (WHERE modality IN ${SPONSOR_MODALITIES})::int AS sponsor_total
    FROM supports
   WHERE ${CONFIRMED_SUPPORT}
     AND (supporter_category IS NULL OR supporter_category <> 'poder_publico')
   GROUP BY user_id`;

const BADGE_VOLUNTEER_SQL = `
  SELECT user_id, count(*)::int AS total, min(connection_answered_at) AS first_at
    FROM demand_interests
   WHERE kind IN ('voluntariado', 'participacao') AND connection_status = 'aceita'
     AND withdrawn_at IS NULL AND connection_answered_at IS NOT NULL
   GROUP BY user_id`;

const BADGE_AGENT_SQL = `
  SELECT d.author_id AS user_id,
         count(DISTINCT d.id) FILTER (WHERE d.status IN ('concluida', 'prestacao_de_contas', 'encerrada'))::int AS concluded,
         min(e.created_at) FILTER (WHERE e.to_status = 'concluida') AS concluded_at,
         count(DISTINCT a.demand_id) FILTER (WHERE a.status = 'concluida')::int AS accountability,
         min(a.concluded_at) AS accountability_at,
         count(DISTINCT ev.id) FILTER (WHERE ev.pair_evidence_id IS NOT NULL)::int AS pairs,
         min(ev.created_at) FILTER (WHERE ev.pair_evidence_id IS NOT NULL) AS pair_at
    FROM demands d
    LEFT JOIN demand_events e ON e.demand_id = d.id
    LEFT JOIN demand_accountability a ON a.demand_id = d.id AND a.status = 'concluida'
    LEFT JOIN demand_evidences ev ON ev.demand_id = d.id
   GROUP BY d.author_id`;

const BADGE_SHARES_SQL = `
  SELECT s.user_id, count(*)::int AS total,
         (array_agg(s.created_at ORDER BY s.created_at))[10] AS tenth_at
    FROM content_shares s
    LEFT JOIN demands d ON d.id = s.demand_id
    LEFT JOIN posts p ON p.id = s.post_id
   WHERE s.user_id IS DISTINCT FROM COALESCE(d.author_id, p.author_id)
   GROUP BY s.user_id`;

// Indicadores de atuação do Poder Público (slide 13): contagem do que a conta
// do representante registrou, nunca pontuação nem posição. Substituem o
// ranking, que o órgão não disputa.
const GOVERNMENT_SQL = `
  SELECT user_id, kind, count(*)::int AS total FROM (
    SELECT opened_by AS user_id, 'tracks' AS kind FROM demand_institutional_tracks
    UNION ALL
    SELECT opened_by, 'concluded' FROM demand_institutional_tracks WHERE status = 'concluida'
    UNION ALL
    SELECT author_id, 'responses' FROM demand_institutional_responses
    UNION ALL
    SELECT author_id, 'offers' FROM demand_institutional_offers
    UNION ALL
    SELECT forwarded_by, 'forwardings' FROM demand_forwardings
  ) t
  WHERE user_id IS NOT NULL
  GROUP BY 1, 2`;

function badgeRow(userId, badge, awardedAt, evidenceCount) {
  return {
    userId, badge, awardedAt: awardedAt ?? new Date(), evidenceCount: asCount(evidenceCount),
  };
}

async function loadBadges(db, actors) {
  const [supports, volunteers, agents, shares, government] = await Promise.all([
    db.query(BADGE_SUPPORTS_SQL),
    db.query(BADGE_VOLUNTEER_SQL),
    db.query(BADGE_AGENT_SQL),
    db.query(BADGE_SHARES_SQL),
    db.query(GOVERNMENT_SQL),
  ]);
  const badges = [];
  const engagement = new Map();
  const touch = (userId) => {
    if (!engagement.has(userId)) {
      engagement.set(userId, { userId, category: actors.get(userId)?.category ?? null, metrics: {} });
    }
    return engagement.get(userId);
  };
  // Toda conta conhecida ganha a linha, mesmo sem número: é ela que diz à rota
  // do perfil que o Poder Público recebe indicadores em vez de selo.
  for (const userId of actors.keys()) touch(userId);

  for (const row of supports.rows) {
    const actor = actors.get(row.user_id);
    const entry = touch(row.user_id);
    entry.metrics.confirmedSupports = asCount(row.total);
    entry.metrics.sponsorSupports = asCount(row.sponsor_total);
    if (!eligible(actor)) continue;
    if (asCount(row.total) >= 1) badges.push(badgeRow(row.user_id, 'apoiador_confirmado', row.first_at, row.total));
    if (asCount(row.total) >= 5) badges.push(badgeRow(row.user_id, 'apoiador_recorrente', row.fifth_at, row.total));
    if (asCount(row.sponsor_total) >= 1) badges.push(badgeRow(row.user_id, 'patrocinador', row.sponsor_at, row.sponsor_total));
  }
  for (const row of volunteers.rows) {
    const entry = touch(row.user_id);
    entry.metrics.acceptedVolunteering = asCount(row.total);
    if (!eligible(actors.get(row.user_id), ['comunidade'])) continue;
    if (asCount(row.total) >= 1) badges.push(badgeRow(row.user_id, 'voluntario_participante', row.first_at, row.total));
  }
  for (const row of agents.rows) {
    const entry = touch(row.user_id);
    entry.metrics.concludedDemands = asCount(row.concluded);
    entry.metrics.accountabilities = asCount(row.accountability);
    entry.metrics.evidencePairs = asCount(row.pairs);
    if (!eligible(actors.get(row.user_id))) continue;
    if (asCount(row.concluded) >= 1) badges.push(badgeRow(row.user_id, 'agente_com_demanda_concluida', row.concluded_at, row.concluded));
    if (asCount(row.accountability) >= 1) badges.push(badgeRow(row.user_id, 'prestacao_de_contas_publicada', row.accountability_at, row.accountability));
    if (asCount(row.pairs) >= 1) badges.push(badgeRow(row.user_id, 'registro_antes_e_depois', row.pair_at, row.pairs));
  }
  for (const row of shares.rows) {
    const entry = touch(row.user_id);
    entry.metrics.shares = asCount(row.total);
    if (!eligible(actors.get(row.user_id))) continue;
    if (asCount(row.total) >= 10) badges.push(badgeRow(row.user_id, 'divulgador', row.tenth_at, row.total));
  }
  // Poder Público: indicadores de atuação em vez de ranking e de selo
  // (slide 13). Ficam em `profile_engagement.metrics.government`. Quem tem
  // atuação institucional registrada é Poder Público, mesmo que `actors` (lido
  // antes, noutra consulta) ainda não a tenha visto.
  for (const row of government.rows) {
    const entry = touch(row.user_id);
    entry.category = EXCLUDED_CATEGORY;
    entry.metrics.government = { ...(entry.metrics.government ?? {}), [row.kind]: asCount(row.total) };
  }
  return { badges, engagement: [...engagement.values()] };
}

// ── Recálculo ──────────────────────────────────────────────────────────────

async function refresh(pool, { now = new Date() } = {}) {
  const started = Date.now();
  const actors = await loadActors(pool);
  const computedAt = new Date(now);

  const rows = [];
  for (const period of PERIODS) {
    const since = periodStart(period, computedAt);
    const metrics = await loadPeriodMetrics(pool, since);
    const boards = buildBoards(actors, metrics);
    for (const [boardId, entries] of boards) {
      for (const entry of entries.slice(0, SNAPSHOT_LIMIT)) {
        rows.push({ board: boardId, period, ...entry });
      }
    }
  }
  const { badges, engagement } = await loadBadges(pool, actors);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM ranking_snapshots');
    for (const row of rows) {
      await client.query(
        `INSERT INTO ranking_snapshots
           (board, period, position, tied, subject_kind, subject_id, identified, display_name,
            avatar_url, category, profile_type, place, points, metrics, computed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [row.board, row.period, row.position, row.tied, row.subjectKind, row.subjectId,
          row.identified, row.identified ? row.displayName : null,
          row.identified ? row.avatarUrl : null, row.category, row.profileType, row.place,
          row.points, JSON.stringify(row.metrics ?? {}), computedAt],
      );
    }
    await client.query('DELETE FROM profile_badges');
    for (const badge of badges) {
      await client.query(
        `INSERT INTO profile_badges (user_id, badge, awarded_at, evidence_count, computed_at)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (user_id, badge) DO UPDATE
           SET awarded_at = EXCLUDED.awarded_at, evidence_count = EXCLUDED.evidence_count,
               computed_at = EXCLUDED.computed_at`,
        [badge.userId, badge.badge, badge.awardedAt, badge.evidenceCount, computedAt],
      );
    }
    await client.query('DELETE FROM profile_engagement');
    for (const entry of engagement) {
      await client.query(
        `INSERT INTO profile_engagement (user_id, category, metrics, computed_at)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (user_id) DO UPDATE
           SET category = EXCLUDED.category, metrics = EXCLUDED.metrics,
               computed_at = EXCLUDED.computed_at`,
        [entry.userId, entry.category, JSON.stringify(entry.metrics ?? {}), computedAt],
      );
    }
    await client.query(
      `INSERT INTO ranking_runs (started_at, finished_at, entries, badges, duration_ms)
       VALUES ($1, NOW(), $2, $3, $4)`,
      [computedAt, rows.length, badges.length, Date.now() - started],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  return { entries: rows.length, badges: badges.length, computedAt };
}

// ── Leitura (só a tabela materializada) ────────────────────────────────────

const SNAPSHOT_COLUMNS = `board, period, position, tied, subject_kind, subject_id, identified,
  display_name, avatar_url, category, profile_type, place, points, metrics, computed_at`;

function projectEntry(row) {
  return {
    position: Number(row.position),
    tied: row.tied === true,
    subjectKind: row.subject_kind,
    subjectId: row.subject_id,
    identified: row.identified === true,
    displayName: row.display_name ?? null,
    avatarUrl: row.avatar_url ?? null,
    category: row.category ?? null,
    profileType: row.profile_type ?? null,
    place: row.place ?? null,
    points: Number(row.points),
    metrics: row.metrics ?? {},
  };
}

async function readBoards(pool, { period, boardIds, limit }) {
  const { rows } = await pool.query(
    `SELECT ${SNAPSHOT_COLUMNS} FROM ranking_snapshots
      WHERE period = $1 AND board = ANY($2::varchar[]) AND position <= $3
      ORDER BY board, position, subject_id`,
    [period, boardIds, limit],
  );
  const grouped = new Map(boardIds.map((id) => [id, []]));
  let computedAt = null;
  for (const row of rows) {
    grouped.get(row.board)?.push(projectEntry(row));
    if (!computedAt || row.computed_at > computedAt) computedAt = row.computed_at;
  }
  return { grouped, computedAt };
}

async function readBadges(pool, userId) {
  const [badges, engagement] = await Promise.all([
    pool.query(
      `SELECT badge, awarded_at, evidence_count, computed_at FROM profile_badges
        WHERE user_id = $1 ORDER BY awarded_at`,
      [userId],
    ),
    pool.query('SELECT category, metrics, computed_at FROM profile_engagement WHERE user_id = $1', [userId]),
  ]);
  return {
    badges: badges.rows.map((row) => ({
      id: row.badge,
      awardedAt: row.awarded_at,
      evidenceCount: Number(row.evidence_count) || 0,
    })),
    category: engagement.rows[0]?.category ?? null,
    metrics: engagement.rows[0]?.metrics ?? {},
    computedAt: engagement.rows[0]?.computed_at ?? badges.rows[0]?.computed_at ?? null,
  };
}

async function readConsent(pool, userId) {
  const { rows } = await pool.query(
    'SELECT consent, updated_at FROM ranking_consents WHERE user_id = $1', [userId],
  );
  return { consent: rows[0]?.consent === true, updatedAt: rows[0]?.updated_at ?? null };
}

async function writeConsent(pool, userId, consent) {
  const { rows } = await pool.query(
    `INSERT INTO ranking_consents (user_id, consent) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET consent = EXCLUDED.consent
     RETURNING consent, updated_at`,
    [userId, consent === true],
  );
  return { consent: rows[0]?.consent === true, updatedAt: rows[0]?.updated_at ?? null };
}

/**
 * Registro do compartilhamento. Append-only, um por conteúdo × conta × dia: o
 * segundo do mesmo dia não vira registro novo (nada de inflar contagem).
 */
async function recordShare(pool, { targetKind, targetId, channel, user }) {
  const isPost = targetKind === 'post';
  const { rows } = await pool.query(
    `INSERT INTO content_shares
       (target_kind, post_id, demand_id, user_id, user_name, user_avatar, user_role,
        profile_type, channel)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (target_id, user_id, shared_on) DO NOTHING
     RETURNING id`,
    [targetKind, isPost ? targetId : null, isPost ? null : targetId, user.userId,
      user.name ?? null, user.avatarUrl ?? null, user.role ?? null, user.profileType ?? null,
      channel],
  );
  const counted = rows.length > 0;
  const total = await pool.query(
    isPost
      ? 'SELECT shares_count FROM posts WHERE id = $1'
      : 'SELECT shares_count FROM demands WHERE id = $1',
    [targetId],
  );
  return { counted, sharesCount: Number(total.rows[0]?.shares_count) || 0 };
}

module.exports = {
  refresh,
  readBoards,
  readBadges,
  readConsent,
  writeConsent,
  recordShare,
  loadActors,
  buildBoards,
  loadBadges,
  placeKey,
  placeLabel,
  BADGES,
  ACTORS_SQL,
  GOVERNMENT_SQL,
};
