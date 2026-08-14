"use client";

/** Peças compartilhadas do fluxo de conexões (lista, detalhe e envio). */
import Link from "next/link";
import {
  CONNECTION_STATUS_COLORS, CONNECTION_STATUS_LABELS, CONNECTION_TYPE_META,
  ROLE_LABELS, PROFILE_LABELS, normalizeRole,
  type Connection, type ConnectionParty, type ConnectionStatus, type ConnectionType,
} from "@/lib/app/types";
import { timeAgo } from "@/lib/app/format";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";

export function ConnectionTypePill({ type, size = "md" }: { type: ConnectionType; size?: "sm" | "md" }) {
  const meta = CONNECTION_TYPE_META[type];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-bold ${size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"}`}
      style={{ background: "rgba(244,132,26,0.12)", color: "#f4841a" }}
    >
      <Icon name={meta.icon as IconName} size={size === "sm" ? 11 : 13} />
      {meta.label}
    </span>
  );
}

export function ConnectionStatusBadge({ status }: { status: ConnectionStatus }) {
  const color = CONNECTION_STATUS_COLORS[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
      style={{ background: `${color}1a`, color }}
    >
      {status === "accepted" && <Icon name="check" size={11} strokeWidth={2.6} />}
      {status === "done" && <Icon name="star" size={11} />}
      {status === "pending" && <Icon name="clock" size={11} />}
      {CONNECTION_STATUS_LABELS[status]}
    </span>
  );
}

/** Rótulo do papel da conta ("Parceiro · Empresa"). */
export function partyLabel(p: ConnectionParty): string {
  return [ROLE_LABELS[normalizeRole(p.role)], p.profileType && PROFILE_LABELS[p.profileType]]
    .filter(Boolean)
    .join(" · ");
}

interface CardProps {
  connection: Connection;
  meId: string;
  onRespond?: (id: string, status: ConnectionStatus) => void;
  busy?: boolean;
}

export function ConnectionCard({ connection: c, meId, onRespond, busy }: CardProps) {
  const souDestinatario = c.to.userId === meId;
  const outro = souDestinatario ? c.from : c.to;
  const podeResponder = souDestinatario && c.status === "pending";

  return (
    <div className="app-card rounded-2xl p-4" style={{ boxShadow: "0 4px 16px rgba(13,45,66,0.05)" }}>
      <div className="flex items-start gap-3">
        <Link href={`/perfil/${outro.userId}`} className="shrink-0">
          <Avatar name={outro.name} src={outro.avatarUrl} id={outro.userId} size={44} />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/perfil/${outro.userId}`} className="truncate text-sm font-bold hover:underline" style={{ color: "var(--th-text)" }}>
              {outro.name}
            </Link>
            <span className="text-xs" style={{ color: "var(--th-muted)" }}>
              {souDestinatario ? "pediu a você" : "você pediu"}
            </span>
          </div>
          <p className="mt-0.5 text-xs" style={{ color: "var(--th-muted)" }}>{partyLabel(outro)}</p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <ConnectionTypePill type={c.type} size="sm" />
            <ConnectionStatusBadge status={c.status} />
            <span className="font-numeric text-[11px]" style={{ color: "var(--th-muted)" }}>{timeAgo(c.updatedAt)}</span>
          </div>

          <p className="mt-2 text-sm clamp-2" style={{ color: "var(--th-text)" }}>{c.message}</p>

          {c.postTitle && (
            <Link
              href={`/post/${c.postId}`}
              className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold"
              style={{ background: "var(--th-card-alt)", color: "var(--th-muted)" }}
            >
              <Icon name="megaphone" size={12} />
              <span className="truncate">{c.postTitle}</span>
            </Link>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {podeResponder && onRespond ? (
              <>
                <Button size="sm" icon="check" loading={busy} onClick={() => onRespond(c.id, "accepted")}>Aceitar</Button>
                <Button size="sm" variant="outline" icon="close" disabled={busy} onClick={() => onRespond(c.id, "declined")}>Recusar</Button>
              </>
            ) : null}
            <Link href={`/conexoes/${c.id}`} className="text-xs font-semibold" style={{ color: "#f4841a" }}>
              Ver fluxo
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
