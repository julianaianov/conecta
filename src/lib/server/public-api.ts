export type PublicService = "posts" | "users";

export interface ServerApiEnv {
  internalPosts?: string | null;
  internalUsers?: string | null;
  publicApi?: string | null;
  production: boolean;
}

export const PUBLIC_DATA_REVALIDATE_SECONDS = 60;
export const MAX_PUBLIC_LIST_LIMIT = 5000;

export function resolveServerApiBase(service: PublicService, env: ServerApiEnv): string | null {
  const internal = service === "posts" ? env.internalPosts : env.internalUsers;
  return (internal ?? env.publicApi ?? "").trim().replace(/\/+$/, "") || null;
}

export function boundedPublicLimit(value: number | undefined, fallback = 20): number {
  const parsed = Number.isFinite(value) ? Math.trunc(value as number) : fallback;
  return Math.min(Math.max(parsed, 1), MAX_PUBLIC_LIST_LIMIT);
}

const serverApiEnv: ServerApiEnv = {
  internalPosts: process.env.DM_INTERNAL_POST_API_URL,
  internalUsers: process.env.DM_INTERNAL_USER_API_URL,
  publicApi: process.env.NEXT_PUBLIC_API_URL,
  production: process.env.NEXT_PUBLIC_RUNTIME_ENV === "production",
};

function publicUrl(service: PublicService, path: string): string | null {
  const base = resolveServerApiBase(service, serverApiEnv);
  if (!base) return null;
  return `${base}/${path.replace(/^\/+/, "")}`;
}

/**
 * Fetches only public GET data. This function deliberately never forwards a
 * browser/session token: the service's public GET contract is the authority.
 */
export async function fetchPublicJson<T>(service: PublicService, path: string): Promise<T | null> {
  const url = publicUrl(service, path);
  if (!url) return null;

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: PUBLIC_DATA_REVALIDATE_SECONDS },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}
