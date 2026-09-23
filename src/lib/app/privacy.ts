// PRIVACIDADE, CONSENTIMENTO E DIREITOS DO TITULAR (T24)
//
// Fonte: Apresentação Institucional, slide 25 — "Conformidade com a LGPD em
// toda a coleta, uso e compartilhamento de dados territoriais" e
// "apenas dados verificáveis são publicados; funcionalidades ainda em
// desenvolvimento são identificadas como tal".
//
// Espelho puro dos módulos dos serviços:
//   services/auth-service/src/consents.js        (documentos e versões)
//   services/user-service/src/privacy/constants.js (art. 18, prazo, retenção)
// `src/lib/app/privacy.test.mjs` compara os dois lados.
//
// O inventário do que é coletado (`DATA_INVENTORY`) é derivado do schema real
// (services/*/init.sql e migrações) e alimenta a página pública /privacidade.

export type ConsentDocumentKey = "termos_de_uso" | "politica_de_privacidade";
export type ConsentOrigin = "cadastro" | "nova_versao" | "reaceite";

export interface ConsentDocument {
  key: ConsentDocumentKey;
  label: string;
  version: string;
  date: string;
  path: string;
}

export interface ConsentRecord {
  document: ConsentDocumentKey;
  version: string;
  documentDate: string;
  origin: ConsentOrigin;
  acceptedAt: string;
}

/** Documentos com aceite obrigatório, na ordem em que aparecem no cadastro. */
export const CONSENT_DOCUMENTS: ConsentDocument[] = [
  { key: "termos_de_uso", label: "Termos de Uso", version: "1.0", date: "2026-09-22", path: "/termos-de-uso" },
  { key: "politica_de_privacidade", label: "Política de Privacidade", version: "1.1", date: "2026-09-22", path: "/politica-de-privacidade" },
];

export const CONSENT_KEYS: ConsentDocumentKey[] = CONSENT_DOCUMENTS.map((d) => d.key);

export const CONSENT_ORIGIN_LABELS: Record<ConsentOrigin, string> = {
  cadastro: "Aceite no cadastro",
  nova_versao: "Aceite de versão nova",
  reaceite: "Reaceite pelo titular",
};

/** Documentos vigentes que a conta ainda não aceitou. */
export function pendingConsents(accepted: ConsentRecord[]): ConsentDocument[] {
  return CONSENT_DOCUMENTS.filter(
    (doc) => !accepted.some((row) => row.document === doc.key && row.version === doc.version),
  );
}

// ── Direitos do titular (art. 18) ─────────────────────────────────────────

export type DataSubjectRequestType =
  | "acesso" | "portabilidade" | "correcao"
  | "revogacao_consentimento" | "compartilhamento" | "eliminacao";

export type DataSubjectRequestStatus = "recebida" | "em_andamento" | "concluida" | "indeferida";

export const REQUEST_TYPES: DataSubjectRequestType[] = [
  "acesso", "portabilidade", "correcao", "revogacao_consentimento", "compartilhamento", "eliminacao",
];

export const REQUEST_TYPE_LABELS: Record<DataSubjectRequestType, string> = {
  acesso: "Acesso aos meus dados",
  portabilidade: "Portabilidade (arquivo para levar)",
  correcao: "Correção de dados",
  revogacao_consentimento: "Revogação de consentimento",
  compartilhamento: "Informação sobre compartilhamento",
  eliminacao: "Eliminação / anonimização da conta",
};

export const REQUEST_TYPE_DESCRIPTIONS: Record<DataSubjectRequestType, string> = {
  acesso: "Gera um arquivo com tudo o que o portal guarda desta conta e entrega por link temporário.",
  portabilidade: "O mesmo arquivo da solicitação de acesso, em JSON, pronto para ser levado a outro serviço.",
  correcao: "Os dados do perfil e do cadastro institucional são corrigidos pelo próprio titular, nas telas de edição.",
  revogacao_consentimento: "Os consentimentos opcionais são revogados nesta tela; a solicitação registra o pedido para a equipe.",
  compartilhamento: "Pedido de informação sobre com quem os dados foram compartilhados.",
  eliminacao: "A conta é anonimizada; o que a lei e o interesse público mandam reter permanece sem identificação.",
};

/** Tipos que o portal atende na hora, sem esperar a equipe. */
export const SELF_SERVICE_TYPES: DataSubjectRequestType[] = ["acesso", "portabilidade"];

export const REQUEST_STATUS_LABELS: Record<DataSubjectRequestStatus, string> = {
  recebida: "Recebida",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  indeferida: "Indeferida",
};

/** Prazo legal de resposta (art. 19, II), o mesmo que a gestão usa. */
export const RESPONSE_DEADLINE_DAYS = 15;
/** Tempo que o arquivo da exportação fica no bucket antes de expirar. */
export const EXPORT_RETENTION_DAYS = 7;
export const DESCRIPTION_MAX = 2000;
/** Palavra digitada para confirmar a eliminação. */
export const ERASURE_CONFIRMATION = "ELIMINAR";
/** Rótulo que substitui a identificação da conta anonimizada. */
export const ANONYMOUS_NAME = "Conta removida";

export type RetentionAction = "anonimiza" | "apaga" | "retem";

export interface RetentionRule {
  key: string;
  data: string;
  action: RetentionAction;
  rule: string;
  basis: string;
}

export const RETENTION_ACTION_LABELS: Record<RetentionAction, string> = {
  anonimiza: "Anonimizado",
  apaga: "Apagado",
  retem: "Retido",
};

/** Regra de retenção por tipo de dado na eliminação (a que o código executa). */
export const RETENTION_RULES: RetentionRule[] = [
  {
    key: "conta",
    data: "Conta de acesso (e-mail, nome, senha)",
    action: "anonimiza",
    rule: "E-mail e nome substituídos, senha invalidada, sessões encerradas. A linha não é excluída: é a chave de toda a trilha do portal.",
    basis: "LGPD art. 18, IV (anonimização) e art. 16, I",
  },
  {
    key: "consentimentos",
    data: "Aceites dos Termos e da Política de Privacidade",
    action: "retem",
    rule: "A trilha do consentimento é imutável: guarda qual versão foi aceita e quando. Revogar não apaga o aceite que existiu.",
    basis: "LGPD art. 37 e art. 7º, VI",
  },
  {
    key: "perfil",
    data: "Perfil público (nome, bio, foto, telefone, bairro, site)",
    action: "anonimiza",
    rule: "Todos os campos de identificação e contato são apagados; o perfil sai das rotas públicas, do ranking e da busca.",
    basis: "LGPD art. 18, IV",
  },
  {
    key: "perfil_de_apoio",
    data: "Perfil de apoio (territórios, categorias e recursos de interesse)",
    action: "apaga",
    rule: "É preferência de atuação, sem valor de prova: o registro é removido.",
    basis: "LGPD art. 18, VI",
  },
  {
    key: "conexoes",
    data: "Conexões e mensagens escritas pelo titular",
    action: "anonimiza",
    rule: "A mensagem escrita pelo titular é removida; a conexão fica, porque também é registro da outra parte e da demanda a que se vinculou.",
    basis: "LGPD art. 18, IV, e art. 7º, VI",
  },
  {
    key: "recados",
    data: "Recados e depoimentos escritos pelo titular",
    action: "apaga",
    rule: "Conteúdo social sem valor de prestação de contas: removido. Os recados recebidos de terceiros permanecem, sem identificar o destinatário.",
    basis: "LGPD art. 18, VI",
  },
  {
    key: "cadastro_institucional",
    data: "Cadastro institucional (CNPJ, CNAE, órgão) e trilha de validação",
    action: "retem",
    rule: "É dado de pessoa jurídica e prova da validação que autorizou publicar. Os contatos do representante são anonimizados quando o cadastro ainda não foi enviado nem validado; validado, permanecem e a troca de representante é feita pela correção.",
    basis: "LGPD art. 16, I, e art. 7º, VI",
  },
  {
    key: "publicacoes",
    data: "Publicações e comentários no pulso",
    action: "anonimiza",
    rule: 'O conteúdo permanece (é registro do território); o nome e a foto do autor são substituídos por "Conta removida".',
    basis: "LGPD art. 18, IV, e art. 7º, VI",
  },
  {
    key: "demandas",
    data: "Demandas, dossiê, cronograma, evidências e prestação de contas",
    action: "retem",
    rule: "Registro de interesse público com documento oficial e prestação de contas: permanece com a identificação do Agente responsável e da instituição validada. A trilha não é reescrita.",
    basis: "LGPD art. 16, I e II, e art. 7º, VI",
  },
  {
    key: "apoios",
    data: "Apoios declarados e confirmados",
    action: "retem",
    rule: "Permanecem, porque compõem a prestação de contas da demanda apoiada; o consentimento de exibir nome e valor é revogado, e o apoio passa a aparecer sem identificação.",
    basis: "LGPD art. 16, II, e art. 8º, §5º",
  },
  {
    key: "rankings",
    data: "Rankings, selos e compartilhamentos",
    action: "anonimiza",
    rule: "O consentimento de exibir o nome é revogado: a conta continua contando nos números — eles seguem honestos — mas aparece sem nome e sem avatar.",
    basis: "LGPD art. 8º, §5º",
  },
  {
    key: "denuncias",
    data: "Denúncias feitas pelo titular",
    action: "retem",
    rule: "A denúncia é registro de moderação e permanece para a apuração; na gestão o denunciante já aparece pseudonimizado.",
    basis: "LGPD art. 7º, IX (legítimo interesse) e art. 16, II",
  },
  {
    key: "arquivos",
    data: "Arquivos enviados (fotos, evidências, documentos)",
    action: "retem",
    rule: "Os arquivos da demanda e da comprovação institucional seguem a demanda e o cadastro. O arquivo da exportação LGPD expira sozinho em 7 dias.",
    basis: "LGPD art. 16, I e II",
  },
  {
    key: "trilha",
    data: "Linha do tempo, trilha de validação e registros de auditoria",
    action: "retem",
    rule: "Nunca é apagada nem reescrita: é a prova de quem fez o quê e quando, e sustenta a transparência da demanda.",
    basis: "LGPD art. 37, art. 16, I, e art. 7º, VI",
  },
];

// ── O que o portal coleta (derivado do schema) ────────────────────────────

export interface DataInventoryEntry {
  /** Banco e tabelas de onde a lista foi derivada. */
  source: string;
  group: string;
  fields: string[];
  purpose: string;
  /** Quem vê esse dado sem estar logado. */
  visibility: "público" | "privado" | "equipe";
  optional?: boolean;
}

/**
 * Lista real do que é guardado, derivada de `services/*​/init.sql` e das
 * migrações (nada aqui é hipótese). É a lista que a página /privacidade mostra.
 */
export const DATA_INVENTORY: DataInventoryEntry[] = [
  {
    source: "auth_db.users, auth_db.user_consents",
    group: "Conta e acesso",
    fields: ["nome", "e-mail", "senha (hash)", "categoria e subperfil", "foto de perfil", "data de criação", "aceites dos documentos, com versão e data"],
    purpose: "Criar a conta, autenticar e provar o consentimento.",
    visibility: "privado",
  },
  {
    source: "user_db.profiles",
    group: "Perfil",
    fields: ["nome", "bio", "foto e capa", "situação", "bairro", "cidade", "estado", "telefone", "site", "categoria e subperfil", "data de entrada"],
    purpose: "Identificar quem publica, apoia e se conecta.",
    visibility: "público",
  },
  {
    source: "user_db.organizations, organization_representatives, organization_validation_events",
    group: "Cadastro institucional (Agente e Poder Público)",
    fields: ["razão social e nome fantasia", "CNPJ", "CNAE principal e secundários", "esfera, secretaria e competências", "endereço com CEP", "e-mail e telefone institucionais", "representante: nome, cargo, e-mail e telefone institucionais e documento de comprovação", "trilha da validação"],
    purpose: "Validar quem pode publicar demandas e responder institucionalmente.",
    visibility: "público",
  },
  {
    source: "post_db.posts, comments, reactions",
    group: "Publicações no pulso",
    fields: ["título e descrição", "tipo e situação", "bairro, cidade, estado, CEP e coordenada", "fotos e vídeos", "etiquetas", "comentários", "marcações de relevância (reações)"],
    purpose: "Mostrar o que acontece no território.",
    visibility: "público",
  },
  {
    source: "post_db.demands e tabelas ligadas (orçamento, cronograma, metas, recursos, documentos, dossiê, evidências, prestação de contas)",
    group: "Demandas do Agente de Transformação",
    fields: ["categoria, título, descrição, objetivo e justificativa", "público beneficiado e prioridade", "endereço com CEP, coordenada e território", "orçamento, cronograma, metas e indicadores", "documentos comprobatórios", "fotos e vídeos do antes e do depois", "prestação de contas e resultados"],
    purpose: "Estruturar, publicar, executar e prestar contas da demanda.",
    visibility: "público",
  },
  {
    source: "post_db.supports",
    group: "Apoios",
    fields: ["modalidade e o que foi oferecido", "descrição e mensagem", "valor declarado", "data", "estado do recebimento", "consentimento de exibir nome e valor"],
    purpose: "Registrar e conferir o apoio, e compor a transparência da demanda.",
    visibility: "público",
    optional: true,
  },
  {
    source: "user_db.connections, scraps, testimonials, partner_profiles",
    group: "Conexões e rede",
    fields: ["mensagem de contato", "estado e desfecho", "recados e depoimentos", "perfil de apoio: territórios, categorias e recursos de interesse"],
    purpose: "Aproximar quem pede e quem apoia.",
    visibility: "privado",
  },
  {
    source: "post_db.demand_interests",
    group: "Interesse em demandas",
    fields: ["tipo de interesse", "recursos oferecidos", "mensagem ao Agente", "estado da conexão"],
    purpose: "Ligar quem quer apoiar a quem publicou a demanda.",
    visibility: "privado",
  },
  {
    source: "post_db.content_shares, ranking_consents, ranking_snapshots, profile_badges",
    group: "Engajamento e rankings",
    fields: ["compartilhamentos", "consentimento de aparecer com o nome nos rankings", "posição e números do ranking", "selos de impacto"],
    purpose: "Reconhecer apoio e impacto. Sem consentimento, a conta conta nos números mas aparece sem nome.",
    visibility: "público",
    optional: true,
  },
  {
    source: "post_db.content_reports",
    group: "Denúncias",
    fields: ["alvo e motivo", "descrição", "quem denunciou"],
    purpose: "Moderar conteúdo. O denunciado nunca sabe quem denunciou.",
    visibility: "equipe",
  },
  {
    source: "post_db.uploads, user_db.uploads e bucket S3",
    group: "Arquivos",
    fields: ["nome do arquivo", "tipo e tamanho", "soma de verificação", "a que demanda ou cadastro pertence"],
    purpose: "Guardar fotos, vídeos e documentos enviados.",
    visibility: "privado",
  },
  {
    source: "post_db.demand_events, user_db.organization_validation_events, data_subject_requests, account_anonymizations",
    group: "Trilhas e solicitações",
    fields: ["quem fez o quê e quando", "solicitações LGPD: protocolo, tipo, datas e desfecho", "execução da anonimização, em contagens"],
    purpose: "Transparência da demanda, auditoria e atendimento aos direitos do titular.",
    visibility: "público",
  },
];

/** O que o portal **não** coleta (afirmações conferíveis no schema). */
export const NOT_COLLECTED = [
  "CPF",
  "dados de pagamento (a plataforma não processa pagamento: o apoio financeiro é valor declarado)",
  "dados bancários",
  "IP ou identificador de dispositivo no registro de consentimento",
  "localização em segundo plano ou rastreamento contínuo",
];

/** Terceiros que recebem ou processam dados (fatos da arquitetura). */
export const DATA_SHARING = [
  { who: "Amazon Web Services (us-east-2, Estados Unidos)", what: "hospedagem do portal, dos bancos e dos arquivos", note: "transferência internacional (LGPD art. 33)" },
  { who: "Cloudflare", what: "tráfego e DNS do domínio dmconecta.org", note: "" },
  { who: "ViaCEP", what: "consulta de CEP, sob demanda", note: "só o CEP digitado sai do navegador; nada é gravado" },
  { who: "Equipe de gestão do DM Conecta", what: "validação institucional, moderação e atendimento às solicitações", note: "acesso mínimo e auditado; dados pessoais aparecem mascarados" },
];

export const PRIVACY_PATH = "/perfil/privacidade";
export const PUBLIC_PRIVACY_PATH = "/privacidade";
