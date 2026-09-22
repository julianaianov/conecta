// Cliente das rotas da área de governo e gestão pública (T22),
// `/api/posts/government/*`. Fica fora de `api.ts` porque a exportação baixa um
// arquivo (Blob) e não JSON; a sessão e o erro continuam sendo os de `api.ts`
// (`getToken`, `ApiError`). O vocabulário e a apresentação estão em
// `government.ts`, que é puro e testado contra o post-service.

import { ApiError, getToken } from "./api";
import { runtime } from "./runtime";
import { buildIndicatorQuery } from "./government";
import type {
  GovernmentAction, GovernmentActionInput, ImpactReport, IndicatorFilter,
  IndicatorReport, PriorityReport,
} from "./government";



const BASE = `${runtime.apiBase}/api/posts/government`;
const TIMEOUT_MS = 12_000;

interface FieldErrorBody {
  error?: string;
  code?: string;
  fields?: Record<string, string>;
}

/** Erro do painel com os `fields` do servidor (usado no formulário da ação). */
export class GovernmentError extends ApiError {
  readonly fields: Record<string, string>;

  constructor(message: string, status: number, code: string | null, fields: Record<string, string> = {}) {
    super(message, status, code);
    this.fields = fields;
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const token = getToken();
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as FieldErrorBody;
      throw new GovernmentError(body.error ?? `Erro ${res.status}`, res.status, body.code ?? null, body.fields ?? {});
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw new Error("timeout");
    if (err instanceof TypeError) throw new Error("network");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export type ExportFormat = "csv" | "pdf";

export const governmentApi = {
  /** Os 10 indicadores do recorte, com a hora da leitura. */
  indicators(filter: IndicatorFilter = {}): Promise<IndicatorReport> {
    return call<IndicatorReport>(`/indicators?${buildIndicatorQuery(filter)}`);
  },

  /** Priorização de áreas: território e categoria, ordenados pelo próprio órgão. */
  priorityAreas(filter: IndicatorFilter = {}): Promise<PriorityReport> {
    return call<PriorityReport>(`/priority-areas?${buildIndicatorQuery(filter)}`);
  },

  /** Medição de impacto das demandas em que o órgão atuou. */
  impact(filter: IndicatorFilter = {}): Promise<ImpactReport> {
    return call<ImpactReport>(`/impact?${buildIndicatorQuery(filter)}`);
  },

  /** Ações, programas e obras divulgados pelo órgão. */
  async actions(): Promise<GovernmentAction[]> {
    return (await call<{ actions: GovernmentAction[] }>("/actions")).actions;
  },

  /** Publica a ação; 422 com `fields` quando falta algo. */
  publishAction(input: GovernmentActionInput): Promise<GovernmentAction> {
    return call<GovernmentAction>("/actions", { method: "POST", body: JSON.stringify(input) });
  },

  /** Arquivo da exportação (CSV ou PDF) e o nome sugerido, sem dados pessoais. */
  async exportIndicators(format: ExportFormat, filter: IndicatorFilter = {}): Promise<{ blob: Blob; fileName: string }> {
    const token = getToken();
    const query = buildIndicatorQuery(filter);
    const res = await fetch(`${BASE}/indicators/export?format=${format}${query ? `&${query}` : ""}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as FieldErrorBody;
      throw new GovernmentError(body.error ?? `Erro ${res.status}`, res.status, body.code ?? null, body.fields ?? {});
    }
    const disposition = res.headers.get("content-disposition") ?? "";
    const match = /filename="([^"]+)"/.exec(disposition);
    return {
      blob: await res.blob(),
      fileName: match?.[1] ?? `dmconecta-indicadores.${format}`,
    };
  },
};
