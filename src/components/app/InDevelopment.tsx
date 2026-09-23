import { Icon } from "./Icon";

/**
 * Aviso padrão de funcionalidade em desenvolvimento (T24).
 *
 * Fonte: Apresentação Institucional, slide 25 — "apenas dados verificáveis são
 * publicados; funcionalidades ainda em desenvolvimento são identificadas como
 * tal". Onde a plataforma ainda não faz algo, a tela diz isso com todas as
 * letras, em vez de esconder o botão ou fingir que funciona.
 *
 * `as="inline"` para um aviso curto ao lado de um campo; o padrão é o bloco.
 */
export function InDevelopment({
  title = "Em desenvolvimento",
  children,
  as = "block",
  className = "",
}: {
  title?: string;
  children?: React.ReactNode;
  as?: "block" | "inline";
  className?: string;
}) {
  if (as === "inline") {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${className}`}
        style={{ background: "rgba(244,132,26,0.12)", color: "#b45c09" }}
      >
        <Icon name="info" size={12} aria-hidden />
        {title}
        {children ? <span className="font-normal">· {children}</span> : null}
      </span>
    );
  }

  return (
    <div
      role="note"
      className={`flex items-start gap-3 rounded-xl border p-3 ${className}`}
      style={{ borderColor: "rgba(244,132,26,0.35)", background: "rgba(244,132,26,0.08)" }}
    >
      <span className="mt-0.5 shrink-0" style={{ color: "#b45c09" }}>
        <Icon name="info" size={18} aria-hidden />
      </span>
      <div className="min-w-0 text-sm">
        <p className="font-semibold" style={{ color: "var(--th-text)" }}>{title}</p>
        {children ? <div className="mt-1" style={{ color: "var(--th-muted)" }}>{children}</div> : null}
      </div>
    </div>
  );
}
