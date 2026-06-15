DO $$ BEGIN
  CREATE TYPE post_type AS ENUM ('problem','project','need','event','action');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE post_status AS ENUM ('active','in_progress','resolved','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS posts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id       UUID NOT NULL,
  author_name     VARCHAR(255),
  author_avatar   VARCHAR(500),
  type            post_type   NOT NULL,
  title           VARCHAR(500) NOT NULL,
  description     TEXT NOT NULL,
  status          post_status  DEFAULT 'active',
  latitude        DECIMAL(10,8),
  longitude       DECIMAL(11,8),
  neighborhood    VARCHAR(255),
  city            VARCHAR(100),
  images          TEXT[]  DEFAULT '{}',
  tags            TEXT[]  DEFAULT '{}',
  reactions_count INT     DEFAULT 0,
  comments_count  INT     DEFAULT 0,
  views_count     INT     DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reactions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID REFERENCES posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID REFERENCES posts(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL,
  author_name VARCHAR(255),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_posts_author    ON posts(author_id);
CREATE INDEX IF NOT EXISTS idx_posts_type      ON posts(type);
CREATE INDEX IF NOT EXISTS idx_posts_status    ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_location  ON posts(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_reactions_post  ON reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_post   ON comments(post_id);

DO $$ BEGIN
  CREATE TYPE support_type AS ENUM (
    'financial','materials','labor','volunteering',
    'equipment','space','food','transport','knowledge','sharing'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS supports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id         UUID REFERENCES posts(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL,
  user_name       VARCHAR(255),
  type            support_type NOT NULL,
  message         TEXT,
  amount          DECIMAL(10,2),
  payment_method  VARCHAR(20),
  details         JSONB DEFAULT '{}',
  status          VARCHAR(20) DEFAULT 'confirmed',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(post_id, user_id, type)
);

CREATE INDEX IF NOT EXISTS idx_supports_post ON supports(post_id);
CREATE INDEX IF NOT EXISTS idx_supports_user ON supports(user_id);
