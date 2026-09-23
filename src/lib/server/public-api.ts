export type PublicService = "posts" | "users";

export type ServerApiEnv = {
  internalPosts?: string | null;
  internalUsers?: string | null;
  publicApi?: string | null;
  production: boolean;
  demoAllowed: boolean;
};

const REVALIDATE_SECONDS = 60;
export const MAX_PUBLIC_LIST_LIMIT = 5000;

export function resolveServerApiBase(service: PublicService, env: ServerApiEnv): string | null {
  const internal = service === "posts" ? env.internalPosts : env.internalUsers;
  const candidate = (internal ?? "").trim() || (env.publicApi ?? "").trim();
  return candidate.replace(/\/$/, "") || null;
}

export function publicFallback<T>({
  production,
  demoAllowed,
  demoValue,
}: {
  production: boolean;
  demoAllowed: boolean;
  demoValue: T;
}): T | [] {
  void production;
  void demoAllowed;
  void demoValue;
  return [];
}

export function readServerApiEnv(): ServerApiEnv {
  const production = process.env.NEXT_PUBLIC_RUNTIME_ENV === "production";
  return {
    internalPosts: process.env.DM_INTERNAL_POST_API_URL,
    internalUsers: process.env.DM_INTERNAL_USER_API_URL,
    publicApi: process.env.NEXT_PUBLIC_API_URL,
    production,
    demoAllowed: false,
  };
}

function joinUrl(base: string, service: PublicService, path: string, internal: boolean): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return internal ? `${base}${suffix}` : `${base}/api/${service}${suffix}`;
}

export async function requestPublicJson<T>(
  service: PublicService,
  path: string,
): Promise<T | null> {
  const env = readServerApiEnv();
  const internal = service === "posts" ? env.internalPosts : env.internalUsers;
  const base = resolveServerApiBase(service, env);
  if (!base) return null;

  const url = joinUrl(base, service, path, Boolean(internal?.trim()));

  try {
    const response = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}
