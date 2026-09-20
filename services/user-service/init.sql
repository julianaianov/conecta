CREATE TABLE IF NOT EXISTS profiles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID UNIQUE NOT NULL,
  name       VARCHAR(255) NOT NULL,
  bio        TEXT,
  avatar_url VARCHAR(500),
  cover_url  VARCHAR(500),
  status     VARCHAR(255),
  neighborhood VARCHAR(255),
  member_since TIMESTAMPTZ,
  friend_count INT NOT NULL DEFAULT 0,
  phone      VARCHAR(50),
  website    VARCHAR(500),
  city       VARCHAR(100),
  state      VARCHAR(100),
  role       VARCHAR(50) NOT NULL DEFAULT 'member',
  profile_type VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS organizations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID REFERENCES profiles(id) ON DELETE CASCADE,
  org_name    VARCHAR(255) NOT NULL,
  category    VARCHAR(100),
  description TEXT,
  address     TEXT,
  latitude    DECIMAL(10,8),
  longitude   DECIMAL(11,8),
  verified    BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);

CREATE TABLE IF NOT EXISTS communities (
  id           VARCHAR(50) PRIMARY KEY,
  name         VARCHAR(255) NOT NULL,
  description  TEXT NOT NULL,
  category     VARCHAR(100) NOT NULL,
  member_count INT NOT NULL DEFAULT 0,
  image_url    VARCHAR(500),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_communities_category ON communities(category);

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

