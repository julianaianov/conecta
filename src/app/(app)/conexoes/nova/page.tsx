"use client";

/**
 * Solicitar conexão — 3 etapas: para quem, o que se pede, e o contexto.
 * Espelha o desenho do fluxo de apoio (`/post/[id]/apoiar`) para quem já usa o
 * app não precisar aprender duas gramáticas diferentes.
 *
 * Aceita `?para=<userId>` (vindo do perfil) e `?post=<postId>` (vindo de uma
 * publicação) para pular etapas já resolvidas.
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import {
  CONNECTION_TYPES, type ConnectionParty, type ConnectionType, type Post,
} from "@/lib/app/types";
import { Avatar } from "@/components/app/Avatar";
import { Button } from "@/components/app/Button";
import { Icon, type IconName } from "@/components/app/Icon";
import { Card } from "@/components/app/ui";
import { partyLabel } from "@/components/app/ConnectionCard";

export default function NewConnectionPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-24"><span className="app-spinner" style={{ width: 30, height: 30 }} /></div>}>
      <NewConnectionFlow />
    </Suspense>
  );
}

function NewConnectionFlow() {
  const router = useRouter();
  const search = useSearchParams();
  const { user } = useAuth();

  const [targets, setTargets] = useState<ConnectionParty[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [step, setStep] = useState(0);
  const [to, setTo] = useState<ConnectionParty | null>(null);
  const [type, setType] = useState<ConnectionType | null>(null);
  const [message, setMessage] = useState("");
  const [postId, setPostId] = useState<string | null>(search.get("post"));
  const [query, setQuery] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    Promise.all([api.connectionTargets(user.id), api.postsByAuthor(user.id)]).then(([t, p]) => {
      if (!alive) return;
      setTargets(t);
      setPosts(p);
      // destinatário via link do perfil → já começa na escolha do tipo
      const para = search.get("para");
      if (para) {
        const found = t.find((x) => x.userId === para);
        if (found) { setTo(found); setStep(1); }
      }
    });
    return () => { alive = false; };
  }, [user, search]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return targets;
    return targets.filter((t) => t.name.toLowerCase().includes(q) || partyLabel(t).toLowerCase().includes(q));
  }, [targets, query]);

  const progress = (step + 1) / 3;

  async function send() {
    if (!user || !to || !type) return;
    setSending(true);
    try {
      const created = await api.createConnection({ from: user, toUserId: to.userId, type, message: message.trim(), postId });
      router.push(`/conexoes/${created.id}`);
    } finally { setSending(false); }
  }

  return (
    <div className="mx-auto max-w-lg py-2">
      <button
        onClick={() => (step === 0 ? router.push("/conexoes") : setStep((s) => s - 1))}
        className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold"
        style={{ color: "var(--th-muted)" }}
      >
        <Icon name="arrowLeft" size={18} /> Voltar
      </button>

      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--th-card-alt)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${progress * 100}%`, background: "linear-gradient(90deg,#f4841a,#f89b45)" }} />
      </div>

      {/* ── 1. Para quem ─────────────────────────────────── */}
      {step === 0 && (
        <Card>
          <h1 className="text-lg font-bold" style={{ color: "var(--th-text)" }}>Com quem você quer se conectar?</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>
            Empresas, ONGs, coletivos, órgãos públicos e moradores da rede.
          </p>

          <div className="relative mt-4">
            <Icon name="search" size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--th-muted)" }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome ou tipo de perfil"
              className="app-input pl-11"
            />
          </div>

          <div className="mt-3 max-h-[26rem] space-y-2 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="py-6 text-center text-sm" style={{ color: "var(--th-muted)" }}>Nenhuma conta encontrada.</p>
            )}
            {filtered.map((t) => (
              <button
                key={t.userId}
                onClick={() => { setTo(t); setStep(1); }}
                className="app-card flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all hover:border-[#f4841a]"
              >
                <Avatar name={t.name} src={t.avatarUrl} id={t.userId} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold" style={{ color: "var(--th-text)" }}>{t.name}</span>
                  <span className="block truncate text-xs" style={{ color: "var(--th-muted)" }}>{partyLabel(t)}</span>
                </span>
                <Icon name="chevronRight" size={18} style={{ color: "var(--th-muted)" }} />
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* ── 2. O que se pede ─────────────────────────────── */}
      {step === 1 && to && (
        <Card>
          <div className="mb-4 flex items-center gap-3">
            <Avatar name={to.name} src={to.avatarUrl} id={to.userId} size={40} />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold" style={{ color: "var(--th-text)" }}>{to.name}</p>
              <p className="truncate text-xs" style={{ color: "var(--th-muted)" }}>{partyLabel(to)}</p>
            </div>
          </div>

          <h1 className="text-lg font-bold" style={{ color: "var(--th-text)" }}>O que você está pedindo?</h1>
          <div className="mt-3 space-y-2">
            {CONNECTION_TYPES.map((t) => (
              <button
                key={t.type}
                onClick={() => { setType(t.type); setStep(2); }}
                className="app-card flex w-full items-center gap-3 rounded-xl p-3.5 text-left transition-all hover:border-[#f4841a]"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: "rgba(244,132,26,0.12)", color: "#f4841a" }}>
                  <Icon name={t.icon as IconName} size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold" style={{ color: "var(--th-text)" }}>{t.label}</span>
                  <span className="block truncate text-xs" style={{ color: "var(--th-muted)" }}>{t.subtitle}</span>
                </span>
                <Icon name="chevronRight" size={18} style={{ color: "var(--th-muted)" }} />
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* ── 3. Contexto e envio ──────────────────────────── */}
      {step === 2 && to && type && (
        <Card>
          <h1 className="text-lg font-bold" style={{ color: "var(--th-text)" }}>Explique o pedido</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>
            Quanto mais concreto — o que precisa, quando e para quê —, maior a chance de virar sim.
          </p>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-semibold" style={{ color: "var(--th-text)" }}>Mensagem</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={600}
              placeholder="Ex.: precisamos de 60 pares de luvas e sacos de lixo para o mutirão de sábado, às 8h na praia."
              className="app-textarea"
              style={{ minHeight: "7rem" }}
            />
            <span className="mt-1 block text-right text-[11px] font-numeric" style={{ color: "var(--th-muted)" }}>{message.length}/600</span>
          </label>

          {posts.length > 0 && (
            <div className="mt-2">
              <span className="mb-1.5 block text-sm font-semibold" style={{ color: "var(--th-text)" }}>
                Vincular a uma publicação <span className="font-normal" style={{ color: "var(--th-muted)" }}>(opcional)</span>
              </span>
              <div className="space-y-1.5">
                {posts.slice(0, 5).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPostId((cur) => (cur === p.id ? null : p.id))}
                    className="flex w-full items-center gap-2 rounded-xl border p-2.5 text-left text-sm"
                    style={{
                      borderColor: postId === p.id ? "#f4841a" : "var(--th-border)",
                      background: postId === p.id ? "rgba(244,132,26,0.06)" : "var(--th-card)",
                      color: "var(--th-text)",
                    }}
                  >
                    <Icon name="megaphone" size={15} style={{ color: postId === p.id ? "#f4841a" : "var(--th-muted)" }} />
                    <span className="min-w-0 flex-1 truncate">{p.title}</span>
                    {postId === p.id && <Icon name="check" size={15} style={{ color: "#f4841a" }} />}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 rounded-xl p-3 text-sm" style={{ background: "var(--th-card-alt)", color: "var(--th-muted)" }}>
            Enviando <b style={{ color: "var(--th-text)" }}>{CONNECTION_TYPES.find((t) => t.type === type)?.label}</b> para{" "}
            <b style={{ color: "var(--th-text)" }}>{to.name}</b>. Ela recebe uma notificação e pode aceitar ou recusar.
          </div>

          <div className="mt-4 flex gap-2">
            <Button variant="outline" icon="arrowLeft" onClick={() => setStep(1)}>Voltar</Button>
            <Button block size="lg" icon="send" loading={sending} disabled={message.trim().length < 10} onClick={send}>
              Enviar pedido
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
