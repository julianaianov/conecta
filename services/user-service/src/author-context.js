// Retrato de quem escreve na conversa da conexão (T27) e no Processo de
// Conexão (T-05-02). Modelo de Conexão §12: "Cada interação poderá registrar:
// usuário, instituição, cargo/perfil…".
//
// - Instituição: o cadastro institucional próprio ou a organização do vínculo
//   ativo (T29).
// - Cargo/perfil: o cargo do representante no cadastro próprio, o nível do
//   vínculo (Gestor, Publicador, Colaborador) ou, sem instituição, o subperfil
//   da conta. Espelho dos rótulos: ROLE_PROFILES em src/lib/app/types.ts.

const PROFILE_TYPE_LABELS = {
  associacao: 'Associação',
  ong: 'ONG',
  instituto: 'Instituto',
  projeto_social: 'Projeto Social',
  coletivo: 'Coletivo',
  lider_comunitario: 'Líder Comunitário',
  representante_bairro: 'Representante de Bairro',
  morador: 'Morador',
  voluntario: 'Voluntário',
  jovem: 'Jovem',
  participante: 'Participante da Comunidade',
  empresa: 'Empresa',
  marca: 'Marca',
  comercio_local: 'Comércio Local',
  patrocinador: 'Patrocinador',
  prefeitura: 'Prefeitura',
  secretaria: 'Secretaria',
  orgao_publico: 'Órgão Público',
  representante_poder_publico: 'Representante do Poder Público',
  politico: 'Político',
  imprensa: 'Imprensa',
  veiculo_comunicacao: 'Veículo de Comunicação',
  jornalista: 'Jornalista',
};

const ROLE_LABEL_MAX = 120;
const ORGANIZATION_NAME_MAX = 255;

const clean = (value, max) => {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text.slice(0, max) : null;
};

/** `{ organizationName, roleLabel }` a partir da instituição (quando há) e do subperfil. */
function authorContext(user, { organizationName = null, position = null } = {}) {
  const profileLabel = PROFILE_TYPE_LABELS[user?.profileType] ?? null;
  return {
    organizationName: clean(organizationName, ORGANIZATION_NAME_MAX),
    roleLabel: clean(position, ROLE_LABEL_MAX) ?? profileLabel,
  };
}

module.exports = { PROFILE_TYPE_LABELS, ROLE_LABEL_MAX, ORGANIZATION_NAME_MAX, authorContext };
