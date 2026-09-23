export type RuntimeEnvironment = "local" | "homologation" | "production";

export interface RuntimeInput {
  environment?: string | null;
  apiUrl?: string | null;
}

export interface RuntimeConfig {
  environment: RuntimeEnvironment;
  apiBase: string;
  hasApi: boolean;
  demoAllowed: boolean;
  isProduction: boolean;
}

function normalizeEnvironment(value: string | null | undefined): RuntimeEnvironment {
  if (value === "production") return "production";
  if (value === "homologation") return "homologation";
  return "local";
}

export function resolveRuntime(input: RuntimeInput = {}): RuntimeConfig {
  const environment = normalizeEnvironment(input.environment);
  const apiBase = (input.apiUrl ?? "").trim().replace(/\/$/, "");
  const isProduction = environment === "production";

  return {
    environment,
    apiBase,
    // In production an empty base means same-origin requests through Caddy.
    hasApi: isProduction || apiBase.length > 0,
    // Nenhum ambiente pode servir dados sintéticos. Fixtures ficam restritas
    // aos testes isolados.
    demoAllowed: false,
    isProduction,
  };
}

export function shouldUseDemoFallback(config: RuntimeConfig, demoMode: boolean): boolean {
  void config;
  void demoMode;
  return false;
}

export const runtime = resolveRuntime({
  environment: process.env.NEXT_PUBLIC_RUNTIME_ENV,
  apiUrl: process.env.NEXT_PUBLIC_API_URL,
});
