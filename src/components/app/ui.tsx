import {
  POST_TYPE_COLORS, POST_TYPE_LABELS, POST_STATUS_COLORS, POST_STATUS_LABELS,
  SUPPORT_TYPE_META, type PostType, type PostStatus, type SupportType,
} from "@/lib/app/types";
import { Icon, type IconName } from "./Icon";

export function TypeBadge({ type, size = "md" }: { type: PostType; size?: "sm" | "md" }) {
  const color = POST_TYPE_COLORS[type];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-bold ${size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"}`}
      style={{ background: `${color}1a`, color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {POST_TYPE_LABELS[type]}
    </span>
  );
}

export function StatusBadge({ status }: { status: PostStatus }) {
  if (status === "active") return null;
  const color = POST_STATUS_COLORS[status];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: `${color}1a`, color }}>
      {status === "resolved" && <Icon name="check" size={12} />}
      {POST_STATUS_LABELS[status]}
    </span>
  );
}

export function SupportPill({ type, count }: { type: SupportType; count?: number }) {
  const meta = SUPPORT_TYPE_META[type];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold" style={{ borderColor: "var(--th-border)", background: "var(--th-card-alt)", color: "var(--th-text)" }}>
      <Icon name={meta.icon as IconName} size={14} style={{ color: "#f4841a" }} />
      {meta.label}
      {count != null && <span className="font-numeric" style={{ color: "var(--th-muted)" }}>· {count}</span>}
    </span>
  );
}

export function Card({ children, className = "", padded = true }: { children: React.ReactNode; className?: string; padded?: boolean }) {
  return (
    <div className={`app-card rounded-2xl ${padded ? "p-4 sm:p-5" : ""} ${className}`} style={{ boxShadow: "0 4px 16px rgba(13,45,66,0.05)" }}>
      {children}
    </div>
  );
}

export function SectionTitle({ icon, children, action }: { icon?: IconName; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      {icon && (
        <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: "rgba(46,123,168,0.12)", color: "#2e7ba8" }}>
          <Icon name={icon} size={15} />
        </span>
      )}
      <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--th-text)", letterSpacing: "0.04em" }}>{children}</h3>
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}

export function EmptyState({ icon = "search", title, hint }: { icon?: IconName; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-12 text-center" style={{ borderColor: "var(--th-border)" }}>
      <span className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "var(--th-card-alt)", color: "var(--th-muted)" }}>
        <Icon name={icon} size={22} />
      </span>
      <p className="mt-3 text-sm font-semibold" style={{ color: "var(--th-text)" }}>{title}</p>
      {hint && <p className="mt-1 max-w-xs text-xs" style={{ color: "var(--th-muted)" }}>{hint}</p>}
    </div>
  );
}
