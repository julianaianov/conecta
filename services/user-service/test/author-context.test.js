const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PROFILE_TYPE_LABELS, authorContext } = require('../src/author-context');

// Retrato de quem escreve (T-05-02, Modelo de Conexão §12): instituição e
// cargo/perfil.

test('authorContext: cargo do cadastro, nível do vínculo ou subperfil da conta', () => {
  assert.deepEqual(
    authorContext({ profileType: 'secretaria' }, { organizationName: ' Secretaria de Obras ', position: 'Coordenador' }),
    { organizationName: 'Secretaria de Obras', roleLabel: 'Coordenador' },
  );
  assert.deepEqual(
    authorContext({ profileType: 'morador' }, { organizationName: 'Associação Bairro Verde', position: 'Publicador' }),
    { organizationName: 'Associação Bairro Verde', roleLabel: 'Publicador' },
  );
  assert.deepEqual(authorContext({ profileType: 'empresa' }), { organizationName: null, roleLabel: 'Empresa' });
  assert.deepEqual(authorContext({ profileType: 'desconhecido' }, { position: '  ' }), { organizationName: null, roleLabel: null });
  assert.equal(authorContext({}, { position: 'x'.repeat(300) }).roleLabel.length, 120);
});

test('rótulos dos subperfis espelham ROLE_PROFILES do portal', () => {
  const types = fs.readFileSync(path.join(__dirname, '../../../src/lib/app/types.ts'), 'utf8');
  const block = types.slice(types.indexOf('export const ROLE_PROFILES'), types.indexOf('export const ROLE_FUTURE_PROFILES'));
  const portal = Object.fromEntries([...block.matchAll(/type: "([a-z_]+)", label: "([^"]+)"/g)].map((m) => [m[1], m[2]]));
  assert.deepEqual(PROFILE_TYPE_LABELS, portal);
});
