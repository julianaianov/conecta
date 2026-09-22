import { colorFromString, gravatarUrl, initials } from "@/lib/app/format";

interface AvatarProps {
  name: string;
  src?: string | null;
  email?: string | null;
  size?: number;
  id?: string;
  ring?: boolean;
  className?: string;
}

/** Avatar circular com fallback para iniciais (cor estável). */
export function Avatar({ name, src, email, size = 44, id, ring = false, className = "" }: AvatarProps) {
  const bg = colorFromString(id ?? name ?? "?");
  const valid = typeof src === "string" && (src.startsWith("/") || src.startsWith("http"));
  const imageSrc = valid ? src : gravatarUrl(email, size);
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
      <span aria-hidden="true">{initials(name)}</span>
      {imageSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageSrc}
          alt={name}
          className="absolute inset-0 h-full w-full object-cover"
          onError={(event) => { event.currentTarget.style.display = "none"; }}
        />
      ) : null}
    </span>
  );
}
