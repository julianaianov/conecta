import { colorFromString, initials } from "@/lib/app/format";

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: number;
  id?: string;
  ring?: boolean;
  className?: string;
}

/** Avatar circular com fallback para iniciais (cor estável). */
export function Avatar({ name, src, size = 44, id, ring = false, className = "" }: AvatarProps) {
  const bg = colorFromString(id ?? name ?? "?");
  const valid = src && (src.startsWith("/") || src.startsWith("http"));
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white ${className}`}
      style={{
        width: size,
        height: size,
        background: bg,
        fontSize: size * 0.4,
        boxShadow: ring ? "0 0 0 2px var(--th-card), 0 0 0 4px " + bg : undefined,
      }}
    >
      {valid ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src!} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span>{initials(name)}</span>
      )}
    </span>
  );
}
