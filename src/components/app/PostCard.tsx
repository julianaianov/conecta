"use client";

import { useState } from "react";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import { nextStepFor, relevanceLabel } from "@/lib/app/signal";
import { allowedSupportTypes, type Post } from "@/lib/app/types";
import { Icon } from "./Icon";
import { SignalCardLayout } from "./signal/SignalCardLayout";

/**
 * Sinal no pulso, para quem está logado. O próximo passo depende do que o
 * perfil pode fazer (Apoiar, Divulgar, ver a demanda estruturada ou
 * acompanhar o resultado); a reação é um controle secundário de relevância.
 */
export function PostCard({ post }: { post: Post }) {
  const { user } = useAuth();
  const supportTypes = allowedSupportTypes(user?.role, user?.profileType);
  const onlyShares = supportTypes.length === 1 && supportTypes[0] === "sharing";
  const nextStep = nextStepFor(post, { canSupport: supportTypes.length > 0, onlyShares });

  return (
    <SignalCardLayout
      post={post}
      nextStep={nextStep}
      relevance={<RelevanceToggle post={post} />}
    />
  );
}

function RelevanceToggle({ post }: { post: Post }) {
  const [count, setCount] = useState(post.reactionsCount);
  const [marked, setMarked] = useState(false);
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (pending) return;
    const next = !marked;
    setPending(true);
    setMarked(next);
    setCount((current) => Math.max(0, current + (next ? 1 : -1)));
    try {
      await api.toggleReaction(post.id);
    } catch {
      setMarked(!next);
      setCount((current) => Math.max(0, current + (next ? -1 : 1)));
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={marked}
      aria-label={`${marked ? "Desmarcar" : "Marcar"} este sinal como relevante para o bairro. ${relevanceLabel(count)}.`}
      title={relevanceLabel(count)}
      className="signal-focus inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold transition-colors hover:bg-[var(--th-card-alt)]"
      style={{
        borderColor: marked ? "var(--th-text)" : "var(--th-border)",
        color: marked ? "var(--th-text)" : "var(--th-muted)",
      }}
    >
      {marked ? <Icon name="check" size={13} /> : null}
      <span>Relevante</span>
      <span className="font-numeric" aria-hidden="true">· {count}</span>
    </button>
  );
}
