import Image, { type ImageProps } from "next/image";

type AppImageProps = Omit<ImageProps, "alt" | "src"> & {
  alt: string;
  src?: string | null;
};

const FALLBACK_SRC = "/images/posts/buraco.svg";

function resolveSrc(src?: string | null): string {
  if (!src || !src.startsWith("/") && !src.startsWith("http")) {
    return FALLBACK_SRC;
  }
  return src;
}

/** Wrapper para next/image com defaults do dmconecta. */
export function AppImage({ className, fill, src, ...props }: AppImageProps) {
  const safeSrc = resolveSrc(src);

  if (fill) {
    return (
      <Image
        fill
        src={safeSrc}
        className={className}
        sizes={props.sizes ?? "(max-width: 768px) 100vw, 50vw"}
        {...props}
      />
    );
  }

  return (
    <Image
      src={safeSrc}
      className={className}
      sizes={props.sizes ?? "(max-width: 768px) 100vw, 50vw"}
      {...props}
    />
  );
}
