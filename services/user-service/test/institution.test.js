const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  isValidCnpj, formatCnpj, normalizeCnpj, isValidCnae, formatCnae, cnaeDescription,
  isValidCep, isValidPhone, normalizePhone, isValidEmail, kindForUser,
  validateInstitution, transitionAllowed, canActInstitutionally, CNAE_REFERENCE,
} = require('../src/institution');

const { AGENT_INPUT, GOV_INPUT } = require('./institution-fixtures');

test('CNPJ: dígitos verificadores, máscara e formato alfanumérico', () => {
  assert.ok(isValidCnpj('11.222.333/0001-81'));
  assert.ok(isValidCnpj('11222333000181'));
  assert.ok(isValidCnpj('12.ABC.345/01DE-35'), 'CNPJ alfanumérico (IN RFB 2.229/2024)');
  assert.ok(isValidCnpj('12abc34501de35'), 'minúsculas são normalizadas');
  assert.ok(!isValidCnpj('11.222.333/0001-82'));
  assert.ok(!isValidCnpj('12.ABC.345/01DE-36'));
  assert.ok(!isValidCnpj('11111111111111'));
  assert.ok(!isValidCnpj('1122233300018'));
  assert.ok(!isValidCnpj('11222333000181X'));
  assert.ok(!isValidCnpj('12.ABC.345/01DE-3A'), 'DV sempre numérico');
  assert.ok(!isValidCnpj(null));
  assert.equal(normalizeCnpj('12.abc.345/01de-35'), '12ABC34501DE35');
  assert.equal(formatCnpj('11222333000181'), '11.222.333/0001-81');
});

test('CNAE: formato de subclasse e referência', () => {
  assert.ok(isValidCnae('9430-8/00'));
  assert.ok(isValidCnae('9430800'));
  assert.ok(!isValidCnae('943080'));
  assert.ok(!isValidCnae('0012345'));
  assert.ok(!isValidCnae('9430-8/0A'));
  assert.equal(formatCnae('9430800'), '9430-8/00');
  assert.equal(cnaeDescription('9430-8/00'), 'Atividades de associações de defesa de direitos sociais');
  assert.equal(cnaeDescription('1111111'), null);
  for (const item of CNAE_REFERENCE) assert.ok(isValidCnae(item.code), item.code);
  assert.equal(new Set(CNAE_REFERENCE.map((i) => i.code)).size, CNAE_REFERENCE.length);
});

test('CEP, telefone e e-mail', () => {
  assert.ok(isValidCep('20040-020'));
  assert.ok(!isValidCep('2004002'));
  assert.ok(!isValidCep('00000-000'));
  assert.ok(isValidPhone('(21) 99999-0000'));
  assert.ok(isValidPhone('+55 11 3333-4444'));
  assert.equal(normalizePhone('+55 11 3333-4444'), '1133334444');
  assert.ok(!isValidPhone('(21) 89999-0000'), 'celular com 11 dígitos começa com 9');
  assert.ok(!isValidPhone('0213333444'));
  assert.ok(isValidEmail('a@b.gov.br'));
  assert.ok(!isValidEmail('sem-arroba.gov.br'));
});

test('tipo do cadastro segue a categoria do perfil', () => {
  assert.equal(kindForUser({ role: 'agent', profileType: 'ong' }), 'agente_transformacao');
  assert.equal(kindForUser({ role: 'member', profileType: 'lider_comunitario' }), 'agente_transformacao');
  assert.equal(kindForUser({ role: 'institutional' }), 'poder_publico');
  assert.equal(kindForUser({ role: 'government', profileType: 'politico' }), 'poder_publico');
  assert.equal(kindForUser({ role: 'partner' }), null);
  assert.equal(kindForUser({ role: 'media', profileType: 'jornalista' }), null);
});

test('Agente de Transformação: CNPJ + CNAE + dados institucionais', () => {
  const { value, errors } = validateInstitution('agente_transformacao', AGENT_INPUT);
  assert.deepEqual(errors, {});
  const org = value.organization;
  assert.equal(org.cnpj, '11222333000181');
  assert.equal(org.cnae_primary, '9430800');
  assert.equal(org.cnae_primary_description, 'Atividades de associações de defesa de direitos sociais');
  assert.deepEqual(org.cnae_secondary, [
    { code: '8800600', description: 'Serviços de assistência social sem alojamento' },
    { code: '9493600', description: 'Cultura e arte' },
  ]);
  assert.equal(org.cep, '20040020');
  assert.equal(org.uf, 'RJ');
  assert.equal(org.government_sphere, null);
  assert.equal(value.representative.institutional_phone, '21999990000');
});

test('Agente: obrigatórios e mensagens por campo', () => {
  const { errors } = validateInstitution('agente_transformacao', {
    cnpj: '11.222.333/0001-80', cnaePrimary: '12', cnaeSecondary: ['x'], cep: '123', uf: 'XX',
    representative: { institutionalEmail: 'invalido', institutionalPhone: '123' },
  });
  for (const field of ['cnpj', 'legalName', 'cnaePrimary', 'cnaeSecondary.0', 'cep', 'street', 'addressNumber',
    'district', 'municipality', 'uf', 'institutionalContact', 'representative.fullName', 'representative.position',
    'representative.institutionalEmail', 'representative.institutionalPhone']) {
    assert.ok(errors[field], `esperava erro em ${field}`);
  }
  const noDescription = validateInstitution('agente_transformacao', { ...AGENT_INPUT, cnaePrimary: '1111111' });
  assert.ok(noDescription.errors.cnaePrimaryDescription, 'CNAE fora da referência exige descrição');
  const withDescription = validateInstitution('agente_transformacao', {
    ...AGENT_INPUT, cnaePrimary: '1111111', cnaePrimaryDescription: 'Atividade informada',
  });
  assert.deepEqual(withDescription.errors, {});
});

test('Poder Público: órgão, esfera, território, secretaria, competência e representante', () => {
  const { value, errors } = validateInstitution('poder_publico', GOV_INPUT);
  assert.deepEqual(errors, {});
  const org = value.organization;
  assert.equal(org.cnpj, '12ABC34501DE35');
  assert.equal(org.government_sphere, 'municipal');
  assert.deepEqual(org.competence_areas, ['Meio ambiente', 'Saneamento']);
  assert.equal(org.cnae_primary, null);
  assert.equal(org.cep, null, 'endereço é opcional para o Poder Público');
  assert.equal(value.representative.proof_document_ref, 'uploads/portaria-123.pdf');

  const missing = validateInstitution('poder_publico', { cnpj: GOV_INPUT.cnpj, governmentSphere: 'distrital' });
  for (const field of ['legalName', 'governmentSphere', 'territory', 'department', 'competenceAreas', 'representative.fullName']) {
    assert.ok(missing.errors[field], `esperava erro em ${field}`);
  }
  const municipal = validateInstitution('poder_publico', { ...GOV_INPUT, municipality: '', uf: '' });
  assert.ok(municipal.errors.municipality);
  assert.ok(municipal.errors.uf);
  const federal = validateInstitution('poder_publico', { ...GOV_INPUT, governmentSphere: 'federal', municipality: '', uf: '' });
  assert.deepEqual(federal.errors, {});
});

test('tipo desconhecido é recusado', () => {
  assert.deepEqual(validateInstitution('empresa', AGENT_INPUT).errors, { kind: 'Tipo de instituição inválido' });
});

test('transições: titular só envia; gestão valida, devolve e revoga', () => {
  assert.ok(transitionAllowed('titular', 'pendente', 'em_analise'));
  assert.ok(transitionAllowed('titular', 'devolvida', 'em_analise'));
  assert.ok(transitionAllowed('titular', 'revogada', 'em_analise'));
  assert.ok(!transitionAllowed('titular', 'em_analise', 'validada'));
  assert.ok(!transitionAllowed('titular', 'pendente', 'validada'));
  assert.ok(transitionAllowed('gestao', 'em_analise', 'validada'));
  assert.ok(transitionAllowed('gestao', 'em_analise', 'devolvida'));
  assert.ok(transitionAllowed('gestao', 'validada', 'revogada'));
  assert.ok(!transitionAllowed('gestao', 'pendente', 'validada'));
  assert.ok(!transitionAllowed('gestao', 'devolvida', 'validada'));
  assert.ok(canActInstitutionally('poder_publico', 'validada'));
  assert.ok(!canActInstitutionally('poder_publico', 'em_analise'));
  assert.ok(!canActInstitutionally(null, 'validada'));
});

test('o trigger da migração 008 impõe as mesmas transições do módulo', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '008-institutional-registration.sql'), 'utf8');
  assert.match(sql, /\('em_analise', 'validada'\), \('em_analise', 'devolvida'\), \('validada', 'revogada'\)/);
  assert.match(sql, /OLD\.validation_status IN \('pendente', 'devolvida', 'revogada'\)\s+AND NEW\.validation_status = 'em_analise'/);
  assert.match(sql, /session_user = 'gestao_app'/);
});

test('user-service e post-service usam a mesma cópia de src/roles.js', () => {
  const read = (service) => fs.readFileSync(path.join(__dirname, '..', '..', service, 'src', 'roles.js'), 'utf8');
  assert.equal(read('user-service'), read('post-service'));
});
