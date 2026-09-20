CREATE TABLE IF NOT EXISTS connections (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type         VARCHAR(50) NOT NULL,
  status       VARCHAR(50) NOT NULL DEFAULT 'pending',
  from_user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  to_user_id   UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  message      TEXT NOT NULL,
  post_id      UUID,
  post_title   VARCHAR(255),
  outcome      TEXT,
  events       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_connections_from_user_id ON connections(from_user_id);
CREATE INDEX IF NOT EXISTS idx_connections_to_user_id ON connections(to_user_id);
CREATE INDEX IF NOT EXISTS idx_connections_status ON connections(status);

CREATE TABLE IF NOT EXISTS scraps (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id      UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  content        TEXT NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scraps_target ON scraps(target_user_id);

CREATE TABLE IF NOT EXISTS testimonials (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id      UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  content        TEXT NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_testimonials_target ON testimonials(target_user_id);
