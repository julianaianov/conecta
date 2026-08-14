"use client";

/**
 * Fluxo de uma conexão: quem pediu o quê a quem, em que pé está e o que cada
 * lado pode fazer agora. A linha do tempo é o registro auditável do ciclo
 * pedido → aceite → resultado.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import { formatDate, timeAgo } from "@/lib/app/format";
import { CONNECTION_TYPE_META, type Connection, type ConnectionStatus } from "@/lib/app/types";
import { Avatar } from "@/components/app/Avatar";
import { Button } from "@/components/app/Button";
import { Icon, type IconName } from "@/components/app/Icon";
import { Card, EmptyState } from "@/components/app/ui";
import { ConnectionStatusBadge, ConnectionTypePill, partyLabel } from "@/components/app/ConnectionCard";

export default function ConnectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [c, setC] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState("");
  const [showOutcome, setShowOutcome] = useState(false);

  useEffect(() => {
    let alive = true;
    api.getConnection(id).then((conn) => { if (alive) { setC(conn); setLoading(false); } });
    return () => { alive = false; };
  }, [id]);

  async function update(status: ConnectionStatus, texto?: string) {
    setBusy(true);
    try {
      const updated = await api.updateConnection(id, status, texto);
      if (updated) setC(updated);
      setShowOutcome(false);
      setOutcome("");
    } finally { setBusy(false); }
  }

  if (loading) return <div className="flex justify-center py-24"><span className="app-spinner" style={{ width: 30, height: 30 }} /></div>;
  if (!c) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <EmptyState icon="link" title="Conexão não encontrada" hint="Ela pode ter sido removida." />
      </div>
    );
  }

  const me = user?.id ?? "";
  const souDestinatario = c.to.userId === me;
  const souRemetente = c.from.userId === me;
  const meta = CONNECTION_TYPE_META[c.type];

  return (
    <div className="mx-auto max-w-2xl">
      <button onClick={() => router.push("/conexoes")} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--th-muted)" }}>
        <Icon name="arrowLeft" size={18} /> Conexões
      </button>

      {/* as duas pontas */}
      <Card>
        <div className="flex items-center justify-between gap-2">
          <ConnectionTypePill type={c.type} />
          <ConnectionStatusBadge status={c.status} />
        </div>

        <div className="mt-4 flex items-center gap-2 sm:gap-4">
          <Party party={c.from} legenda="pediu" />
          <div className="flex shrink-0 flex-col items-center" style={{ color: "#f4841a" }}>
            <Icon name={meta.icon as IconName} size={18} />
            <Icon name="chevronRight" size={16} />
          </div>
          <Party party={c.to} legenda="recebeu" />
        </div>

        <p className="mt-4 whitespace-pre-line rounded-xl p-3 text-[15px] leading-relaxed" style={{ background: "var(--th-card-alt)", color: "var(--th-text)" }}>
          {c.message}
        </p>

        {c.postTitle && (
          <Link href={`/post/${c.postId}`} className="mt-3 inline-flex items-center gap-2 text-sm font-semibold" style={{ color: "#f4841a" }}>
            <Icon name="megaphone" size={15} /> {c.postTitle}
          </Link>
        )}

        <p className="mt-3 text-xs" style={{ color: "var(--th-muted)" }}>
          Pedido em {formatDate(c.createdAt)} · atualizado {timeAgo(c.updatedAt)}
        </p>
      </Card>

      {/* ações de quem está vendo */}
      {(souDestinatario || souRemetente) && c.status !== "done" && c.status !== "declined" && c.status !== "canceled" && (
        <Card className="mt-4">
          <p className="text-sm font-bold" style={{ color: "var(--th-text)" }}>O que você quer fazer?</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {souDestinatario && c.status === "pending" && (
              <>
                <Button icon="check" loading={busy} onClick={() => update("accepted")}>Aceitar conexão</Button>
                <Button variant="outline" icon="close" disabled={busy} onClick={() => update("declined")}>Recusar</Button>
              </>
            )}
            {souRemetente && c.status === "pending" && (
              <Button variant="outline" icon="close" loading={busy} onClick={() => update("canceled")}>Cancelar pedido</Button>
            )}
            {c.status === "accepted" && !showOutcome && (
              <Button icon="star" onClick={() => setShowOutcome(true)}>Registrar resultado</Button>
            )}
          </div>

          {c.status === "accepted" && showOutcome && (
            <div className="mt-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold" style={{ color: "var(--th-text)" }}>O que foi entregue?</span>
                <textarea
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                  maxLength={400}
                  placeholder="Ex.: 60 pares de luvas entregues; mutirão reuniu 45 pessoas e recolheu 300 kg de resíduo."
                  className="app-textarea"
                />
              </label>
              <div className="mt-2 flex gap-2">
                <Button variant="outline" onClick={() => setShowOutcome(false)}>Cancelar</Button>
                <Button icon="check" loading={busy} disabled={outcome.trim().length < 10} onClick={() => update("done", outcome.trim())}>
                  Concluir conexão
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {c.outcome && (
        <Card className="mt-4">
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>Resultado registrado</p>
          <p className="mt-1.5 text-[15px] leading-relaxed" style={{ color: "var(--th-text)" }}>{c.outcome}</p>
        </Card>
      )}

      {/* linha do tempo */}
      <Card className="mt-4">
        <p className="mb-3 text-sm font-bold" style={{ color: "var(--th-text)" }}>Linha do tempo</p>
        <ol className="space-y-4">
          {c.events.map((e, i) => (
            <li key={e.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full"
                  style={{ background: "rgba(46,123,168,0.12)", color: "#2e7ba8" }}
                >
                  <Icon name={e.icon as IconName} size={15} />
                </span>
                {i < c.events.length - 1 && <span className="mt-1 w-px flex-1" style={{ background: "var(--th-border)" }} />}
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <p className="text-sm font-semibold" style={{ color: "var(--th-text)" }}>{e.label}</p>
                {e.detail && <p className="text-sm" style={{ color: "var(--th-muted)" }}>{e.detail}</p>}
                <p className="mt-0.5 text-xs font-numeric" style={{ color: "var(--th-muted)" }}>
                  {formatDate(e.at)} · {timeAgo(e.at)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

function Party({ party, legenda }: { party: Connection["from"]; legenda: string }) {
  return (
    <Link href={`/perfil/${party.userId}`} className="flex min-w-0 flex-1 items-center gap-2.5">
      <Avatar name={party.name} src={party.avatarUrl} id={party.userId} size={44} />
      <span className="min-w-0">
        <span className="block text-[11px] uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>{legenda}</span>
        <span className="block truncate text-sm font-bold" style={{ color: "var(--th-text)" }}>{party.name}</span>
        <span className="block truncate text-xs" style={{ color: "var(--th-muted)" }}>{partyLabel(party)}</span>
      </span>
    </Link>
  );
}
