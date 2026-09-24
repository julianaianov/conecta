// Vocabulário dos direitos do titular (T24, LGPD art. 18) e a regra de
// retenção por tipo de dado na eliminação.
//
// Fonte: Apresentação Institucional, slide 25 ("Conformidade com a LGPD em
// toda a coleta, uso e compartilhamento"; "apenas dados verificáveis são
// publicados; funcionalidades ainda em desenvolvimento são identificadas como
// tal").
//
// Os tipos e o prazo são **os mesmos do dm-gestao**
// (`gestao_db.data_subject_requests`, dm-docs/gestao/05-lgpd.md §2), para
// que a solicitação nascida no portal entre na fila de lá sem tradução.
//
// Espelhado em `src/lib/app/privacy.ts` (há teste que compara os dois).

/** Tipos do art. 18, na ordem em que a tela os apresenta. */
const REQUEST_TYPES = [
  'acesso',
  'portabilidade',
  'correcao',
  'revogacao_consentimento',
  'compartilhamento',
  'eliminacao',
];

const REQUEST_TYPE_LABELS = {
  acesso: 'Acesso aos meus dados',
  portabilidade: 'Portabilidade (arquivo para levar)',
  correcao: 'Correção de dados',
  revogacao_consentimento: 'Revogação de consentimento',
  compartilhamento: 'Informação sobre compartilhamento',
  eliminacao: 'Eliminação / anonimização da conta',
};

const REQUEST_TYPE_DESCRIPTIONS = {
  acesso: 'Gera um arquivo com tudo o que o portal guarda desta conta e entrega por link temporário.',
  portabilidade: 'O mesmo arquivo da solicitação de acesso, em JSON, pronto para ser levado a outro serviço.',
  correcao: 'Os dados do perfil e do cadastro institucional são corrigidos pelo próprio titular, nas telas de edição.',
  revogacao_consentimento: 'Os consentimentos opcionais são revogados nesta tela; a solicitação registra o pedido para a equipe.',
  compartilhamento: 'Pedido de informação sobre com quem os dados foram compartilhados.',
  eliminacao: 'A conta é anonimizada; o que a lei e o interesse público mandam reter permanece sem identificação.',
};

/** Tipos que o portal atende na hora, sem esperar a equipe. */
const SELF_SERVICE_TYPES = ['acesso', 'portabilidade'];

const REQUEST_STATUSES = ['recebida', 'em_andamento', 'concluida', 'indeferida'];

const REQUEST_STATUS_LABELS = {
  recebida: 'Recebida',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  indeferida: 'Indeferida',
};

/** Prazo legal de resposta (art. 19, II), igual ao da gestão. */
const RESPONSE_DEADLINE_DAYS = 15;

/** Validade do link de download da exportação. */
const EXPORT_URL_TTL_SECONDS = 5 * 60;
/** Tempo que o arquivo da exportação fica no bucket antes de expirar. */
const EXPORT_RETENTION_DAYS = 7;

const DESCRIPTION_MAX = 2000;

/** Rótulo que substitui a identificação da conta anonimizada. */
const ANONYMOUS_NAME = 'Conta removida';

/**
 * Regra de retenção e anonimização, por tipo de dado. É o que a tela de
 * privacidade e a documentação mostram, na mesma ordem, e é a regra que o
 * código executa (`store.anonymizeProfile` aqui, `privacy/store.js` no
 * post-service e `POST /me/anonymize` no auth-service).
 *
 * `action`: `anonimiza` (a identificação sai), `apaga` (o registro sai) ou
 * `retem` (fica como está, com a base legal).
 */
const RETENTION_RULES = [
  {
    key: 'conta',
    data: 'Conta de acesso (e-mail, nome, senha)',
    action: 'anonimiza',
    rule: 'E-mail e nome substituídos, senha invalidada, sessões encerradas. A linha não é excluída: é a chave de toda a trilha do portal.',
    basis: 'LGPD art. 18, IV (anonimização) e art. 16, I',
  },
  {
    key: 'consentimentos',
    data: 'Aceites dos Termos e da Política de Privacidade',
    action: 'retem',
    rule: 'A trilha do consentimento é imutável: guarda qual versão foi aceita e quando. Revogar não apaga o aceite que existiu.',
    basis: 'LGPD art. 37 e art. 7º, VI',
  },
  {
    key: 'perfil',
    data: 'Perfil público (nome, bio, foto, telefone, bairro, site)',
    action: 'anonimiza',
    rule: 'Todos os campos de identificação e contato são apagados; o perfil sai das rotas públicas, do ranking e da busca.',
    basis: 'LGPD art. 18, IV',
  },
  {
    key: 'perfil_de_apoio',
    data: 'Perfil de apoio (territórios, categorias e recursos de interesse)',
    action: 'apaga',
    rule: 'É preferência de atuação, sem valor de prova: o registro é removido.',
    basis: 'LGPD art. 18, VI',
  },
  {
    key: 'conexoes',
    data: 'Conexões, pedido e mensagens da conversa escritas pelo titular',
    action: 'anonimiza',
    rule: 'O pedido e as mensagens da conversa escritas pelo titular são removidos; a conexão e a conversa ficam, porque também são registro da outra parte e da demanda a que se vincularam.',
    basis: 'LGPD art. 18, IV, e art. 7º, VI',
  },
  {
    key: 'vinculos',
    data: 'Vínculo a uma instituição (equipe, nível e convites)',
    action: 'anonimiza',
    rule: 'O vínculo ativo é encerrado e os convites abertos são recusados; a linha fica como registro de quem atuou em nome da instituição, sem o nome (o perfil é anonimizado).',
    basis: 'LGPD art. 18, IV, e art. 7º, VI',
  },
  {
    key: 'recados',
    data: 'Recados e depoimentos escritos pelo titular',
    action: 'apaga',
    rule: 'Conteúdo social sem valor de prestação de contas: removido. Os recados recebidos de terceiros permanecem, sem identificar o destinatário.',
    basis: 'LGPD art. 18, VI',
  },
  {
    key: 'cadastro_institucional',
    data: 'Cadastro institucional (CNPJ, CNAE, órgão) e trilha de validação',
    action: 'retem',
    rule: 'É dado de pessoa jurídica e prova da validação que autorizou publicar. Os contatos do representante são anonimizados quando o cadastro ainda não foi enviado nem validado; validado, permanecem e a troca de representante é feita pela correção.',
    basis: 'LGPD art. 16, I, e art. 7º, VI',
  },
  {
    key: 'publicacoes',
    data: 'Publicações e comentários no pulso',
    action: 'anonimiza',
    rule: 'O conteúdo permanece (é registro do território); o nome e a foto do autor são substituídos por "Conta removida".',
    basis: 'LGPD art. 18, IV, e art. 7º, VI',
  },
  {
    key: 'demandas',
    data: 'Demandas, dossiê, cronograma, evidências e prestação de contas',
    action: 'retem',
    rule: 'Registro de interesse público com documento oficial e prestação de contas: permanece com a identificação do Agente responsável e da instituição validada. A trilha não é reescrita.',
    basis: 'LGPD art. 16, I e II, e art. 7º, VI',
  },
  {
    key: 'apoios',
    data: 'Apoios declarados e confirmados',
    action: 'retem',
    rule: 'Permanecem, porque compõem a prestação de contas da demanda apoiada; o consentimento de exibir nome e valor é revogado, e o apoio passa a aparecer sem identificação.',
    basis: 'LGPD art. 16, II, e art. 8º, §5º',
  },
  {
    key: 'rankings',
    data: 'Rankings, selos e compartilhamentos',
    action: 'anonimiza',
    rule: 'O consentimento de exibir o nome é revogado: a conta continua contando nos números — eles seguem honestos — mas aparece sem nome e sem avatar.',
    basis: 'LGPD art. 8º, §5º',
  },
  {
    key: 'denuncias',
    data: 'Denúncias feitas pelo titular',
    action: 'retem',
    rule: 'A denúncia é registro de moderação e permanece para a apuração; na gestão o denunciante já aparece pseudonimizado.',
    basis: 'LGPD art. 7º, IX (legítimo interesse) e art. 16, II',
  },
  {
    key: 'arquivos',
    data: 'Arquivos enviados (fotos, evidências, documentos)',
    action: 'retem',
    rule: 'Os arquivos da demanda e da comprovação institucional seguem a demanda e o cadastro. O arquivo da exportação LGPD expira sozinho em 7 dias.',
    basis: 'LGPD art. 16, I e II',
  },
  {
    key: 'trilha',
    data: 'Linha do tempo, trilha de validação e registros de auditoria',
    action: 'retem',
    rule: 'Nunca é apagada nem reescrita: é a prova de quem fez o quê e quando, e sustenta a transparência da demanda.',
    basis: 'LGPD art. 37, art. 16, I, e art. 7º, VI',
  },
];

const RETENTION_ACTION_LABELS = {
  anonimiza: 'Anonimizado',
  apaga: 'Apagado',
  retem: 'Retido',
};

module.exports = {
  REQUEST_TYPES,
  REQUEST_TYPE_LABELS,
  REQUEST_TYPE_DESCRIPTIONS,
  SELF_SERVICE_TYPES,
  REQUEST_STATUSES,
  REQUEST_STATUS_LABELS,
  RESPONSE_DEADLINE_DAYS,
  EXPORT_URL_TTL_SECONDS,
  EXPORT_RETENTION_DAYS,
  DESCRIPTION_MAX,
  ANONYMOUS_NAME,
  RETENTION_RULES,
  RETENTION_ACTION_LABELS,
};
