-- ═══════════════════════════════════════════════════════════════════════════════
-- SEED RECREIO: GESTAO_DB (Painel Administrativo DM Conecta - Laravel)
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO admins (
  id, name, email, password, role, phone, avatar_url, is_active, created_at, updated_at
) VALUES
  (1, 'Ricardo R. Sierra (Rico)', 'sierra.csi@gmail.com',
   '$2a$10$aKbVDzO8dThVH2JsFA2bPetATdnfIKIMKBJXe3BDzUsFL6LhjIPFm', 'superadmin',
   '(11) 98765-0001', '/images/stock/avatar-lider.jpg', true, NOW(), NOW()),

  (2, 'Pâmela (Pam)', 'pamela@dmconecta.org',
   '$2a$10$aKbVDzO8dThVH2JsFA2bPetATdnfIKIMKBJXe3BDzUsFL6LhjIPFm', 'admin',
   '(11) 98765-0002', '/images/stock/avatar-moradora.jpg', true, NOW(), NOW()),

  (3, 'Juliana Ianov (Ju)', 'julianaianov@gmail.com',
   '$2a$10$aKbVDzO8dThVH2JsFA2bPetATdnfIKIMKBJXe3BDzUsFL6LhjIPFm', 'admin',
   '(11) 98765-0003', '/images/stock/avatar-lider.jpg', true, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  password = EXCLUDED.password,
  role = EXCLUDED.role,
  phone = EXCLUDED.phone,
  avatar_url = EXCLUDED.avatar_url,
  is_active = true,
  updated_at = NOW();

SELECT setval(pg_get_serial_sequence('admins', 'id'), coalesce(max(id), 1)) FROM admins;
