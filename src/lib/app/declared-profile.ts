/**
 * Perfis declarados (T-04-03; decisão 18): perfil empresarial do Parceiro
 * (Arquitetura de Perfis §3.3) e perfil profissional ou institucional da
 * Comunicação (§3.5). Espelho de `services/user-service/src/declared-profiles.js`
 * (há teste que compara as chaves de erro). Informados pela própria conta,
 * sem validação da gestão e sem selo.
 */
import { isValidCnpj, normalizeCnpj } from "./institution.ts";
import {
  normalizeRole,
  type BusinessProfile,
  type DeclaredProfileKind,
  type MediaProfile,
} from "./types.ts";

export const DECLARATION_NOTICE = "informado pela própria conta";

export const DECLARED_PROFILE_TITLES: Record<DeclaredProfileKind, string> = {
  empresarial: "Perfil empresarial",
  comunicacao: "Perfil profissional ou institucional",
};

/** Tipo de perfil declarado da categoria da conta (`null`: não se aplica). */
export function declaredKindFor(role: string | null | undefined, profileType?: string | null): DeclaredProfileKind | null {
  const normalized = normalizeRole(role, profileType);
  if (normalized === "partner") return "empresarial";
  if (normalized === "media") return "comunicacao";
  return null;
}

export interface DeclaredProfileField {
  key: string;
  label: string;
  max: number;
  required?: boolean;
  multiline?: boolean;
  hint?: string;
  placeholder?: string;
}

export const DECLARED_PROFILE_FIELDS: Record<DeclaredProfileKind, DeclaredProfileField[]> = {
  empresarial: [
    { key: "companyName", label: "Nome da empresa ou razão social", max: 255, required: true },
    { key: "cnpj", label: "CNPJ", max: 18, hint: "Opcional. Aparece no perfil público.", placeholder: "00.000.000/0000-00" },
    { key: "segment", label: "Segmento", max: 120, placeholder: "Ex.: alimentação, construção, varejo" },
    { key: "description", label: "Sobre a empresa", max: 2000, multiline: true },
    { key: "website", label: "Site", max: 500, placeholder: "https://" },
  ],
  comunicacao: [
    { key: "outletName", label: "Veículo ou instituição", max: 255, required: true },
    { key: "professionalRegistry", label: "Registro profissional", max: 60, hint: "Opcional e privado: só você e a equipe da plataforma veem.", placeholder: "Ex.: MTb 00000" },
    { key: "coverageArea", label: "Área de cobertura", max: 255, placeholder: "Ex.: Zona Oeste, município, região" },
    { key: "description", label: "Sobre o trabalho", max: 2000, multiline: true },
    { key: "website", label: "Site", max: 500, placeholder: "https://" },
  ],
};

export type DeclaredProfileForm = Record<string, string>;

export function formFromDeclaredProfile(kind: DeclaredProfileKind, profile: BusinessProfile | MediaProfile | null): DeclaredProfileForm {
  const source = (profile ?? {}) as unknown as Record<string, unknown>;
  return Object.fromEntries(DECLARED_PROFILE_FIELDS[kind].map((f) => [f.key, source[f.key] == null ? "" : String(source[f.key])]));
}

/** Payload do PUT: textos aparados, vazio vira `null`, CNPJ sem máscara. */
export function inputFromDeclaredForm(kind: DeclaredProfileKind, form: DeclaredProfileForm): Record<string, string | null> {
  return Object.fromEntries(DECLARED_PROFILE_FIELDS[kind].map((f) => {
    const raw = (form[f.key] ?? "").trim();
    if (f.key === "cnpj") return [f.key, normalizeCnpj(raw) || null];
    return [f.key, raw || null];
  }));
}

/** Antecipa as regras do user-service, com as mesmas chaves de `fields`. */
export function validateDeclaredForm(kind: DeclaredProfileKind, form: DeclaredProfileForm): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of DECLARED_PROFILE_FIELDS[kind]) {
    const value = (form[f.key] ?? "").trim();
    if (f.required && !value) errors[f.key] = `${f.label} é obrigatório`;
    else if (f.key !== "cnpj" && value.length > f.max) errors[f.key] = `${f.label}: até ${f.max} caracteres`;
  }
  const cnpj = (form.cnpj ?? "").trim();
  if (kind === "empresarial" && cnpj && !isValidCnpj(cnpj)) errors.cnpj = "CNPJ inválido (dígitos verificadores não conferem)";
  const website = (form.website ?? "").trim();
  if (website && !/^https?:\/\/\S+\.\S+/.test(website)) errors.website = "Site deve começar com http:// ou https://";
  return errors;
}
