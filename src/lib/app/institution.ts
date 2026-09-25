/**
 * Cadastro institucional na interface (T05). Módulo puro: máscaras, validação
 * espelhada do user-service (`services/user-service/src/institution.js`),
 * conversão formulário ↔ API, textos de requisito e tratamento do 403
 * `institution_not_validated`. A validação que vale é a do servidor (erros em
 * `fields`); a daqui só antecipa o aviso ao titular.
 *
 * Fonte da verdade: Fluxo 2, etapas 01–02 (CNPJ + CNAE do Agente de
 * Transformação) e Fluxo 3, etapas 01–02 (órgão, esfera, território e
 * representante do Poder Público); Modelo de Conexão §02 (tipo de
 * organização, documentação institucional e informações complementares,
 * T-05-19); decisões 2, 3 e 18 de
 * dm-docs/fonte-da-verdade/decisoes-de-implementacao.md.
 */
import {
  INSTITUTION_EDITABLE_STATUSES,
  LINKED_AGENT_PROFILES,
  PROFILE_LABELS,
  institutionKindFor,
  normalizeRole,
  type CnaeEntry,
  type GovernmentSphere,
  type Institution,
  type InstitutionAccess,
  type InstitutionDocumentKind,
  type InstitutionFieldErrors,
  type InstitutionInput,
  type InstitutionKind,
  type InstitutionValidationStatus,
  type OrganizationType,
  type ProfileType,
  type PublicInstitution,
} from "./types.ts";

// ── Rotas ──────────────────────────────────────────────────
export const INSTITUTION_HUB_PATH = "/cadastro-institucional";

export const INSTITUTION_FORM_PATHS: Record<InstitutionKind, string> = {
  agente_transformacao: "/cadastro-institucional/agente",
  poder_publico: "/cadastro-institucional/poder-publico",
};

/** Destino depois de criar a conta: Agente e Poder Público vão à ficha institucional. */
export function postRegisterDestination(role: string | null | undefined, profileType?: string | null): string {
  const kind = institutionKindFor(role, profileType);
  return kind ? `${INSTITUTION_FORM_PATHS[kind]}?boas-vindas=1` : "/feed";
}

// ── Tipo de organização e documentação (Modelo de Conexão §02) ──
// Espelho de ORGANIZATION_TYPES, ORGANIZATION_TYPE_BY_PROFILE,
// INSTITUTION_DOCUMENT_KINDS e REQUIRED_DOCUMENT_KINDS do user-service (há teste).

export const ORGANIZATION_TYPE_LABELS: Record<OrganizationType, string> = {
  associacao: "Associação",
  ong: "ONG",
  instituto: "Instituto",
  fundacao: "Fundação",
  cooperativa: "Cooperativa",
  coletivo: "Coletivo",
  projeto_social: "Projeto social",
  empresa: "Empresa",
  outro: "Outro",
};

export const ORGANIZATION_TYPES = Object.keys(ORGANIZATION_TYPE_LABELS) as OrganizationType[];

/** Subperfil da conta → tipo de organização sugerido na ficha. */
export const ORGANIZATION_TYPE_BY_PROFILE: Partial<Record<ProfileType, OrganizationType>> = {
  associacao: "associacao", ong: "ong", instituto: "instituto", projeto_social: "projeto_social", coletivo: "coletivo",
};

export function defaultOrganizationType(profileType: string | null | undefined): OrganizationType | "" {
  return (profileType && ORGANIZATION_TYPE_BY_PROFILE[profileType as ProfileType]) || "";
}

export const INSTITUTION_DOCUMENT_KIND_LABELS: Record<InstitutionDocumentKind, string> = {
  estatuto: "Estatuto social ou ato constitutivo",
  ata_de_eleicao: "Ata de eleição da diretoria",
  cartao_cnpj: "Cartão CNPJ",
  comprovante_de_endereco: "Comprovante de endereço",
  alvara: "Alvará",
  outro: "Outro documento",
};

export const INSTITUTION_DOCUMENT_KINDS = Object.keys(INSTITUTION_DOCUMENT_KIND_LABELS) as InstitutionDocumentKind[];

/** Documentos exigidos para enviar à validação (o servidor confere no envio). */
export const REQUIRED_DOCUMENT_KINDS: Record<InstitutionKind, InstitutionDocumentKind[]> = {
  agente_transformacao: ["estatuto"],
  poder_publico: [],
};

/** Tipos exigidos que ainda faltam entre os documentos anexados. */
export function missingDocumentKinds(kind: InstitutionKind, attached: { kind: InstitutionDocumentKind }[]): InstitutionDocumentKind[] {
  return REQUIRED_DOCUMENT_KINDS[kind].filter((k) => !attached.some((d) => d.kind === k));
}

// ── Máscaras e validação (espelho do user-service) ─────────

/** Remove pontuação e deixa em maiúsculas (CNPJ alfanumérico da Receita). */
export function normalizeCnpj(value: string): string {
  return value.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 14);
}

function cnpjCheckDigit(base: string): number {
  const weights = base.length === 12
    ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const sum = [...base].reduce((acc, ch, i) => acc + (ch.charCodeAt(0) - 48) * weights[i], 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

/** CNPJ válido (numérico ou alfanumérico), com ou sem máscara. */
export function isValidCnpj(value: string): boolean {
  const cnpj = normalizeCnpj(value);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj)) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;
  const first = cnpjCheckDigit(cnpj.slice(0, 12));
  const second = cnpjCheckDigit(cnpj.slice(0, 12) + first);
  return cnpj.endsWith(`${first}${second}`);
}

/** Máscara progressiva enquanto digita: "112223" → "11.222.3". */
export function maskCnpj(value: string): string {
  const c = normalizeCnpj(value);
  let out = c.slice(0, 2);
  if (c.length > 2) out += `.${c.slice(2, 5)}`;
  if (c.length > 5) out += `.${c.slice(5, 8)}`;
  if (c.length > 8) out += `/${c.slice(8, 12)}`;
  if (c.length > 12) out += `-${c.slice(12, 14)}`;
  return out;
}

export function normalizeCnae(value: string): string {
  return value.replace(/\D/g, "").slice(0, 7);
}

export function isValidCnae(value: string): boolean {
  const code = normalizeCnae(value);
  return /^\d{7}$/.test(code) && code.slice(0, 2) !== "00";
}

/** Máscara progressiva do CNAE: "94308" → "9430-8". */
export function maskCnae(value: string): string {
  const c = normalizeCnae(value);
  let out = c.slice(0, 4);
  if (c.length > 4) out += `-${c.slice(4, 5)}`;
  if (c.length > 5) out += `/${c.slice(5, 7)}`;
  return out;
}

export function normalizeCep(value: string): string {
  return value.replace(/\D/g, "").slice(0, 8);
}

export function isValidCep(value: string): boolean {
  const cep = normalizeCep(value);
  return /^\d{8}$/.test(cep) && cep !== "00000000";
}

export function maskCep(value: string): string {
  const c = normalizeCep(value);
  return c.length > 5 ? `${c.slice(0, 5)}-${c.slice(5)}` : c;
}

export function normalizePhone(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);
  return digits.slice(0, 11);
}

/** Telefone brasileiro com DDD: 10 dígitos (fixo) ou 11 (celular, começa com 9). */
export function isValidPhone(value: string): boolean {
  const phone = normalizePhone(value);
  if (!/^[1-9][1-9]\d{8,9}$/.test(phone)) return false;
  return phone.length === 10 || phone[2] === "9";
}

/** "21987654321" → "(21) 98765-4321"; "2133334444" → "(21) 3333-4444". */
export function maskPhone(value: string): string {
  const d = normalizePhone(value);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  const ddd = `(${d.slice(0, 2)}) `;
  const rest = d.slice(2);
  if (rest.length <= 4) return ddd + rest;
  const split = d.length === 11 ? 5 : 4;
  return `${ddd}${rest.slice(0, split)}-${rest.slice(split)}`;
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(value: string): boolean {
  return value.length <= 255 && EMAIL_RE.test(value.trim());
}

// ── Formulário ─────────────────────────────────────────────

/** Estado do formulário: tudo texto, como o usuário digita. */
export interface InstitutionFormState {
  cnpj: string;
  legalName: string;
  tradeName: string;
  cnaePrimary: string;
  cnaePrimaryDescription: string;
  cnaeSecondary: { code: string; description: string }[];
  governmentSphere: GovernmentSphere | "";
  department: string;
  competenceAreas: string[];
  territory: string;
  cep: string;
  street: string;
  addressNumber: string;
  addressComplement: string;
  district: string;
  municipality: string;
  municipalityIbgeCode: string;
  uf: string;
  institutionalEmail: string;
  institutionalPhone: string;
  website: string;
  organizationType: OrganizationType | "";
  additionalInformation: string;
  representative: {
    fullName: string;
    position: string;
    institutionalEmail: string;
    institutionalPhone: string;
    proofDocumentRef: string;
    proofDescription: string;
  };
}

/** Formulário vazio; o tipo de organização vem sugerido pelo subperfil da conta. */
export function emptyInstitutionForm(profileType?: string | null): InstitutionFormState {
  return {
    cnpj: "", legalName: "", tradeName: "", cnaePrimary: "", cnaePrimaryDescription: "",
    cnaeSecondary: [], governmentSphere: "", department: "", competenceAreas: [], territory: "",
    cep: "", street: "", addressNumber: "", addressComplement: "", district: "", municipality: "",
    municipalityIbgeCode: "", uf: "", institutionalEmail: "", institutionalPhone: "", website: "",
    organizationType: defaultOrganizationType(profileType), additionalInformation: "",
    representative: {
      fullName: "", position: "", institutionalEmail: "", institutionalPhone: "",
      proofDocumentRef: "", proofDescription: "",
    },
  };
}

/**
 * Preenche o formulário com o cadastro salvo (com máscaras). Cadastro salvo
 * antes do tipo de organização recebe a sugestão do subperfil.
 */
export function formFromInstitution(inst: Institution, profileType?: string | null): InstitutionFormState {
  const rep = inst.representative;
  return {
    cnpj: maskCnpj(inst.cnpj ?? ""),
    legalName: inst.legalName ?? "",
    tradeName: inst.tradeName ?? "",
    cnaePrimary: maskCnae(inst.cnaePrimary ?? ""),
    cnaePrimaryDescription: inst.cnaePrimaryDescription ?? "",
    cnaeSecondary: inst.cnaeSecondary.map((c) => ({ code: maskCnae(c.code), description: c.description ?? "" })),
    governmentSphere: inst.governmentSphere ?? "",
    department: inst.department ?? "",
    competenceAreas: [...inst.competenceAreas],
    territory: inst.territory ?? "",
    cep: maskCep(inst.cep ?? ""),
    street: inst.street ?? "",
    addressNumber: inst.addressNumber ?? "",
    addressComplement: inst.addressComplement ?? "",
    district: inst.district ?? "",
    municipality: inst.municipality ?? "",
    municipalityIbgeCode: inst.municipalityIbgeCode ?? "",
    uf: inst.uf ?? "",
    institutionalEmail: inst.institutionalEmail ?? "",
    institutionalPhone: maskPhone(inst.institutionalPhone ?? ""),
    website: inst.website ?? "",
    organizationType: inst.organizationType ?? (inst.kind === "agente_transformacao" ? defaultOrganizationType(profileType) : ""),
    additionalInformation: inst.additionalInformation ?? "",
    representative: {
      fullName: rep?.fullName ?? "",
      position: rep?.position ?? "",
      institutionalEmail: rep?.institutionalEmail ?? "",
      institutionalPhone: maskPhone(rep?.institutionalPhone ?? ""),
      proofDocumentRef: rep?.proofDocumentRef ?? "",
      proofDescription: rep?.proofDescription ?? "",
    },
  };
}

const opt = (value: string): string | null => (value.trim() ? value.trim() : null);

/** Monta o payload do PUT /api/users/me/institution para o tipo de cadastro. */
export function inputFromForm(kind: InstitutionKind, form: InstitutionFormState): InstitutionInput {
  const common = {
    cnpj: normalizeCnpj(form.cnpj),
    legalName: form.legalName.trim(),
    tradeName: opt(form.tradeName),
    territory: opt(form.territory),
    municipality: opt(form.municipality),
    uf: opt(form.uf.toUpperCase()),
    institutionalEmail: opt(form.institutionalEmail),
    institutionalPhone: form.institutionalPhone.trim() ? normalizePhone(form.institutionalPhone) : null,
    website: opt(form.website),
    additionalInformation: opt(form.additionalInformation),
    representative: {
      fullName: form.representative.fullName.trim(),
      position: form.representative.position.trim(),
      institutionalEmail: form.representative.institutionalEmail.trim(),
      institutionalPhone: normalizePhone(form.representative.institutionalPhone),
      proofDocumentRef: opt(form.representative.proofDocumentRef),
      proofDescription: opt(form.representative.proofDescription),
    },
  };
  if (kind === "agente_transformacao") {
    return {
      ...common,
      organizationType: form.organizationType || null,
      cnaePrimary: normalizeCnae(form.cnaePrimary) || null,
      cnaePrimaryDescription: opt(form.cnaePrimaryDescription),
      cnaeSecondary: form.cnaeSecondary
        .filter((c) => normalizeCnae(c.code))
        .map((c): CnaeEntry => ({ code: normalizeCnae(c.code), description: opt(c.description) })),
      cep: normalizeCep(form.cep) || null,
      street: opt(form.street),
      addressNumber: opt(form.addressNumber),
      addressComplement: opt(form.addressComplement),
      district: opt(form.district),
      municipalityIbgeCode: opt(form.municipalityIbgeCode),
    };
  }
  return {
    ...common,
    governmentSphere: form.governmentSphere || null,
    department: opt(form.department),
    competenceAreas: form.competenceAreas.map((a) => a.trim()).filter(Boolean),
  };
}

/**
 * Antecipa no navegador as mesmas regras do user-service, com as mesmas
 * chaves de campo de `fields` (inclusive `representative.*`).
 */
export function validateInstitutionForm(kind: InstitutionKind, form: InstitutionFormState): InstitutionFieldErrors {
  const errors: InstitutionFieldErrors = {};
  const required = (key: string, value: string, label: string) => {
    if (!value.trim()) errors[key] = `${label} é obrigatório`;
  };

  if (!normalizeCnpj(form.cnpj)) errors.cnpj = "CNPJ é obrigatório";
  else if (!isValidCnpj(form.cnpj)) errors.cnpj = "CNPJ inválido: confira os números (dígitos verificadores não conferem)";
  required("legalName", form.legalName, kind === "poder_publico" ? "Órgão ou entidade" : "Razão social");

  if (form.uf.trim() && !/^[A-Za-z]{2}$/.test(form.uf.trim())) errors.uf = "UF inválida";
  if (form.institutionalEmail.trim() && !isValidEmail(form.institutionalEmail)) errors.institutionalEmail = "E-mail institucional inválido";
  if (form.institutionalPhone.trim() && !isValidPhone(form.institutionalPhone)) errors.institutionalPhone = "Telefone inválido (DDD + número)";
  if (form.website.trim() && !/^https?:\/\/\S+\.\S+/.test(form.website.trim())) errors.website = "Site deve começar com http:// ou https://";

  if (form.additionalInformation.trim().length > 4000) errors.additionalInformation = "Informações complementares: até 4000 caracteres";

  if (kind === "agente_transformacao") {
    if (!form.organizationType) errors.organizationType = "Tipo de organização é obrigatório";
    else if (!ORGANIZATION_TYPES.includes(form.organizationType)) errors.organizationType = "Tipo de organização inválido";
    if (!normalizeCnae(form.cnaePrimary)) errors.cnaePrimary = "CNAE principal é obrigatório";
    else if (!isValidCnae(form.cnaePrimary)) errors.cnaePrimary = "CNAE inválido (7 dígitos, ex.: 9430-8/00)";
    else if (!form.cnaePrimaryDescription.trim()) errors.cnaePrimaryDescription = "Descrição do CNAE principal é obrigatória";
    form.cnaeSecondary.forEach((c, i) => {
      if (normalizeCnae(c.code) && !isValidCnae(c.code)) errors[`cnaeSecondary.${i}`] = "CNAE secundário inválido";
    });
    if (!normalizeCep(form.cep)) errors.cep = "CEP é obrigatório";
    else if (!isValidCep(form.cep)) errors.cep = "CEP inválido (8 dígitos)";
    required("street", form.street, "Logradouro");
    required("addressNumber", form.addressNumber, "Número");
    required("district", form.district, "Bairro");
    required("municipality", form.municipality, "Município");
    if (!form.uf.trim() && !errors.uf) errors.uf = "UF é obrigatória";
    if (!form.institutionalEmail.trim() && !form.institutionalPhone.trim()) {
      errors.institutionalContact = "Informe e-mail ou telefone institucional";
    }
  } else {
    if (!form.governmentSphere) errors.governmentSphere = "Escolha a esfera: municipal, estadual ou federal";
    if (form.governmentSphere === "municipal" && !form.municipality.trim()) errors.municipality = "Município é obrigatório na esfera municipal";
    if ((form.governmentSphere === "municipal" || form.governmentSphere === "estadual") && !form.uf.trim() && !errors.uf) {
      errors.uf = "UF é obrigatória nas esferas municipal e estadual";
    }
    required("territory", form.territory, "Território de atuação");
    required("department", form.department, "Secretaria, órgão ou departamento");
    if (form.competenceAreas.filter((a) => a.trim()).length === 0) errors.competenceAreas = "Informe ao menos uma área de atuação ou competência";
  }

  const rep = form.representative;
  required("representative.fullName", rep.fullName, "Nome do representante");
  required("representative.position", rep.position, "Cargo ou função");
  if (!rep.institutionalEmail.trim()) errors["representative.institutionalEmail"] = "E-mail institucional do representante é obrigatório";
  else if (!isValidEmail(rep.institutionalEmail)) errors["representative.institutionalEmail"] = "E-mail institucional do representante inválido";
  if (!normalizePhone(rep.institutionalPhone)) errors["representative.institutionalPhone"] = "Telefone institucional do representante é obrigatório";
  else if (!isValidPhone(rep.institutionalPhone)) errors["representative.institutionalPhone"] = "Telefone institucional do representante inválido";
  return errors;
}

/** Sugestões de CNAE da referência por código ou descrição (sem acento). */
export function cnaeSuggestions(
  reference: { code: string; description: string }[],
  query: string,
  limit = 8,
): { code: string; description: string }[] {
  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const digits = query.replace(/\D/g, "");
  const text = fold(query.trim());
  if (!text) return reference.slice(0, limit);
  return reference
    .filter((item) => (digits && item.code.startsWith(digits)) || fold(item.description).includes(text))
    .slice(0, limit);
}

// ── Estado de validação ────────────────────────────────────

export function institutionCanEdit(status: InstitutionValidationStatus | null | undefined): boolean {
  return !status || INSTITUTION_EDITABLE_STATUSES.includes(status);
}

/** Cores da paleta oficial (manual de marca, §3). */
export const INSTITUTION_STATUS_COLORS: Record<InstitutionValidationStatus, string> = {
  pendente: "#868E96",
  em_analise: "#2E7BA8",
  validada: "#2E9E5B",
  devolvida: "#F4841A",
  revogada: "#E53935",
};

/** O que o titular precisa saber (e fazer) em cada estado. */
export const INSTITUTION_STATUS_GUIDANCE: Record<InstitutionValidationStatus, string> = {
  pendente: "O cadastro está salvo como rascunho. Revise os dados e envie para validação quando estiver completo.",
  em_analise: "A equipe do DM Conecta está conferindo os dados. Enquanto a análise acontece, o cadastro não pode ser editado.",
  validada: "A instituição foi validada e o selo aparece no seu perfil público. Para alterar os dados, peça a revisão à equipe do DM Conecta.",
  devolvida: "A equipe devolveu o cadastro para ajustes. Leia o parecer, corrija os dados e envie novamente.",
  revogada: "A validação foi revogada. Leia o parecer, atualize os dados e envie novamente para uma nova análise.",
};

export const INSTITUTION_EVENT_ACTOR_LABELS = { titular: "Você", gestao: "Equipe DM Conecta" } as const;

// ── Requisito por perfil (decisões 2 e 3) ──────────────────

export interface InstitutionRequirement {
  kind: InstitutionKind;
  title: string;
  message: string;
  /** Bloqueia ações até a validação (Poder Público) ou só informa (Agente). */
  blocking: boolean;
}

/**
 * Texto do requisito institucional para o perfil, ou `null` quando a conta
 * não precisa de cadastro ou já está validada.
 */
export function institutionRequirement(
  role: string | null | undefined,
  profileType: string | null | undefined,
  status: InstitutionValidationStatus | null | undefined,
  /** Vínculo ativo (T29): quem atua por delegação não precisa de cadastro próprio. */
  delegated = false,
): InstitutionRequirement | null {
  const kind = institutionKindFor(role, profileType);
  if (!kind || status === "validada" || delegated) return null;
  const waiting = status === "em_analise";
  if (kind === "poder_publico") {
    return {
      kind,
      blocking: true,
      title: waiting ? "Cadastro institucional em análise" : "Valide o cadastro institucional do órgão",
      message: waiting
        ? "Publicar, comentar, apoiar e solicitar conexões ficam disponíveis assim que a equipe validar o órgão e o representante."
        : "O Poder Público atua na plataforma depois da validação do órgão e do representante. Até lá, você acompanha demandas e o mapa normalmente.",
    };
  }
  const linked = normalizeRole(role, profileType) === "agent" && LINKED_AGENT_PROFILES.includes(profileType as ProfileType);
  if (linked) {
    const label = PROFILE_LABELS[profileType as ProfileType];
    return {
      kind,
      blocking: false,
      title: waiting ? "Instituição em análise" : "Vincule seu perfil a uma instituição com CNPJ",
      message: waiting
        ? `Como ${label}, você publica demandas assim que a instituição vinculada ao seu perfil for validada.`
        : `Como ${label}, você participa normalmente. Para publicar demandas, informe a instituição com CNPJ + CNAE à qual você está vinculado; ela passa pela validação da equipe.`,
    };
  }
  return {
    kind,
    blocking: false,
    title: waiting ? "Cadastro institucional em análise" : "Complete o cadastro institucional",
    message: waiting
      ? "A equipe do DM Conecta está validando CNPJ e CNAE. A publicação de demandas depende dessa validação."
      : "Para publicar demandas, o Agente de Transformação precisa de cadastro institucional com CNPJ + CNAE validado pela equipe.",
  };
}

// ── 403 institution_not_validated ──────────────────────────

export const INSTITUTION_NOT_VALIDATED = "institution_not_validated";

/** Erro de API (ApiError ou InstitutionRequestError) com o código do gate. */
export function isInstitutionNotValidated(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as { code?: unknown }).code === INSTITUTION_NOT_VALIDATED);
}

export type GatedAction =
  | "publicar" | "editar" | "comentar" | "apoiar" | "conectar"
  | "enviar_demanda" | "mover_demanda" | "atuar" | "interesse";

const GATED_ACTION_TEXT: Record<GatedAction, string> = {
  publicar: "publicar",
  editar: "editar esta publicação",
  comentar: "comentar",
  apoiar: "registrar apoio",
  conectar: "solicitar conexões",
  enviar_demanda: "enviar a demanda para análise",
  mover_demanda: "atualizar o andamento da demanda",
  atuar: "responder, acompanhar e apoiar as demandas do território",
  interesse: "filtrar oportunidades de apoio e demonstrar interesse",
};

/**
 * Mensagem amigável para o 403, conforme o estado do cadastro. `kind` diz de
 * quem é o cadastro: o órgão do Poder Público (padrão) ou a instituição com
 * CNPJ + CNAE do Agente de Transformação.
 */
export function institutionGateMessage(
  action: GatedAction,
  status: InstitutionValidationStatus | null | undefined,
  kind: InstitutionKind = "poder_publico",
): string {
  const what = GATED_ACTION_TEXT[action];
  const agent = kind === "agente_transformacao";
  const subject = agent ? "a instituição (CNPJ + CNAE)" : "o órgão";
  switch (status) {
    case "em_analise":
      return `Seu cadastro institucional está em análise. Você poderá ${what} assim que a equipe validar ${subject}.`;
    case "devolvida":
      return `Para ${what}, ajuste o cadastro institucional conforme o parecer da equipe e envie de novo.`;
    case "revogada":
      return `A validação institucional foi revogada. Para ${what}, atualize o cadastro e envie para nova análise.`;
    case "pendente":
      return `Para ${what}, envie o cadastro institucional ${agent ? "da instituição" : "do órgão"} para validação.`;
    default:
      return agent
        ? `Para ${what}, o Agente de Transformação precisa de cadastro institucional com CNPJ + CNAE validado. Faça o cadastro da instituição.`
        : `Para ${what}, o Poder Público precisa de cadastro institucional validado. Faça o cadastro do órgão e do representante.`;
  }
}

/** Status que acompanha o 403 (campo `validationStatus`), quando houver. */
export function gateStatusFrom(err: unknown): InstitutionValidationStatus | null {
  const value = err && typeof err === "object" ? (err as { validationStatus?: unknown }).validationStatus : null;
  return typeof value === "string" ? (value as InstitutionValidationStatus) : null;
}

/** Acesso vazio (sem sessão, sem cadastro): usado enquanto carrega. */
export const NO_INSTITUTION_ACCESS: InstitutionAccess = { kind: null, status: null, requiredKind: null, canActInstitutionally: false, delegation: null };

// ── Dados públicos ─────────────────────────────────────────

type RawRecord = Record<string, unknown>;
const str = (v: unknown): string | null => (v == null || v === "" ? null : String(v));

/** Projeção pública do user-service (GET /:userId/institution) → modelo do app. */
export function mapPublicInstitutionRecord(r: RawRecord): PublicInstitution {
  return {
    kind: r.institution_kind as InstitutionKind,
    cnpj: String(r.cnpj ?? ""),
    legalName: String(r.legal_name ?? ""),
    tradeName: str(r.trade_name),
    cnaePrimary: str(r.cnae_primary),
    cnaePrimaryDescription: str(r.cnae_primary_description),
    cnaeSecondary: Array.isArray(r.cnae_secondary)
      ? r.cnae_secondary.map((item) => ({ code: String((item as RawRecord).code ?? ""), description: str((item as RawRecord).description) }))
      : [],
    governmentSphere: str(r.government_sphere) as GovernmentSphere | null,
    department: str(r.department),
    competenceAreas: Array.isArray(r.competence_areas) ? r.competence_areas.map(String) : [],
    territory: str(r.territory),
    municipality: str(r.municipality),
    uf: str(r.uf),
    website: str(r.website),
    validatedAt: str(r.validation_reviewed_at),
    organizationType: (str(r.organization_type) as OrganizationType | null),
  };
}

/** Só links http(s) viram âncora no perfil público. */
export function safeWebsite(value: string | null | undefined): string | null {
  return value && /^https?:\/\/\S+\.\S+/.test(value) ? value : null;
}
