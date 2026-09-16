-- Campos extras para fluxos completos de apoio
ALTER TABLE supports ADD COLUMN IF NOT EXISTS amount DECIMAL(10,2);
ALTER TABLE supports ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20);
ALTER TABLE supports ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}';
ALTER TABLE supports ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'confirmed';
