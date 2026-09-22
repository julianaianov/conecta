// Cadastros de exemplo usados só nos testes do cadastro institucional.

const AGENT_INPUT = {
  cnpj: '11.222.333/0001-81',
  legalName: 'Associação de Moradores do Bairro Verde',
  tradeName: 'AMBV',
  cnaePrimary: '9430-8/00',
  cnaeSecondary: [{ code: '8800-6/00' }, '9430800', { code: '9493600', description: 'Cultura e arte' }],
  cep: '20040-020',
  street: 'Rua da Assembleia',
  addressNumber: '10',
  district: 'Centro',
  municipality: 'Rio de Janeiro',
  uf: 'rj',
  institutionalEmail: 'contato@ambv.org.br',
  representative: {
    fullName: 'Ana Souza',
    position: 'Presidente',
    institutionalEmail: 'ana@ambv.org.br',
    institutionalPhone: '(21) 99999-0000',
  },
};

const GOV_INPUT = {
  cnpj: '12.ABC.345/01DE-35',
  legalName: 'Prefeitura Municipal de Exemplo',
  governmentSphere: 'Municipal',
  municipality: 'Exemplo',
  uf: 'SP',
  territory: 'Todo o município',
  department: 'Secretaria de Meio Ambiente',
  competenceAreas: ['Meio ambiente', 'meio ambiente', 'Saneamento'],
  representative: {
    fullName: 'Carlos Lima',
    position: 'Secretário',
    institutionalEmail: 'carlos@exemplo.sp.gov.br',
    institutionalPhone: '+55 11 3333-4444',
    proofDocumentRef: 'uploads/portaria-123.pdf',
  },
};

module.exports = { AGENT_INPUT, GOV_INPUT };
