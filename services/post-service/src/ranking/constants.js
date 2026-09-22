// Vocabulário do engajamento, dos rankings e dos selos de impacto social (T21).
//
// Fonte: 01-apresentacao-institucional.html, slide 22 ("Engajamento e
// rankings") e slide 13 ("Restrições e governança"). Os sete rankings são os
// sete da fonte, na ordem dela. O critério de cada um é texto de interface: o
// ranking só vale se quem lê entende como a conta foi feita.
//
// `src/lib/app/ranking.ts` repete estas listas no frontend e
// `src/lib/app/ranking.test.mjs` compara os dois arquivos.

// Períodos configuráveis. `sempre` é o acumulado desde o início.
const PERIODS = ['mes', 'ano', 'sempre'];

const PERIOD_LABELS = {
  mes: 'Este mês',
  ano: 'Este ano',
  sempre: 'Desde o início',
};

const DEFAULT_PERIOD = 'sempre';

// Categorias de conta usadas pelo ranking. `poder_publico` existe para ser
// **excluída**: o Poder Público e os políticos nunca entram em ranking
// competitivo (slide 13).
const ACTOR_CATEGORIES = ['agente', 'comunidade', 'parceiro', 'comunicacao', 'poder_publico'];

const ACTOR_CATEGORY_LABELS = {
  agente: 'Agente de Transformação',
  comunidade: 'Membro da Comunidade',
  parceiro: 'Parceiro',
  comunicacao: 'Comunicação',
  poder_publico: 'Poder Público',
};

// Categoria excluída de todo ranking de pessoas.
const EXCLUDED_CATEGORY = 'poder_publico';

// Papel do token (auth_db.users.role) → categoria do ranking.
const ROLE_TO_CATEGORY = {
  agent: 'agente',
  member: 'comunidade',
  partner: 'parceiro',
  communication: 'comunicacao',
  government: 'poder_publico',
};

// Categoria gravada em `supports.supporter_category` / `demand_interests.user_category`.
const SUPPORTER_CATEGORY_TO_CATEGORY = {
  parceiro: 'parceiro',
  comunidade: 'comunidade',
  poder_publico: 'poder_publico',
};

function normalizeActorCategory(value) {
  if (typeof value !== 'string' || !value) return null;
  if (ACTOR_CATEGORIES.includes(value)) return value;
  return ROLE_TO_CATEGORY[value] ?? SUPPORTER_CATEGORY_TO_CATEGORY[value] ?? null;
}

// Os subperfis de Parceiro que a fonte chama de "empresas" (slide 10).
const COMPANY_PROFILE_TYPES = ['empresa', 'comercio_local', 'marca', 'patrocinador'];

// Canais de compartilhamento aceitos (o que o navegador conseguiu fazer).
const SHARE_CHANNELS = ['web_share', 'copiar_link', 'outro'];

const SHARE_TARGET_KINDS = ['post', 'demand'];

// ── Os sete rankings da fonte (slide 22) ────────────────────────────────────
// `points` descreve a fórmula em texto; `criteria` é a explicação exibida na
// interface; `subjectKind` diz o que é rankeado.
const BOARDS = [
  {
    id: 'usuarios_mais_ativos',
    label: 'Usuários mais ativos',
    subjectKind: 'usuario',
    subtitle: 'Quem mais participa da vida da plataforma.',
    criteria: 'Soma a participação registrada no período: curtida (1), comentário (3), '
      + 'compartilhamento (5), interesse registrado em uma demanda (8), apoio declarado (10) '
      + 'e demanda publicada (15). Conta só o que ficou persistido; nada é estimado.',
    metrics: ['reactions', 'comments', 'shares', 'interests', 'supports', 'demands'],
  },
  {
    id: 'maiores_apoiadores',
    label: 'Maiores apoiadores',
    subjectKind: 'usuario',
    subtitle: 'Quem mais teve apoio confirmado pelo Agente autor.',
    criteria: 'Conta apoios **confirmados** pelo Agente autor da demanda (T16): 10 pontos por '
      + 'apoio confirmado e 5 por demanda distinta apoiada. Apoio cancelado, contestado ou '
      + 'ainda não confirmado não pontua.',
    metrics: ['confirmedSupports', 'supportedDemands'],
  },
  {
    id: 'empresas_em_destaque',
    label: 'Empresas em destaque',
    subjectKind: 'usuario',
    subtitle: 'Parceiros (empresa, comércio local, marca, patrocinador) com apoio confirmado.',
    criteria: 'Mesma conta de "Maiores apoiadores", restrita às contas da categoria Parceiro, '
      + 'mais 5 pontos por modalidade de apoio distinta (slide 20) — reconhece a empresa que '
      + 'apoia de mais de uma forma.',
    metrics: ['confirmedSupports', 'supportedDemands', 'modalities'],
  },
  {
    id: 'voluntarios_mais_participativos',
    label: 'Voluntários mais participativos',
    subjectKind: 'usuario',
    subtitle: 'Membros da Comunidade que se ofereceram e foram aceitos.',
    criteria: 'Conta, para contas da categoria Membro da Comunidade: 5 pontos por interesse de '
      + 'voluntariado ou participação registrado, 15 por conexão aceita pelo Agente a partir '
      + 'desse interesse e 10 por apoio de voluntariado confirmado.',
    metrics: ['interests', 'acceptedConnections', 'confirmedSupports'],
  },
  {
    id: 'maiores_patrocinadores',
    label: 'Maiores patrocinadores',
    subjectKind: 'usuario',
    subtitle: 'Patrocínio e financiamento de eventos com valor divulgado.',
    criteria: 'Soma o valor declarado (decisão 5: a plataforma não processa pagamento) dos '
      + 'apoios confirmados nas modalidades "Patrocinar projetos" e "Financiar eventos". Entra '
      + 'só o apoio em que o apoiador autorizou divulgar o nome **e** o valor; sem essas duas '
      + 'autorizações o apoio não aparece aqui. 1 ponto por real declarado.',
    metrics: ['amount', 'confirmedSupports'],
  },
  {
    id: 'bairros_mais_engajados',
    label: 'Bairros mais engajados',
    subjectKind: 'bairro',
    subtitle: 'Territórios com mais demandas, apoio e mobilização.',
    criteria: 'Agrupa as demandas publicadas por bairro/município/UF e soma: demanda publicada '
      + '(10), apoio confirmado (5), interesse registrado (3) e compartilhamento (2). Não há '
      + 'dado pessoal — o ranking é do território.',
    metrics: ['demands', 'confirmedSupports', 'interests', 'shares'],
  },
  {
    id: 'projetos_mais_apoiados',
    label: 'Projetos mais apoiados',
    subjectKind: 'demanda',
    subtitle: 'Demandas publicadas que mais mobilizaram apoio.',
    criteria: 'Por demanda publicada: apoio confirmado (10), interesse registrado (5), '
      + 'compartilhamento (3) e cada curtida ou comentário do post-vitrine (1).',
    metrics: ['confirmedSupports', 'interests', 'shares', 'reactions', 'comments'],
  },
];

const BOARD_IDS = BOARDS.map((b) => b.id);

// Aviso obrigatório da fonte (slide 13), repetido na interface.
const GOVERNMENT_NOTICE = 'O Poder Público e os políticos não entram em ranking competitivo de '
  + 'apoiadores: a neutralidade institucional é regra da plataforma. A atuação dos órgãos é '
  + 'acompanhada por indicadores de atuação — respostas institucionais, encaminhamentos, '
  + 'acompanhamentos e apoios oferecidos — publicados no perfil do órgão e na linha do tempo '
  + 'de cada demanda, sem pontuação e sem comparação entre órgãos.';

// Aviso de consentimento (LGPD), repetido na interface.
const CONSENT_NOTICE = 'O ranking mostra o nome apenas de quem consentiu. Nos rankings de apoio '
  + 'vale o consentimento dado no próprio apoio; nos demais, a opção "aparecer com meu nome nos '
  + 'rankings públicos" do perfil. Sem consentimento, a posição continua contando, mas aparece '
  + 'sem nome, sem foto e sem link.';

// ── Selos de impacto social ────────────────────────────────────────────────
// Cada selo é uma regra objetiva sobre registro persistido e verificável. A
// data do selo é a do registro que o conquistou. Nada é concedido à mão.
const BADGES = [
  {
    id: 'apoiador_confirmado',
    label: 'Apoiador confirmado',
    rule: 'Pelo menos um apoio a uma demanda confirmado pelo Agente autor.',
    threshold: 1,
  },
  {
    id: 'apoiador_recorrente',
    label: 'Apoiador recorrente',
    rule: 'Cinco ou mais apoios confirmados pelos Agentes autores.',
    threshold: 5,
  },
  {
    id: 'patrocinador',
    label: 'Patrocinador',
    rule: 'Pelo menos um apoio confirmado nas modalidades "Patrocinar projetos" ou '
      + '"Financiar eventos".',
    threshold: 1,
  },
  {
    id: 'voluntario_participante',
    label: 'Voluntário participante',
    rule: 'Interesse de voluntariado ou participação cuja conexão foi aceita pelo Agente.',
    threshold: 1,
  },
  {
    id: 'agente_com_demanda_concluida',
    label: 'Agente com demanda concluída',
    rule: 'Pelo menos uma demanda própria em "Concluída" ou "Prestação de contas".',
    threshold: 1,
  },
  {
    id: 'prestacao_de_contas_publicada',
    label: 'Prestação de contas publicada',
    rule: 'Pelo menos uma demanda própria com a prestação de contas concluída e pública.',
    threshold: 1,
  },
  {
    id: 'registro_antes_e_depois',
    label: 'Registro antes e depois',
    rule: 'Pelo menos um par de evidências antes↔depois registrado em demanda própria.',
    threshold: 1,
  },
  {
    id: 'divulgador',
    label: 'Divulgador',
    rule: 'Dez ou mais compartilhamentos registrados de demandas ou publicações.',
    threshold: 10,
  },
];

const BADGE_IDS = BADGES.map((b) => b.id);

// Indicadores de atuação do Poder Público (slide 13). Substituem o ranking:
// são contagens, sem pontuação e sem posição.
const GOVERNMENT_INDICATORS = [
  { id: 'tracks', label: 'Demandas acompanhadas' },
  { id: 'responses', label: 'Respostas institucionais publicadas' },
  { id: 'forwardings', label: 'Encaminhamentos realizados' },
  { id: 'offers', label: 'Apoios oferecidos' },
  { id: 'concluded', label: 'Acompanhamentos concluídos' },
];

module.exports = {
  PERIODS,
  PERIOD_LABELS,
  DEFAULT_PERIOD,
  ACTOR_CATEGORIES,
  ACTOR_CATEGORY_LABELS,
  EXCLUDED_CATEGORY,
  ROLE_TO_CATEGORY,
  SUPPORTER_CATEGORY_TO_CATEGORY,
  normalizeActorCategory,
  COMPANY_PROFILE_TYPES,
  SHARE_CHANNELS,
  SHARE_TARGET_KINDS,
  BOARDS,
  BOARD_IDS,
  GOVERNMENT_NOTICE,
  CONSENT_NOTICE,
  BADGES,
  BADGE_IDS,
  GOVERNMENT_INDICATORS,
};
