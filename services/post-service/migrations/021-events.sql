-- Migração 021: eventos do território e inscrição da comunidade (T25).
--
-- Fonte: dm-docs/docs/fonte-da-verdade/01-apresentacao-institucional.html,
-- slide 9 (Membros da Comunidade: "Inscrever-se em eventos", "Oferecer
-- voluntariado"), slide 18 (conteúdos do território: Eventos, Oficinas
-- culturais, Mutirões, Ações ambientais, Aulas esportivas), slide 19 (o mapa
-- mostra demandas e conteúdos) e slide 20 ("Financiar eventos" como forma de
-- apoio). Decisão 5 (dm-docs/docs/fonte-da-verdade/decisoes-de-implementacao.md):
-- a plataforma **não processa pagamento** — evento pago declara o valor, e a
-- cobrança acontece fora da plataforma.
-- Contrato com o dm-gestao: dm-docs/docs/gestao/04-modelagem-de-dados.md §3.17.
--
-- - `events`: evento publicado por Agente de Transformação ou Poder Público,
--   opcionalmente vinculado a uma demanda (`demand_id`, sempre do próprio
--   organizador). Título, descrição, início e fim, local com CEP e coordenada,
--   vagas (opcional) com fila de espera, público, gratuito/pago (valor só
--   declarado), acessibilidade e organizador.
-- - `event_signups`: inscrição de uma conta no evento. Uma inscrição em aberto
--   por conta × evento; cancelar é `canceled_at` (nada é excluído). Sem vaga, a
--   inscrição entra na fila de espera quando o organizador a habilitou, e a
--   saída de um inscrito promove o primeiro da fila. A presença é marcada pelo
--   organizador (lista de presença simples).
-- - `posts.event_id`/`posts.event_starts_at`: post-vitrine do evento (tipo
--   `event`), criado na publicação, para o evento aparecer no feed e na camada
--   de conteúdos do mapa **com data**. O conteúdo vem do evento; o post não é
--   editado nem excluído pelas rotas de posts.
-- - `demand_interests.event_id` (T15): a oferta de voluntariado ou de
--   participação pode apontar para um evento da mesma demanda.
-- - Linha do tempo da demanda: `evento_publicado`, `evento_atualizado` e
--   `evento_cancelado` em `demand_events`, públicos, com payload->'public'
--   (tipo, título, início, fim, local e vagas; nunca dados de inscritos).
-- - A gestão (`gestao_app`) só lê (grant no dm-infra,
--   db/migrations/gestao/021-gestao-app-post-events.sql).
--
-- Idempotente: pode rodar de novo (o deploy reaplica o manifesto inteiro).

-- Conteúdos do território (slide 18). `evento` é o caso geral.
DO $$ BEGIN
  CREATE TYPE event_kind AS ENUM (
    'evento', 'oficina_cultural', 'mutirao', 'acao_ambiental', 'aula_esportiva'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE event_status AS ENUM ('rascunho', 'publicado', 'cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Decisão 5: `pago` declara o valor; a plataforma não cobra nem repassa.
DO $$ BEGIN
  CREATE TYPE event_pricing AS ENUM ('gratuito', 'pago');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Recursos de acessibilidade do local (a fonte pede "acessibilidade" sem
-- listar; esta lista é a escolha da T25, como os níveis de prioridade da T06).
DO $$ BEGIN
  CREATE TYPE event_accessibility AS ENUM (
    'acesso_para_cadeirantes', 'banheiro_acessivel', 'piso_tatil',
    'interprete_de_libras', 'audiodescricao', 'acompanhante_permitido',
    'transporte_acessivel', 'espaco_para_caes_guia'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE event_signup_status AS ENUM ('inscrito', 'lista_de_espera', 'cancelado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Demanda de origem (opcional): o evento pode ser uma ação da demanda ou uma
  -- publicação própria do organizador para o território.
  demand_id             UUID REFERENCES demands(id) ON DELETE RESTRICT,
  organizer_id          UUID NOT NULL,
  organizer_name        VARCHAR(255),
  organizer_avatar      VARCHAR(500),
  organizer_category    VARCHAR(20) NOT NULL
                          CHECK (organizer_category IN ('agente', 'poder_publico')),
  organizer_profile_type VARCHAR(50),
  -- Instituição validada do organizador (user_db.organizations.id).
  organization_id       UUID,

  kind                  event_kind NOT NULL DEFAULT 'evento',
  -- Rascunho nasce incompleto: os obrigatórios são exigidos na publicação
  -- (events_assert_publishable, espelhado em src/event/validation.js).
  title                 VARCHAR(200) CHECK (title IS NULL OR btrim(title) <> ''),
  description           TEXT CHECK (description IS NULL OR (btrim(description) <> '' AND char_length(description) <= 5000)),
  starts_at             TIMESTAMPTZ,
  ends_at               TIMESTAMPTZ,

  -- Local: nome, CEP obrigatório e coordenada (como a demanda).
  location_name         VARCHAR(200) CHECK (location_name IS NULL OR btrim(location_name) <> ''),
  cep                   CHAR(9) CHECK (cep IS NULL OR cep ~ '^[0-9]{5}-[0-9]{3}$'),
  street                VARCHAR(255),
  address_number        VARCHAR(30),
  address_complement    VARCHAR(120),
  district              VARCHAR(120),
  municipality          VARCHAR(120),
  uf                    CHAR(2) CHECK (uf IS NULL OR uf ~ '^[A-Z]{2}$'),
  territory             VARCHAR(255),
  latitude              NUMERIC(10, 7) CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude             NUMERIC(10, 7) CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),

  -- Público a que o evento se destina (slide 18: conteúdo do território).
  audience              VARCHAR(255) CHECK (audience IS NULL OR btrim(audience) <> ''),
  -- Vagas: opcional. Com vagas, o organizador escolhe se há fila de espera.
  capacity              INTEGER CHECK (capacity IS NULL OR (capacity > 0 AND capacity <= 100000)),
  waitlist_enabled      BOOLEAN NOT NULL DEFAULT false,

  pricing               event_pricing NOT NULL DEFAULT 'gratuito',
  price_cents           INTEGER CHECK (price_cents IS NULL OR (price_cents > 0 AND price_cents <= 100000000)),
  price_note            TEXT CHECK (price_note IS NULL OR char_length(price_note) <= 500),

  accessibility         event_accessibility[] NOT NULL DEFAULT '{}',
  accessibility_notes   TEXT CHECK (accessibility_notes IS NULL OR char_length(accessibility_notes) <= 1000),
  photo_ref             VARCHAR(500),

  status                event_status NOT NULL DEFAULT 'rascunho',
  published_at          TIMESTAMPTZ,
  canceled_at           TIMESTAMPTZ,
  cancel_reason         TEXT CHECK (cancel_reason IS NULL OR (btrim(cancel_reason) <> '' AND char_length(cancel_reason) <= 1000)),

  signups_count         INTEGER NOT NULL DEFAULT 0 CHECK (signups_count >= 0),
  waitlist_count        INTEGER NOT NULL DEFAULT 0 CHECK (waitlist_count >= 0),
  attended_count        INTEGER NOT NULL DEFAULT 0 CHECK (attended_count >= 0),

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT events_period CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at),
  -- Fila de espera só existe quando há limite de vagas.
  CONSTRAINT events_waitlist CHECK (waitlist_enabled = false OR capacity IS NOT NULL),
  -- Decisão 5: gratuito não tem valor; pago declara o valor.
  CONSTRAINT events_pricing CHECK ((pricing = 'pago') = (price_cents IS NOT NULL)),
  CONSTRAINT events_accessibility_size CHECK (cardinality(accessibility) <= 8),
  CONSTRAINT events_published CHECK ((status = 'rascunho') = (published_at IS NULL)
                                     OR status = 'cancelado'),
  CONSTRAINT events_canceled CHECK ((status = 'cancelado') = (canceled_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_events_agenda ON events(status, starts_at DESC, id)
  WHERE status <> 'rascunho';
CREATE INDEX IF NOT EXISTS idx_events_organizer ON events(organizer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_demand ON events(demand_id, starts_at) WHERE demand_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_place ON events(status, uf, municipality, territory);
CREATE INDEX IF NOT EXISTS idx_events_points ON events(status, latitude, longitude);

CREATE TABLE IF NOT EXISTS event_signups (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  user_id           UUID NOT NULL,
  -- Retrato do perfil no momento (o post_db não conhece user_db.profiles).
  -- Só o organizador vê nome e avatar; o público vê contagens (LGPD).
  user_name         VARCHAR(255),
  user_avatar       VARCHAR(500),
  -- A fonte dá "Inscrever-se em eventos" aos Membros da Comunidade (slide 9);
  -- a coluna aceita as cinco categorias para não exigir migração se o produto
  -- abrir a inscrição, mas quem decide hoje é SIGNUP_ROLES (src/event/constants.js).
  user_category     VARCHAR(20) NOT NULL
                      CHECK (user_category IN ('comunidade', 'parceiro', 'poder_publico', 'agente', 'comunicacao')),
  profile_type      VARCHAR(50),
  status            event_signup_status NOT NULL DEFAULT 'inscrito',
  waitlist_position INTEGER CHECK (waitlist_position IS NULL OR waitlist_position > 0),
  note              TEXT CHECK (note IS NULL OR (btrim(note) <> '' AND char_length(note) <= 500)),
  attended          BOOLEAN NOT NULL DEFAULT false,
  attended_at       TIMESTAMPTZ,
  attendance_by     UUID,
  signed_up_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  canceled_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT event_signups_waitlist CHECK ((status = 'lista_de_espera') = (waitlist_position IS NOT NULL)),
  CONSTRAINT event_signups_canceled CHECK ((status = 'cancelado') = (canceled_at IS NOT NULL)),
  CONSTRAINT event_signups_attendance CHECK (attended = (attended_at IS NOT NULL)
                                             AND (attended = false OR status = 'inscrito'))
);

-- Uma inscrição em aberto por conta × evento; depois de cancelada, pode haver outra.
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_signups_open
  ON event_signups(event_id, user_id) WHERE canceled_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_event_signups_event
  ON event_signups(event_id, status, signed_up_at);
CREATE INDEX IF NOT EXISTS idx_event_signups_user
  ON event_signups(user_id, created_at DESC);

-- Vitrine no feed e na camada de conteúdos do mapa: um post por evento
-- publicado, com a data para o mapa (T20, slide 19).
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES events(id) ON DELETE RESTRICT;
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS event_starts_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_event ON posts(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_event_starts ON posts(event_starts_at) WHERE event_starts_at IS NOT NULL;

-- Voluntariado e participação (T15) podem apontar para um evento da demanda.
ALTER TABLE demand_interests
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES events(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_demand_interests_event
  ON demand_interests(event_id) WHERE event_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Transições do evento (espelho em src/event/state-machine.js).
CREATE OR REPLACE FUNCTION event_status_transition_allowed(
  from_status event_status, to_status event_status
) RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN from_status = to_status THEN true
    WHEN from_status = 'rascunho' THEN to_status IN ('publicado', 'cancelado')
    WHEN from_status = 'publicado' THEN to_status = 'cancelado'
    ELSE false
  END
$$;

-- O que a publicação exige (espelho de REQUIRED_ON_PUBLICATION em
-- src/event/validation.js): título, descrição, período, local com CEP e
-- coordenada, público e forma de cobrança.
CREATE OR REPLACE FUNCTION events_assert_publishable(e events) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  IF num_nulls(e.title, e.description, e.starts_at, e.ends_at, e.location_name, e.cep,
               e.municipality, e.uf, e.latitude, e.longitude, e.audience) > 0 THEN
    RAISE EXCEPTION 'evento incompleto para publicação (título, descrição, período, local com CEP e coordenada, município/UF e público)'
      USING ERRCODE = 'check_violation';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION events_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  counters_only BOOLEAN;
BEGIN
  IF session_user = 'gestao_app' THEN
    RAISE EXCEPTION 'a gestão só lê os eventos' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'eventos não são excluídos (cancele o evento)' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'rascunho' OR NEW.published_at IS NOT NULL OR NEW.canceled_at IS NOT NULL THEN
      RAISE EXCEPTION 'evento nasce em rascunho' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.signups_count <> 0 OR NEW.waitlist_count <> 0 OR NEW.attended_count <> 0 THEN
      RAISE EXCEPTION 'evento nasce sem inscrições' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.demand_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM demands d WHERE d.id = NEW.demand_id AND d.author_id = NEW.organizer_id) THEN
      RAISE EXCEPTION 'o evento só se vincula a uma demanda do próprio organizador' USING ERRCODE = 'check_violation';
    END IF;
    NEW.created_at := NOW();
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  -- Atualização só de contadores (vem do trigger das inscrições).
  counters_only := (NEW.signups_count, NEW.waitlist_count, NEW.attended_count)
                   IS DISTINCT FROM (OLD.signups_count, OLD.waitlist_count, OLD.attended_count)
                   AND (NEW.id, NEW.demand_id, NEW.organizer_id, NEW.kind, NEW.title, NEW.description,
                        NEW.starts_at, NEW.ends_at, NEW.capacity, NEW.status)
                       IS NOT DISTINCT FROM
                       (OLD.id, OLD.demand_id, OLD.organizer_id, OLD.kind, OLD.title, OLD.description,
                        OLD.starts_at, OLD.ends_at, OLD.capacity, OLD.status);

  IF (NEW.id, NEW.demand_id, NEW.organizer_id, NEW.organizer_category, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.demand_id, OLD.organizer_id, OLD.organizer_category, OLD.created_at) THEN
    RAISE EXCEPTION 'o evento, a demanda de origem e o organizador não mudam' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT event_status_transition_allowed(OLD.status, NEW.status) THEN
    RAISE EXCEPTION 'transição não permitida: % → %', OLD.status, NEW.status USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'cancelado' AND NOT counters_only THEN
    RAISE EXCEPTION 'evento cancelado não é editado' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'publicado' AND OLD.status = 'rascunho' THEN
    PERFORM events_assert_publishable(NEW);
    NEW.published_at := NOW();
  ELSE
    NEW.published_at := OLD.published_at;
  END IF;

  IF NEW.status = 'cancelado' AND OLD.status <> 'cancelado' THEN
    IF NEW.cancel_reason IS NULL THEN
      RAISE EXCEPTION 'cancelar um evento exige o motivo' USING ERRCODE = 'check_violation';
    END IF;
    NEW.canceled_at := NOW();
  ELSE
    NEW.canceled_at := OLD.canceled_at;
    IF NEW.cancel_reason IS DISTINCT FROM OLD.cancel_reason AND OLD.status <> 'rascunho' THEN
      RAISE EXCEPTION 'o motivo do cancelamento não muda' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.status = 'publicado' AND NOT counters_only THEN
    PERFORM events_assert_publishable(NEW);
  END IF;

  -- Vagas nunca ficam abaixo de quem já está inscrito.
  IF NEW.capacity IS NOT NULL AND NEW.capacity < NEW.signups_count THEN
    RAISE EXCEPTION 'já há % inscritos: as vagas não podem ser menos que isso', NEW.signups_count
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION events_no_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% não é apagada', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END
$$;

-- Post-vitrine e linha do tempo da demanda. SECURITY DEFINER pelo mesmo motivo
-- de demands_record_event: quem escreve em `posts` e `demand_events` é a
-- consequência do evento, não a sessão que o gravou.
CREATE OR REPLACE FUNCTION events_sync_showcase() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  public_part JSONB;
  kind_name   TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'rascunho' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'INSERT' THEN
    RETURN NULL; -- rascunho não tem vitrine
  END IF;

  public_part := jsonb_build_object(
    'eventId', NEW.id, 'eventKind', NEW.kind, 'title', NEW.title,
    'startsAt', NEW.starts_at, 'endsAt', NEW.ends_at,
    'locationName', NEW.location_name, 'territory', NEW.territory,
    'municipality', NEW.municipality, 'uf', NEW.uf,
    'capacity', NEW.capacity, 'pricing', NEW.pricing);

  PERFORM set_config('dm.event_sync', '1', true);

  IF NEW.status = 'publicado' AND OLD.status = 'rascunho' THEN
    INSERT INTO posts (author_id, author_name, author_avatar, type, title, description, status,
                       latitude, longitude, neighborhood, city, state, zipcode, images,
                       event_id, event_starts_at)
    VALUES (NEW.organizer_id, NEW.organizer_name, NEW.organizer_avatar, 'event'::post_type,
            NEW.title, NEW.description, 'active',
            NEW.latitude, NEW.longitude, coalesce(NEW.territory, NEW.district), NEW.municipality,
            NEW.uf, NEW.cep,
            CASE WHEN NEW.photo_ref IS NULL THEN '{}'::text[] ELSE ARRAY[NEW.photo_ref] END,
            NEW.id, NEW.starts_at)
    ON CONFLICT (event_id) WHERE event_id IS NOT NULL DO NOTHING;
    kind_name := 'evento_publicado';
  ELSIF NEW.status = 'cancelado' AND OLD.status <> 'cancelado' THEN
    UPDATE posts
       SET visibility = 'hidden', moderation_reason = NEW.cancel_reason,
           moderated_at = NOW(), moderated_by = NEW.organizer_id::text
     WHERE event_id = NEW.id;
    kind_name := 'evento_cancelado';
  ELSIF NEW.status = 'publicado' THEN
    UPDATE posts
       SET title = NEW.title, description = NEW.description, latitude = NEW.latitude,
           longitude = NEW.longitude, neighborhood = coalesce(NEW.territory, NEW.district),
           city = NEW.municipality, state = NEW.uf, zipcode = NEW.cep,
           images = CASE WHEN NEW.photo_ref IS NULL THEN '{}'::text[] ELSE ARRAY[NEW.photo_ref] END,
           event_starts_at = NEW.starts_at, updated_at = NOW()
     WHERE event_id = NEW.id;
    kind_name := CASE
      WHEN (NEW.title, NEW.description, NEW.starts_at, NEW.ends_at, NEW.location_name, NEW.capacity)
           IS DISTINCT FROM
           (OLD.title, OLD.description, OLD.starts_at, OLD.ends_at, OLD.location_name, OLD.capacity)
      THEN 'evento_atualizado' END;
  END IF;

  PERFORM set_config('dm.event_sync', '', true);

  IF kind_name IS NOT NULL AND NEW.demand_id IS NOT NULL THEN
    INSERT INTO demand_events (demand_id, event_type, actor_type, actor, payload, is_public, created_at)
    VALUES (NEW.demand_id, kind_name,
            CASE NEW.organizer_category WHEN 'poder_publico' THEN 'poder_publico' ELSE 'agente' END,
            NEW.organizer_id::text,
            jsonb_build_object('event_id', NEW.id, 'public', public_part),
            true, clock_timestamp());
  END IF;
  RETURN NULL;
END
$$;

REVOKE ALL ON FUNCTION events_sync_showcase() FROM PUBLIC;

-- O post-vitrine do evento espelha o evento: nem as rotas de posts nem a
-- gestão editam o conteúdo, e ele não é excluído (a moderação continua
-- alternando `visibility`).
CREATE OR REPLACE FUNCTION posts_event_showcase_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.event_id IS NOT NULL THEN
      RAISE EXCEPTION 'post-vitrine de evento não é excluído: cancele o evento' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.event_id IS NULL AND NEW.event_id IS NOT NULL
     AND coalesce(current_setting('dm.event_sync', true), '') <> '1' THEN
    RAISE EXCEPTION 'post existente não vira vitrine de evento' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.event_id IS NOT NULL AND coalesce(current_setting('dm.event_sync', true), '') <> '1' AND (
      NEW.event_id, NEW.event_starts_at, NEW.author_id, NEW.type, NEW.title, NEW.description,
      NEW.latitude, NEW.longitude, NEW.neighborhood, NEW.city, NEW.state, NEW.zipcode,
      NEW.images, NEW.videos
    ) IS DISTINCT FROM (
      OLD.event_id, OLD.event_starts_at, OLD.author_id, OLD.type, OLD.title, OLD.description,
      OLD.latitude, OLD.longitude, OLD.neighborhood, OLD.city, OLD.state, OLD.zipcode,
      OLD.images, OLD.videos
    ) THEN
    RAISE EXCEPTION 'post-vitrine de evento: o conteúdo vem do evento' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.event_id IS NOT NULL AND NEW.visibility = 'visible' AND OLD.visibility <> 'visible'
     AND EXISTS (SELECT 1 FROM events WHERE id = OLD.event_id AND status = 'cancelado') THEN
    RAISE EXCEPTION 'evento cancelado: o post-vitrine fica oculto' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

-- ---------------------------------------------------------------------------
-- Inscrições.
CREATE OR REPLACE FUNCTION event_signups_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  ev        events%ROWTYPE;
  taken     INTEGER;
  promoting BOOLEAN := coalesce(current_setting('dm.event_promote', true), '') = '1';
BEGIN
  IF session_user = 'gestao_app' THEN
    RAISE EXCEPTION 'a gestão só lê as inscrições' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'inscrições não são excluídas (cancele a inscrição)' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO ev FROM events
   WHERE id = CASE WHEN TG_OP = 'INSERT' THEN NEW.event_id ELSE OLD.event_id END FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'evento inexistente' USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF ev.status <> 'publicado' THEN
      RAISE EXCEPTION 'inscrição só em evento publicado (estado: %)', ev.status USING ERRCODE = 'check_violation';
    END IF;
    IF ev.ends_at <= NOW() THEN
      RAISE EXCEPTION 'o evento já terminou' USING ERRCODE = 'check_violation';
    END IF;
    IF ev.organizer_id = NEW.user_id THEN
      RAISE EXCEPTION 'o organizador não se inscreve no próprio evento' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.canceled_at IS NOT NULL OR NEW.attended THEN
      RAISE EXCEPTION 'inscrição nasce em aberto e sem presença' USING ERRCODE = 'check_violation';
    END IF;
    -- Vaga ou fila de espera.
    IF ev.capacity IS NULL OR ev.signups_count < ev.capacity THEN
      NEW.status := 'inscrito';
      NEW.waitlist_position := NULL;
    ELSIF ev.waitlist_enabled THEN
      SELECT coalesce(max(waitlist_position), 0) + 1 INTO taken
        FROM event_signups WHERE event_id = NEW.event_id AND status = 'lista_de_espera';
      NEW.status := 'lista_de_espera';
      NEW.waitlist_position := taken;
    ELSE
      RAISE EXCEPTION 'não há vagas neste evento' USING ERRCODE = 'check_violation';
    END IF;
    NEW.signed_up_at := NOW();
    NEW.created_at := NOW();
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  IF (NEW.id, NEW.event_id, NEW.user_id, NEW.user_category, NEW.profile_type, NEW.note, NEW.created_at,
      NEW.signed_up_at)
     IS DISTINCT FROM
     (OLD.id, OLD.event_id, OLD.user_id, OLD.user_category, OLD.profile_type, OLD.note, OLD.created_at,
      OLD.signed_up_at) THEN
    RAISE EXCEPTION 'quem se inscreveu, o evento e a observação não mudam' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'cancelado' THEN
    RAISE EXCEPTION 'inscrição cancelada não muda' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = 'cancelado' AND OLD.status <> 'cancelado' THEN
    NEW.canceled_at := NOW();
    NEW.waitlist_position := NULL;
    NEW.attended := false;
    NEW.attended_at := NULL;
  ELSIF NEW.status = 'inscrito' AND OLD.status = 'lista_de_espera' THEN
    IF NOT promoting THEN
      RAISE EXCEPTION 'a fila de espera avança sozinha quando abre vaga' USING ERRCODE = 'check_violation';
    END IF;
    NEW.waitlist_position := NULL;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'transição de inscrição não permitida: % → %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.attended IS DISTINCT FROM OLD.attended THEN
    IF NEW.status <> 'inscrito' THEN
      RAISE EXCEPTION 'presença só para quem está inscrito' USING ERRCODE = 'check_violation';
    END IF;
    IF ev.starts_at > NOW() THEN
      RAISE EXCEPTION 'a lista de presença abre no início do evento' USING ERRCODE = 'check_violation';
    END IF;
    NEW.attended_at := CASE WHEN NEW.attended THEN NOW() END;
  ELSE
    NEW.attended_at := OLD.attended_at;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END
$$;

-- Contadores do evento e avanço da fila de espera.
CREATE OR REPLACE FUNCTION event_signups_after() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  target UUID := NEW.event_id;
  next_id UUID;
  has_room BOOLEAN;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'cancelado' AND OLD.status = 'inscrito' THEN
    SELECT (capacity IS NULL OR (SELECT count(*) FROM event_signups
                                  WHERE event_id = target AND status = 'inscrito') < capacity)
      INTO has_room FROM events WHERE id = target;
    IF has_room THEN
      SELECT id INTO next_id FROM event_signups
        WHERE event_id = target AND status = 'lista_de_espera'
        ORDER BY waitlist_position, signed_up_at, id LIMIT 1;
      IF next_id IS NOT NULL THEN
        PERFORM set_config('dm.event_promote', '1', true);
        UPDATE event_signups SET status = 'inscrito' WHERE id = next_id;
        PERFORM set_config('dm.event_promote', '', true);
        -- Renumera a fila que sobrou.
        UPDATE event_signups s
           SET waitlist_position = ord.n
          FROM (SELECT id, row_number() OVER (ORDER BY waitlist_position, signed_up_at, id) AS n
                  FROM event_signups WHERE event_id = target AND status = 'lista_de_espera') ord
         WHERE s.id = ord.id AND s.waitlist_position IS DISTINCT FROM ord.n;
      END IF;
    END IF;
  END IF;

  UPDATE events e SET
    signups_count  = counts.inscritos,
    waitlist_count = counts.espera,
    attended_count = counts.presentes
  FROM (SELECT count(*) FILTER (WHERE status = 'inscrito')::int AS inscritos,
               count(*) FILTER (WHERE status = 'lista_de_espera')::int AS espera,
               count(*) FILTER (WHERE attended)::int AS presentes
          FROM event_signups WHERE event_id = target) counts
  WHERE e.id = target
    AND (e.signups_count, e.waitlist_count, e.attended_count)
        IS DISTINCT FROM (counts.inscritos, counts.espera, counts.presentes);
  RETURN NULL;
END
$$;

REVOKE ALL ON FUNCTION event_signups_after() FROM PUBLIC;

-- O voluntariado/participação (T15) só aponta para evento da mesma demanda.
CREATE OR REPLACE FUNCTION demand_interests_event_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.event_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.event_id IS DISTINCT FROM OLD.event_id THEN
    RAISE EXCEPTION 'o evento da manifestação não muda' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.kind NOT IN ('voluntariado', 'participacao') THEN
      RAISE EXCEPTION 'só voluntariado e participação se vinculam a um evento' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM events e
                    WHERE e.id = NEW.event_id AND e.demand_id = NEW.demand_id AND e.status = 'publicado') THEN
      RAISE EXCEPTION 'o evento não é um evento publicado desta demanda' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS events_guard ON events;
CREATE TRIGGER events_guard
  BEFORE INSERT OR UPDATE OR DELETE ON events
  FOR EACH ROW EXECUTE FUNCTION events_guard();

DROP TRIGGER IF EXISTS events_block_truncate ON events;
CREATE TRIGGER events_block_truncate
  BEFORE TRUNCATE ON events
  FOR EACH STATEMENT EXECUTE FUNCTION events_no_truncate();

DROP TRIGGER IF EXISTS events_sync_showcase ON events;
CREATE TRIGGER events_sync_showcase
  AFTER INSERT OR UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION events_sync_showcase();

DROP TRIGGER IF EXISTS posts_event_showcase_guard ON posts;
CREATE TRIGGER posts_event_showcase_guard
  BEFORE UPDATE OR DELETE ON posts
  FOR EACH ROW EXECUTE FUNCTION posts_event_showcase_guard();

DROP TRIGGER IF EXISTS event_signups_guard ON event_signups;
CREATE TRIGGER event_signups_guard
  BEFORE INSERT OR UPDATE OR DELETE ON event_signups
  FOR EACH ROW EXECUTE FUNCTION event_signups_guard();

DROP TRIGGER IF EXISTS event_signups_block_truncate ON event_signups;
CREATE TRIGGER event_signups_block_truncate
  BEFORE TRUNCATE ON event_signups
  FOR EACH STATEMENT EXECUTE FUNCTION events_no_truncate();

DROP TRIGGER IF EXISTS event_signups_after ON event_signups;
CREATE TRIGGER event_signups_after
  AFTER INSERT OR UPDATE ON event_signups
  FOR EACH ROW EXECUTE FUNCTION event_signups_after();

DROP TRIGGER IF EXISTS demand_interests_event_guard ON demand_interests;
CREATE TRIGGER demand_interests_event_guard
  BEFORE INSERT OR UPDATE ON demand_interests
  FOR EACH ROW EXECUTE FUNCTION demand_interests_event_guard();
