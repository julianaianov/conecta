import { nextStepFor, relevanceLabel } from "@/lib/app/signal";
import type { Post } from "@/lib/app/types";
import { SignalCardLayout } from "../signal/SignalCardLayout";

/**
 * Sinal no pulso para visitante (renderiza no servidor, sem estado). O
 * próximo passo leva a Apoiar, que pede a entrada antes de registrar; a
 * relevância aparece só como contexto.
 */
export function PublicPostCard({ post }: { post: Post }) {
  const nextStep = nextStepFor(post, { canSupport: true, onlyShares: false });
  const relevance = post.reactionsCount > 0 ? <span>{relevanceLabel(post.reactionsCount)}</span> : null;

  return <SignalCardLayout post={post} nextStep={nextStep} relevance={relevance} />;
}
