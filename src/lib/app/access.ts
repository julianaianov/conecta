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

export const PRIVATE_PATH_PREFIXES = [
  "/admin",
  "/meus-apoios",
  "/perfil",
  "/conexoes/nova",
  "/conexoes/",
  "/post/",
] as const;

export const NOINDEX_EXACT_PATHS = [
  "/perfil",
  "/login",
  "/register",
  "/recuperar-senha",
  "/criar",
] as const;

export function loginHref(pathname: string): string {
  return `/login?next=${encodeURIComponent(pathname)}`;
}

export function isIndexablePath(pathname: string): boolean {
  if (NOINDEX_EXACT_PATHS.includes(pathname as (typeof NOINDEX_EXACT_PATHS)[number])) {
    return false;
  }

  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/meus-apoios") ||
    pathname.startsWith("/conexoes/nova") ||
    pathname.startsWith("/conexoes/") ||
    pathname.startsWith("/post/") && pathname.split("/").length !== 3
  ) {
    return false;
  }

  if (pathname === "/perfil" || pathname.startsWith("/perfil/")) {
    return pathname.split("/").length === 3;
  }

  return PUBLIC_INDEXABLE_PATHS.some(
    (path) => path === pathname || (path !== "/" && pathname.startsWith(`${path}/`)),
  );
}
