/**
 * Logo DM Conecta (Manual de Marca §03).
 * Monograma "DM" + wordmark "Conecta".
 * `tone`: petroleo (badge azul), light (sobre fundo escuro), plain (monocromático/currentColor).
 */

interface MarkProps {
  size?: number;
  tone?: "petroleo" | "light" | "plain";
  className?: string;
}

export function DMMonogram({ size = 36, tone = "petroleo", className = "" }: MarkProps) {
  const badge =
    tone === "petroleo"
      ? { background: "linear-gradient(135deg,#0d2d42,#1b4f72)", color: "#fff" }
      : tone === "light"
        ? { background: "rgba(255,255,255,0.12)", color: "#fff" }
        : { background: "transparent", color: "currentColor" };
  const radius = size * 0.28;
  return (
    <span
      className={`relative inline-flex items-center justify-center font-bold ${className}`}
      style={{
        width: size * 1.06,
        height: size,
        borderRadius: radius,
        fontSize: size * 0.46,
        letterSpacing: "-0.04em",
        lineHeight: 1,
        ...badge,
      }}
      aria-hidden="true"
    >
      <span>DM</span>
    </span>
  );
}

interface LogoProps {
  size?: number;
  /** Cor do wordmark; por padrão herda currentColor. */
  tone?: "petroleo" | "light" | "plain";
  wordmark?: boolean;
  className?: string;
}

export function DMLogo({ size = 30, tone = "petroleo", wordmark = true, className = "" }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <DMMonogram size={size} tone={tone} />
      {wordmark && (
        <span
          className="font-bold"
          style={{ fontSize: size * 0.62, letterSpacing: "-0.03em", lineHeight: 1 }}
        >
          Conecta
        </span>
      )}
    </span>
  );
}
