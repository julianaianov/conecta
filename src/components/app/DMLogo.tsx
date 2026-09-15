import { brandToneColor, DM_MARK_PATH, DM_MARK_TRANSFORM, DM_MARK_VIEWBOX, type BrandTone } from "@/lib/app/brand";

interface MarkProps {
  size?: number;
  tone?: BrandTone;
  className?: string;
}

export function DMMonogram({ size = 36, tone = "petroleo", className = "" }: MarkProps) {
  const color = tone === "plain" ? "currentColor" : brandToneColor(tone);
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size * 0.877, height: size, color }}
      aria-hidden="true"
    >
      <svg
        width="100%"
        height="100%"
        viewBox={DM_MARK_VIEWBOX}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        focusable="false"
      >
        <g transform={DM_MARK_TRANSFORM} fill="currentColor" stroke="none">
          <path d={DM_MARK_PATH} />
        </g>
      </svg>
    </span>
  );
}

interface LogoProps {
  size?: number;
  /** Cor aplicada ao monograma e ao wordmark; `plain` herda do contexto. */
  tone?: BrandTone;
  wordmark?: boolean;
  className?: string;
}

export function DMLogo({ size = 30, tone = "petroleo", wordmark = true, className = "" }: LogoProps) {
  const color = brandToneColor(tone);
  return (
    <span
      className={`inline-flex items-center gap-2 ${className}`}
      style={{ color }}
      role="img"
      aria-label={wordmark ? "DM Conecta" : "Marca DM Conecta"}
    >
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
