/**
 * Edição do perfil pelo titular (W36): Arquitetura de Perfis §3.1 ("Criar e
 * gerenciar perfil") e §3.2 a §3.5 ("Criar perfil"); Apresentação
 * Institucional, slides 7 e 8. Módulo puro: campos, máscaras, validação
 * espelhada do user-service (`services/user-service/src/profile-edit.js`, há
 * teste que compara chaves e mensagens), conversão formulário ↔ API e textos
 * por categoria. A validação que vale é a do servidor (erros em `fields`); a
 * daqui só antecipa o aviso ao titular.
 *
 * LGPD: telefone e estado são privados (nunca saem na rota pública do
 * perfil); o formulário diz, campo a campo, o que aparece para os outros.
 */
import { INSTITUTION_HUB_PATH, maskPhone } from "./institution.ts";
import { UFS } from "./interest.ts";
import { type Profile, type UserRole } from "./types.ts";

export const PROFILE_PATH = "/perfil";
export const PROFILE_EDIT_PATH = "/perfil/editar";

/** O perfil do próprio titular: a leitura pública não traz telefone nem estado. */
export interface OwnProfile extends Profile {
  phone: string | null;
  state: string | null;
}

export type ProfileFieldKey = "name" | "bio" | "avatarUrl" | "neighborhood" | "city" | "state" | "phone" | "website";

/** Corpo do `POST /api/users/me`: só os campos enviados mudam; `null` limpa o campo. */
export type ProfileUpdateInput = {
  name?: string;
  bio?: string | null;
  avatarUrl?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
  website?: string | null;
};

export type ProfileVisibility = "publico" | "privado";

export const PROFILE_VISIBILITY_LABELS: Record<ProfileVisibility, string> = {
  publico: "Aparece no perfil público",
  privado: "Não aparece no perfil público",
};

export interface ProfileFieldSpec {
  key: ProfileFieldKey;
  label: string;
  max: number;
  visibility: ProfileVisibility;
  required?: boolean;
  multiline?: boolean;
  /** Nome e apresentação trazem a dica da categoria (`PROFILE_GUIDES`). */
  hint?: string;
  placeholder?: string;
}

/** Mesma ordem e mesmos limites do user-service (`PROFILE_FIELDS`). */
export const PROFILE_FIELDS: ProfileFieldSpec[] = [
  { key: "name", label: "Nome", max: 255, required: true, visibility: "publico" },
  { key: "bio", label: "Apresentação", max: 500, multiline: true, visibility: "publico" },
  { key: "avatarUrl", label: "Link da foto", max: 500, visibility: "publico", placeholder: "https://", hint: "Link https de uma imagem. Sem foto, o perfil mostra as iniciais do nome." },
  { key: "neighborhood", label: "Bairro", max: 255, visibility: "publico" },
  { key: "city", label: "Cidade", max: 100, visibility: "publico" },
  { key: "state", label: "Estado", max: 2, visibility: "privado", hint: "Sigla da UF." },
  { key: "phone", label: "Telefone", max: 50, visibility: "privado", placeholder: "(00) 00000-0000", hint: "Opcional, com DDD. Não aparece no perfil público." },
  { key: "website", label: "Site", max: 500, visibility: "publico", placeholder: "https://" },
];

export const PROFILE_FIELD_BY_KEY = Object.fromEntries(PROFILE_FIELDS.map((f) => [f.key, f])) as Record<ProfileFieldKey, ProfileFieldSpec>;

export interface ProfileFieldGroup {
  id: string;
  title: string;
  description: string;
  keys: ProfileFieldKey[];
}

/** Blocos do formulário (a ordem de leitura de quem preenche pela primeira vez). */
export const PROFILE_FIELD_GROUPS: ProfileFieldGroup[] = [
  { id: "identificacao", title: "Identificação", description: "O que as pessoas veem primeiro no seu perfil.", keys: ["name", "bio", "avatarUrl"] },
  { id: "territorio", title: "Onde você atua", description: "Bairro e cidade aparecem no perfil e ajudam parceiros e órgãos a localizar a atuação.", keys: ["neighborhood", "city", "state"] },
  { id: "contato", title: "Contato", description: "O telefone não aparece no perfil público; o site aparece.", keys: ["phone", "website"] },
];

export interface ProfileGuide {
  /** Frase de abertura da tela, para a categoria da conta. */
  intro: string;
  nameHint: string;
  bioHint: string;
  /** Onde ficam os dados que não são do perfil (ficha institucional, perfil empresarial...). */
  related?: { text: string; href?: string; linkLabel?: string };
}

/**
 * O que cada uma das cinco categorias preenche aqui (Arquitetura de Perfis
 * §3.1 a §3.5). Categoria e subperfil nascem no cadastro e não mudam nesta tela.
 */
export const PROFILE_GUIDES: Record<UserRole, ProfileGuide> = {
  agent: {
    intro: "Apresente a atuação da sua associação, ONG, coletivo ou liderança. É o que parceiros e órgãos públicos veem antes de se conectar.",
    nameHint: "Nome da associação, ONG, coletivo ou da pessoa que atua no território.",
    bioHint: "O que fazem, onde atuam e quem ajudam.",
    related: { text: "CNPJ, endereço e representante ficam no cadastro institucional.", href: INSTITUTION_HUB_PATH, linkLabel: "Abrir o cadastro institucional" },
  },
  member: {
    intro: "Conte quem você é no território e como participa: apoiando, acompanhando iniciativas ou como voluntário.",
    nameHint: "Como você quer ser identificado nas conexões e nos apoios.",
    bioHint: "Quem você é e o que gostaria de fortalecer no seu bairro.",
  },
  partner: {
    intro: "Apresente a empresa, a marca ou o comércio para os Agentes de Transformação e para a comunidade.",
    nameHint: "Nome da empresa, marca ou comércio, ou de quem responde por ela.",
    bioHint: "O que a empresa oferece: recursos, produtos, serviços, conhecimento, estrutura ou investimento.",
    related: { text: "CNPJ e segmento ficam no perfil empresarial, na página do seu perfil." },
  },
  government: {
    intro: "Apresente o órgão ou a área de atuação. A atuação institucional exige o cadastro institucional validado.",
    nameHint: "Nome do órgão, da secretaria ou de quem o representa.",
    bioHint: "Competência, território atendido e programas ou serviços.",
    related: { text: "Esfera, CNPJ e representante ficam no cadastro institucional.", href: INSTITUTION_HUB_PATH, linkLabel: "Abrir o cadastro institucional" },
  },
  media: {
    intro: "Apresente o veículo ou o seu trabalho. É o que Agentes e parceiros veem ao receber uma divulgação.",
    nameHint: "Nome do veículo ou do profissional.",
    bioHint: "Linha editorial, território coberto e tipo de pauta.",
    related: { text: "Registro profissional e área de cobertura ficam no perfil profissional, na página do seu perfil." },
  },
};

// ── Formulário ─────────────────────────────────────────────

/** Estado do formulário: tudo texto, como a pessoa digita. */
export type ProfileForm = Record<ProfileFieldKey, string>;

export function emptyProfileForm(): ProfileForm {
  return { name: "", bio: "", avatarUrl: "", neighborhood: "", city: "", state: "", phone: "", website: "" };
}

/** Formulário a partir do perfil gravado (telefone com máscara; estado só se for UF). */
export function formFromProfile(profile: OwnProfile | null): ProfileForm {
  if (!profile) return emptyProfileForm();
  const state = (profile.state ?? "").trim().toUpperCase();
  return {
    name: profile.name ?? "",
    bio: profile.bio ?? "",
    avatarUrl: profile.avatarUrl ?? "",
    neighborhood: profile.neighborhood ?? "",
    city: profile.city ?? "",
    state: UFS.includes(state) ? state : "",
    phone: profile.phone ? maskPhone(profile.phone) : "",
    website: profile.website ?? "",
  };
}

/** Payload do POST: textos aparados, vazio vira `null` (limpa), telefone sem máscara, UF em maiúsculas. */
export function inputFromProfileForm(form: ProfileForm): ProfileUpdateInput {
  const text = (key: ProfileFieldKey) => (form[key] ?? "").trim();
  const optional = (key: ProfileFieldKey) => text(key) || null;
  return {
    name: text("name"),
    bio: optional("bio"),
    avatarUrl: optional("avatarUrl"),
    neighborhood: optional("neighborhood"),
    city: optional("city"),
    state: text("state").toUpperCase() || null,
    phone: phoneDigits(text("phone")) || null,
    website: optional("website"),
  };
}

/** Há diferença entre o formulário e o que está gravado? */
export function isProfileFormDirty(form: ProfileForm, saved: ProfileForm): boolean {
  return JSON.stringify(inputFromProfileForm(form)) !== JSON.stringify(inputFromProfileForm(saved));
}

/** Dígitos do telefone, sem o DDI 55 (mesma regra do servidor: sem corte de tamanho). */
function phoneDigits(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.length > 11 && digits.startsWith("55") ? digits.slice(2) : digits;
}

/** Telefone brasileiro com DDD: 10 dígitos (fixo) ou 11 (celular, começa com 9). */
function isValidProfilePhone(value: string): boolean {
  const phone = phoneDigits(value);
  if (!/^[1-9][1-9]\d{8,9}$/.test(phone)) return false;
  return phone.length === 10 || phone[2] === "9";
}

// A foto é um link https sem usuário e senha embutidos (como a foto do evento).
function isHttpsUrl(text: string): boolean {
  try {
    const url = new URL(text);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Foto que o `Avatar` pode mostrar agora: só link https válido. */
export function avatarPreviewUrl(value: string): string | null {
  const text = value.trim();
  return text && isHttpsUrl(text) ? text : null;
}

function fieldProblem(field: ProfileFieldSpec, text: string): string | null {
  if (text.includes("\u0000")) return `${field.label}: caracteres inválidos`;
  if (field.key === "state") return UFS.includes(text.toUpperCase()) ? null : "Estado: informe a sigla da UF (ex.: RJ)";
  if (text.length > field.max) return `${field.label}: até ${field.max} caracteres`;
  if (field.key === "avatarUrl" && !isHttpsUrl(text)) return "Link da foto deve começar com https://";
  if (field.key === "website" && !/^https?:\/\/\S+\.\S+/.test(text)) return "Site deve começar com http:// ou https://";
  if (field.key === "phone" && !isValidProfilePhone(text)) return "Telefone: informe o DDD e o número (10 ou 11 dígitos)";
  return null;
}

/** Antecipa as regras do user-service, com as mesmas chaves e mensagens de `fields`. */
export function validateProfileForm(form: ProfileForm): Partial<Record<ProfileFieldKey, string>> {
  const errors: Partial<Record<ProfileFieldKey, string>> = {};
  for (const field of PROFILE_FIELDS) {
    const text = (form[field.key] ?? "").trim();
    if (!text) {
      if (field.required) errors[field.key] = `${field.label} é obrigatório`;
      continue;
    }
    const problem = fieldProblem(field, text);
    if (problem) errors[field.key] = problem;
  }
  return errors;
}

/** Primeiro campo com erro, na ordem do formulário (para devolver o foco). */
export function firstProfileErrorKey(errors: Partial<Record<string, string>>): ProfileFieldKey | null {
  return PROFILE_FIELDS.find((field) => errors[field.key])?.key ?? null;
}

/** Erros por campo do servidor, só das chaves do formulário. */
export function profileFieldErrors(fields: Record<string, string> | undefined): Partial<Record<ProfileFieldKey, string>> {
  const errors: Partial<Record<ProfileFieldKey, string>> = {};
  for (const field of PROFILE_FIELDS) {
    const message = fields?.[field.key];
    if (message) errors[field.key] = message;
  }
  return errors;
}

/** Mensagem a partir de um erro das rotas do perfil. */
export function profileErrorMessage(err: unknown, fallback = "Não foi possível salvar agora. Tente de novo."): string {
  if (err instanceof Error) {
    if (err.message === "network" || err.message === "timeout") return "Sem conexão com o servidor. Confira a internet e tente de novo.";
    const status = (err as { status?: unknown }).status;
    if (status === 401) return "Sua sessão expirou. Entre de novo para salvar o perfil.";
    if (status === 404) return "Perfil não encontrado. Saia e entre de novo na conta.";
    if (err.message) return err.message;
  }
  return fallback;
}
