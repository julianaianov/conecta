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
