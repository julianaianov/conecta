-- role: uma das 5 categorias (agent, member, partner, government, media).
-- profile_type: o subperfil dentro da categoria (ver ROLE_PROFILES em auth.js).
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(255) NOT NULL,
  avatar_url    VARCHAR(500),
  role          VARCHAR(50)  NOT NULL DEFAULT 'member',
  profile_type  VARCHAR(50),
  created_at    TIMESTAMPTZ  DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
