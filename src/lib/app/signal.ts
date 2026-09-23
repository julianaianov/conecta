// Leitura territorial do sinal (card do pulso e página do post).
//
// A identidade "Sinal do bairro" (design/identidade-visual-sinal-do-bairro.md)
// organiza o card em torno de tipo, status, bairro e próximo passo. Este módulo
// decide o próximo passo a partir dos dados reais do post e do que o perfil
// pode fazer; a reação (engajamento exigido pelo slide 22 da Apresentação)
// continua existindo, mas nunca é o próximo passo.

import type { Post } from "./types.ts";

export type NextStepKind = "support" | "share" | "demand" | "result" | "follow";

export interface NextStep {
  kind: NextStepKind;
  label: string;
  href: string;
  /** Ícone do `Icon` do app (sem corações, polegares ou balões). */
  icon: "volunteer" | "share" | "inventory" | "flag" | "map";
  hint: string;
}

/** O que a pessoa que está lendo pode fazer com o sinal. */
export interface SignalViewer {
  /** Pode oferecer alguma forma de apoio (ou é visitante, que entra para apoiar). */
  canSupport: boolean;
  /** Só contribui com divulgação (Agentes e Comunicação). */
  onlyShares: boolean;
}

type SignalPost = Pick<Post, "id" | "status" | "demandId">;

const CLOSED_STATUSES = new Set(["resolved", "resolvida"]);
const CANCELLED_STATUSES = new Set(["cancelled", "cancelada"]);

export function signalPath(post: Pick<Post, "id">): string {
  return `/post/${encodeURIComponent(post.id)}`;
}

function demandPath(id: string): string {
  return `/demandas/${encodeURIComponent(id)}`;
}

/**
 * Próximo passo do sinal: a ação que orienta a participação.
 *
 * 1. Resolvido → acompanhar o resultado (na demanda estruturada, se houver).
 * 2. Cancelado → ver o histórico.
 * 3. Aberto e o perfil apoia → Apoiar; se só divulga → Divulgar.
 * 4. Aberto, sem forma de apoio, com demanda → ver a demanda estruturada.
 * 5. Caso contrário → acompanhar o sinal.
 */
export function nextStepFor(post: SignalPost, viewer: SignalViewer): NextStep {
  const postHref = signalPath(post);
  const status = post.status;

  if (status && CLOSED_STATUSES.has(status)) {
    return {
      kind: "result",
      label: "Acompanhar resultado",
      href: post.demandId ? demandPath(post.demandId) : postHref,
      icon: "flag",
      hint: "Sinal resolvido. Veja o que foi feito e o que mudou no território.",
    };
  }
  if (status && CANCELLED_STATUSES.has(status)) {
    return { kind: "follow", label: "Ver histórico", href: postHref, icon: "map", hint: "Sinal encerrado sem execução." };
  }
  if (viewer.canSupport && viewer.onlyShares) {
    return {
      kind: "share",
      label: "Divulgar",
      href: `${postHref}/apoiar?type=sharing`,
      icon: "share",
      hint: "Amplie o alcance deste sinal no território.",
    };
  }
  if (viewer.canSupport) {
    return {
      kind: "support",
      label: "Apoiar",
      href: `${postHref}/apoiar`,
      icon: "volunteer",
      hint: "Ofereça recurso, material, trabalho ou conhecimento.",
    };
  }
  if (post.demandId) {
    return {
      kind: "demand",
      label: "Ver a demanda estruturada",
      href: demandPath(post.demandId),
      icon: "inventory",
      hint: "Orçamento, cronograma, metas e linha do tempo.",
    };
  }
  return { kind: "follow", label: "Acompanhar sinal", href: postHref, icon: "map", hint: "Acompanhe as atualizações deste sinal." };
}

/** Território legível: bairro e cidade, sem inventar localização. */
export function territoryLabel(post: Pick<Post, "neighborhood" | "city">): string | null {
  const parts = [post.neighborhood, post.city].map((part) => part?.trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Contexto de atualizações ("1 atualização", "3 atualizações"). */
export function updatesLabel(count: number): string {
  if (count <= 0) return "Sem atualizações ainda";
  return count === 1 ? "1 atualização" : `${count} atualizações`;
}

/**
 * Rótulo da reação (a "curtida" da fonte), apresentada como marcação de
 * relevância para o bairro. O número é contexto, não métrica de vaidade.
 */
export function relevanceLabel(count: number): string {
  if (count <= 0) return "Nenhuma marcação de relevância";
  return count === 1 ? "1 pessoa marcou como relevante" : `${count} pessoas marcaram como relevante`;
}

/** Temas do sinal, como rótulos sem `#`. */
export function themeLabels(tags: string[] | null | undefined, max = 3): string[] {
  return (tags ?? [])
    .map((tag) => tag.replace(/^#+/, "").trim())
    .filter(Boolean)
    .slice(0, max);
}
