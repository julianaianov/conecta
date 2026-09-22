import Image, { type ImageProps } from "next/image";

type AppImageProps = Omit<ImageProps, "alt" | "src"> & {
  alt: string;
  src?: string | null;
};

function resolveSrc(src?: string | null): string | null {
  if (!src || (!src.startsWith("/") && !src.startsWith("http"))) return null;
  return src;
}

/** Wrapper para next/image com defaults do dmconecta. */
export function AppImage({ alt, className, fill, src, ...props }: AppImageProps) {
  const safeSrc = resolveSrc(src);

  if (!safeSrc) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`${fill ? "absolute inset-0 " : ""}${className ?? ""}`}
        style={{ background: "var(--th-card-alt)" }}
      />
    );
  }

  if (fill) {
    return (
      <Image
        fill
        src={safeSrc}
        alt={alt}
        className={className}
        sizes={props.sizes ?? "(max-width: 768px) 100vw, 50vw"}
        {...props}
      />
    );
  }

  return (
    <Image
      src={safeSrc}
      alt={alt}
      className={className}
      sizes={props.sizes ?? "(max-width: 768px) 100vw, 50vw"}
      {...props}
    />
  );
}
