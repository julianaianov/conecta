/**
 * Vínculo de usuários a organizações e permissões delegadas (T29). Espelho
 * puro de services/user-service/src/organization-members.js
 * (organization.test.mjs compara). Fonte: Arquitetura de Perfis §4 e §5.
 */
import type { InstitutionAccess, InstitutionKind, User, UserRole } from "./types.ts";
import { normalizeRole } from "./types.ts";

export const MEMBERSHIPS_PATH = "/vinculos";
export const TEAM_PATH = "/cadastro-institucional/equipe";

export type OrganizationMemberLevel = "gestor" | "publicador" | "colaborador";
export const MEMBER_LEVELS: OrganizationMemberLevel[] = ["gestor", "publicador", "colaborador"];
export const MEMBER_LEVEL_LABELS: Record<OrganizationMemberLevel, string> = {
  gestor: "Gestor",
  publicador: "Publicador",
  colaborador: "Colaborador",
};

export type DelegatedPermission =
  | "gerir_vinculos" | "publicar_demandas" | "publicar_eventos" | "atuar_institucionalmente"
  | "atualizar_resultados" | "ver_documentos";
export const DELEGATED_PERMISSIONS: DelegatedPermission[] = [
  "gerir_vinculos", "publicar_demandas", "publicar_eventos", "atuar_institucionalmente",
  "atualizar_resultados", "ver_documentos",
];
export const DELEGATED_PERMISSION_LABELS: Record<DelegatedPermission, string> = {
  gerir_vinculos: "Convidar, mudar o nível e remover pessoas da equipe",
  publicar_demandas: "Publicar e gerir demandas em nome da instituição",
  publicar_eventos: "Publicar eventos e ações em nome da instituição",
  atuar_institucionalmente: "Responder, encaminhar e apoiar como o órgão (Poder Público)",
  atualizar_resultados: "Atualizar andamento, resultados e prestação de contas",
  ver_documentos: "Ver documentos, dossiês e o andamento interno",
};
export const LEVEL_PERMISSIONS: Record<OrganizationMemberLevel, DelegatedPermission[]> = {
  gestor: ["gerir_vinculos", "publicar_demandas", "publicar_eventos", "atuar_institucionalmente", "atualizar_resultados", "ver_documentos"],
  publicador: ["publicar_demandas", "publicar_eventos", "atuar_institucionalmente", "atualizar_resultados", "ver_documentos"],
  colaborador: ["ver_documentos"],
};

export type MembershipStatus = "convidado" | "ativo" | "recusado" | "removido" | "saiu";
export const MEMBERSHIP_STATUSES: MembershipStatus[] = ["convidado", "ativo", "recusado", "removido", "saiu"];
export const MEMBERSHIP_STATUS_LABELS: Record<MembershipStatus, string> = {
  convidado: "Convite enviado",
  ativo: "Vínculo ativo",
  recusado: "Convite recusado",
  removido: "Removido da equipe",
  saiu: "Saiu da equipe",
};
export const MEMBERSHIP_STATUS_COLORS: Record<MembershipStatus, string> = {
  convidado: "#f4841a",
  ativo: "#2e9e5b",
  recusado: "#868e96",
  removido: "#868e96",
  saiu: "#868e96",
};
export const MEMBERSHIP_TRANSITIONS: Record<MembershipStatus, MembershipStatus[]> = {
  convidado: ["ativo", "recusado"],
  ativo: ["removido", "saiu"],
  recusado: [],
  removido: [],
  saiu: [],
};

/** Níveis que agem publicamente em nome da instituição. */
export const PUBLIC_ACTING_LEVELS: OrganizationMemberLevel[] = ["gestor", "publicador"];

export function permissionsFor(level: string | null | undefined): DelegatedPermission[] {
  return level && level in LEVEL_PERMISSIONS ? [...LEVEL_PERMISSIONS[level as OrganizationMemberLevel]] : [];
}

export function hasDelegatedPermission(access: InstitutionAccess | null | undefined, permission: DelegatedPermission): boolean {
  return Boolean(access?.delegation?.permissions.includes(permission));
}

/** Papel que a delegação empresta: Agente ou Poder Público (espelho de post-service src/delegation.js). */
export function delegatedRole(access: InstitutionAccess | null | undefined): UserRole | null {
  const delegation = access?.delegation;
  if (!delegation) return null;
  const rules: { role: UserRole; kind: InstitutionKind; permission: DelegatedPermission }[] = [
    { role: "agent", kind: "agente_transformacao", permission: "publicar_demandas" },
    { role: "government", kind: "poder_publico", permission: "atuar_institucionalmente" },
  ];
  const rule = rules.find((r) => r.kind === access?.kind && delegation.permissions.includes(r.permission));
  return rule ? rule.role : null;
}

/** Papel efetivo da conta: o próprio quando já é Agente/Poder Público; senão o delegado; senão o próprio. */
export function effectiveRole(user: Pick<User, "role" | "profileType"> | null | undefined, access: InstitutionAccess | null | undefined): UserRole | null {
  if (!user) return null;
  const own = normalizeRole(user.role, user.profileType);
  if (own === "agent" || own === "government") return own;
  return delegatedRole(access) ?? own;
}

/** A conta administra a equipe de uma instituição (titular do cadastro ou gestor por vínculo)? */
export function managesTeam(access: InstitutionAccess | null | undefined): boolean {
  if (!access?.kind) return false;
  if (!access.delegation) return true;
  return hasDelegatedPermission(access, "gerir_vinculos");
}

/** Mensagem a partir de um erro das rotas de vínculo. */
export function membershipErrorMessage(err: unknown, fallback = "Não foi possível salvar agora. Tente de novo."): string {
  if (err instanceof Error) {
    if (err.message === "network" || err.message === "timeout") return "Sem conexão com o servidor. Confira a internet e tente de novo.";
    const code = (err as { code?: unknown }).code;
    if (code === "not_organization_manager") return "A equipe é gerida pelo titular do cadastro institucional ou por um gestor.";
    if (code === "member_has_own_institution") return "Esta conta tem cadastro institucional próprio.";
    if (code === "member_already_linked") return "Esta conta já atua em nome de outra instituição.";
    if (code === "member_invite_exists") return "Já há um convite em aberto para esta conta.";
    if (code === "member_is_self") return "Você já faz parte da instituição.";
    if (code === "member_closed") return "Este vínculo já foi encerrado.";
    if (code === "membership_state") return "Este convite ou vínculo mudou de estado; recarregue.";
    if (err.message) return err.message;
  }
  return fallback;
}
