-- Migração 009: Documento Oficial da Demanda — Dossiê da Demanda (T10).
--
-- Fonte: dm-docs/fonte-da-verdade/02-fluxo-cadastro-agente-de-transformacao.html,
-- slides 18–19 ("Geração automática do dossiê" e "O que o dossiê reúne") e 20
-- (envio → análise → dossiê → publicação).
--
-- O post-service gera um PDF por versão (src/dossier/): no envio para análise,
-- em cada reenvio e na publicação. A publicação gera duas variantes com o mesmo
-- número de versão: `integral` (autor, gestão) e `publica` (baixada por qualquer
-- pessoa, sem endereço completo, CEP, coordenadas, responsáveis do cronograma
-- nem descrição/links de documentos).
--
-- - A linha nasce `pendente` com a demanda congelada em `snapshot` (ou
--   `indisponivel` quando o ambiente não tem bucket). A geração roda fora do
--   caminho do envio e com retentativa; ao gerar, grava `content` (o que o PDF
--   mostra), `content_sha256` (SHA-256 do JSON canônico de `content`, impresso
--   no PDF e usado na verificação pública), `file_sha256` (bytes do PDF), o
--   upload (`uploads`, finalidade `demand_dossier`) e a chave S3
--   `demands/<id>/dossie/v<n>.pdf` (`v<n>-publica.pdf` na variante pública).
-- - Dossiê `gerado` é imutável; nenhum dossiê é excluído (trigger). A gestão só
--   lê (grant SELECT no dm-infra, db/migrations/gestao/).
-- - Cada versão integral gerada entra na linha do tempo como `dossie_gerado`
--   (pública quando é a versão da publicação). demand_events.event_type é texto
--   (^[a-z_]+$), sem enum a estender.
--
-- Idempotente: pode rodar de novo (o deploy reaplica o manifesto inteiro).

-- Arquivo gerado pelo servidor também fica em `uploads` (a gestão já assina a
-- leitura de `object_key` por ali). Não há URL de envio para esta finalidade.
ALTER TABLE uploads DROP CONSTRAINT IF EXISTS uploads_purpose_check;
-- NOT VALID: o deploy reaplica o manifesto inteiro e migrações posteriores
-- acrescentam finalidades (024, 027, 029, 035…); validar aqui recusaria as
-- linhas delas. A regra vale para toda linha nova ou alterada.
ALTER TABLE uploads ADD CONSTRAINT uploads_purpose_check CHECK (purpose IN (
  'demand_photo', 'demand_evidence_photo', 'demand_evidence_video', 'demand_document', 'demand_dossier')) NOT VALID;

-- Número do dossiê (DMC-<ano>-<sequência>): um por demanda, repetido nas versões.
CREATE SEQUENCE IF NOT EXISTS demand_dossier_number_seq;

CREATE TABLE IF NOT EXISTS demand_dossiers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_id       UUID NOT NULL REFERENCES demands(id) ON DELETE RESTRICT,
  dossier_number  VARCHAR(30) NOT NULL CHECK (dossier_number ~ '^DMC-[0-9]{4}-[0-9]{6,}$'),
  version         INTEGER NOT NULL CHECK (version > 0),
  variant         VARCHAR(10) NOT NULL CHECK (variant IN ('integral', 'publica')),
  -- Gatilho: envio para análise, reenvio depois de devolução, publicação.
  trigger_kind    VARCHAR(20) NOT NULL CHECK (trigger_kind IN ('envio', 'reenvio', 'publicacao')),
  -- Evento de origem (`envio:<submitted_at>` ou `publicacao`): impede versão
  -- repetida para o mesmo envio.
  origin_key      VARCHAR(80) NOT NULL,
  snapshot        JSONB NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'pendente'
                    CHECK (status IN ('pendente', 'gerado', 'falhou', 'indisponivel')),
  status_reason   TEXT,
  attempts        INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_attempt_at TIMESTAMPTZ,
  content         JSONB,
  content_sha256  CHAR(64) CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  file_sha256     CHAR(64) CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes      BIGINT CHECK (size_bytes > 0),
  upload_id       UUID REFERENCES uploads(id),
  object_key      VARCHAR(500) UNIQUE,
  generated_at    TIMESTAMPTZ,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT demand_dossiers_version UNIQUE (demand_id, version, variant),
  CONSTRAINT demand_dossiers_origin UNIQUE (demand_id, origin_key, variant),
  CONSTRAINT demand_dossiers_public_variant CHECK (variant = 'integral' OR trigger_kind = 'publicacao'),
  CONSTRAINT demand_dossiers_generated_complete CHECK (
    (status = 'gerado') = (content IS NOT NULL AND content_sha256 IS NOT NULL AND file_sha256 IS NOT NULL
      AND size_bytes IS NOT NULL AND upload_id IS NOT NULL AND object_key IS NOT NULL AND generated_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_demand_dossiers_demand ON demand_dossiers(demand_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_demand_dossiers_content_hash ON demand_dossiers(content_sha256) WHERE content_sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_demand_dossiers_file_hash ON demand_dossiers(file_sha256) WHERE file_sha256 IS NOT NULL;
-- Fila da geração (pendentes e falhas a repetir).
CREATE INDEX IF NOT EXISTS idx_demand_dossiers_queue
  ON demand_dossiers(requested_at) WHERE status IN ('pendente', 'falhou', 'indisponivel');

-- Registro imutável: identidade, versão e snapshot nunca mudam; o dossiê
-- gerado não muda; nada é excluído; a gestão não escreve.
CREATE OR REPLACE FUNCTION demand_dossiers_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF session_user = 'gestao_app' THEN
    RAISE EXCEPTION 'a gestão só lê os dossiês' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'dossiês não são excluídos' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('pendente', 'indisponivel') THEN
      RAISE EXCEPTION 'dossiê nasce pendente (ou indisponível sem bucket)' USING ERRCODE = 'check_violation';
    END IF;
    NEW.requested_at := NOW();
    RETURN NEW;
  END IF;
  IF OLD.status = 'gerado' THEN
    RAISE EXCEPTION 'dossiê gerado é imutável (versão %)', OLD.version USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (NEW.id, NEW.demand_id, NEW.dossier_number, NEW.version, NEW.variant, NEW.trigger_kind,
      NEW.origin_key, NEW.snapshot, NEW.requested_at)
     IS DISTINCT FROM
     (OLD.id, OLD.demand_id, OLD.dossier_number, OLD.version, OLD.variant, OLD.trigger_kind,
      OLD.origin_key, OLD.snapshot, OLD.requested_at) THEN
    RAISE EXCEPTION 'identidade, versão e conteúdo congelado do dossiê não mudam' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION demand_dossiers_no_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'dossiês não são excluídos' USING ERRCODE = 'insufficient_privilege';
END
$$;

DROP TRIGGER IF EXISTS demand_dossiers_guard ON demand_dossiers;
CREATE TRIGGER demand_dossiers_guard
  BEFORE INSERT OR UPDATE OR DELETE ON demand_dossiers
  FOR EACH ROW EXECUTE FUNCTION demand_dossiers_guard();

DROP TRIGGER IF EXISTS demand_dossiers_block_truncate ON demand_dossiers;
CREATE TRIGGER demand_dossiers_block_truncate
  BEFORE TRUNCATE ON demand_dossiers
  FOR EACH STATEMENT EXECUTE FUNCTION demand_dossiers_no_truncate();
