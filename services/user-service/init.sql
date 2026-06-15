CREATE TABLE IF NOT EXISTS profiles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID UNIQUE NOT NULL,
  name       VARCHAR(255) NOT NULL,
  bio        TEXT,
  avatar_url VARCHAR(500),
  phone      VARCHAR(50),
  website    VARCHAR(500),
  city       VARCHAR(100),
  state      VARCHAR(100),
  role       VARCHAR(50) NOT NULL DEFAULT 'citizen',
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
