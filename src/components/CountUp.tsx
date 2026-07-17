"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** Layout effect no cliente, effect no servidor — evita o warning de SSR. */
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

type Parsed = { target: number; prefix: string; suffix: string };

/** "+1.200" → {prefix:"+", target:1200}. "50+" → {target:50, suffix:"+"}. "∞" → null. */
function parse(raw: string): Parsed | null {
  const match = raw.match(/[\d.]+/);
  if (!match || match.index === undefined) return null;
  const target = Number(match[0].replace(/\./g, ""));
  if (!Number.isFinite(target)) return null;
  return {
    target,
    prefix: raw.slice(0, match.index),
    suffix: raw.slice(match.index + match[0].length),
  };
}

const format = (n: number, p: Parsed) => `${p.prefix}${n.toLocaleString("pt-BR")}${p.suffix}`;

type CountUpProps = {
  value: string;
  className?: string;
  /** ms; a contagem toda dura isso */
  duration?: number;
};

/**
 * Conta de 0 até o valor quando entra na tela.
 * O HTML do servidor já sai com o valor final (vale para SEO e sem-JS); o zero
 * só é aplicado no cliente, antes da primeira pintura, quando a animação vai rodar.
 */
export function CountUp({ value, className, duration = 1600 }: CountUpProps) {
  const parsed = parse(value);
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(value);

  useIsoLayoutEffect(() => {
    if (!parsed) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setDisplay(format(0, parsed));
  }, [value]);

  useEffect(() => {
    if (!parsed) return;
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();

        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - t, 3);
          setDisplay(format(Math.round(parsed.target * eased), parsed));
          if (t < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, duration]);

  return (
    <span ref={ref} className={className}>
      {display}
    </span>
  );
}
