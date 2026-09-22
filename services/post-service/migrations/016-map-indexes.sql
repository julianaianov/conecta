-- Mapa inteligente (T20): índices dos recortes do mapa público.
--
-- O mapa consulta sempre por status público + coordenada (pontos e
-- agrupamento por célula) ou por status público + lugar (agregação por
-- território e página pública `/mapa/<territorio>`). Sem estes índices, cada
-- movimento do mapa viraria varredura da tabela `demands`.
--
-- Idempotente: reaplicado a cada deploy pelo manifesto
-- (services/migrations.manifest).

-- Pontos e bbox: o filtro de status vem primeiro porque é sempre usado.
CREATE INDEX IF NOT EXISTS idx_demands_map_points
  ON demands(status, latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Agregação por território/município/UF (e o recorte da página por território).
CREATE INDEX IF NOT EXISTS idx_demands_map_place
  ON demands(status, uf, municipality, territory)
  WHERE published_at IS NOT NULL;

-- Camada de conteúdos do feed (slide 18): o mapa lê só publicação visível com
-- coordenada.
CREATE INDEX IF NOT EXISTS idx_posts_map_points
  ON posts(latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
