/** Rotas que visitantes podem descobrir e ler sem sessão. */
export const PUBLIC_INDEXABLE_PATHS = [
  "/",
  "/feed",
  "/mapa",
  "/ranking",
  "/conexoes",
  "/post",
  "/perfil",
  "/politica-de-privacidade",
  "/seguranca-infantil",
] as const;

/** Prefixos reservados a fluxos privados ou operacionais. */
export const PRIVATE_PATH_PREFIXES = [
  "/admin",
  "/meus-apoios",
  "/conexoes/nova",
  "/conexoes/",
  "/cadastro-institucional",
  "/pautas",
  "/vinculos",
  "/processos",
  "/notificacoes",
] as const;

/** Rotas de sessão e de ação que nunca devem entrar no índice. */
export const NOINDEX_EXACT_PATHS = [
  "/perfil",
  "/perfil/editar",
  "/login",
  "/register",
  "/recuperar-senha",
  "/criar",
] as const;

function normalizePathname(pathname: string): string {
  const withoutQuery = pathname.split(/[?#]/, 1)[0] || "/";
  if (withoutQuery.length > 1) return withoutQuery.replace(/\/+$/, "");
  return withoutQuery;
}

export function loginHref(pathname: string): string {
  return `/login?next=${encodeURIComponent(pathname)}`;
}

export type ProtectedAction = "create-post" | "comment" | "reaction" | "support" | "connection" | "profile-write";

export function actionRequiresAuth(action: ProtectedAction | "read-post"): boolean {
  return action !== "read-post";
}

export function isIndexablePath(pathname: string): boolean {
  const path = normalizePathname(pathname);

  if (NOINDEX_EXACT_PATHS.includes(path as (typeof NOINDEX_EXACT_PATHS)[number])) return false;
  if (PRIVATE_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) return false;
  if (path.startsWith("/admin") || path.startsWith("/meus-apoios")) return false;
  if (path.startsWith("/post/") && path.split("/").length === 4 && path.endsWith("/apoiar")) return false;
  if (path.startsWith("/post/") && path.split("/").length !== 3) return false;
  if (path.startsWith("/perfil/") && path.split("/").length !== 3) return false;

  return PUBLIC_INDEXABLE_PATHS.some((publicPath) => {
    if (publicPath === "/") return path === "/";
    return path === publicPath || path.startsWith(`${publicPath}/`);
  });
}
