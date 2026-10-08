"use client";

import { useEffect } from "react";

const TILT_SELECTOR = ".pcard, .qx-card, .pillar, .solx-caps li";
const SPOT_SELECTOR = ".pcard, .qx-card, .pillar, .solx-caps li, .qp li, .cpanel, .aitem, .dos, .ficha";
const MAGNET_SELECTOR = ".btn-primary, .cta .btn";

/**
 * Reatividade da landing: parallax do topo ao rolar, foco de luz e inclinação
 * que seguem o cursor nos cartões, botões magnéticos e destaque da seção em
 * vista. Só roda com ponteiro fino e sem `prefers-reduced-motion`; o resto da
 * página funciona igual sem isso.
 */
export function LandingMotion() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const root = document.documentElement;
    const cleanups: Array<() => void> = [];

    // Parallax: o progresso da rolagem vira variáveis CSS (uma escrita por frame).
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      const h = window.innerHeight;
      root.style.setProperty("--fx-hero", String(Math.min(Math.max(y / h, 0), 1.2).toFixed(3)));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    cleanups.push(() => { window.removeEventListener("scroll", onScroll); if (frame) cancelAnimationFrame(frame); root.style.removeProperty("--fx-hero"); });

    // Seção em vista ganha `.fx-live` (a anterior esmaece de leve).
    const sections = Array.from(document.querySelectorAll<HTMLElement>("main > section"));
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) => {
        for (const e of entries) e.target.classList.toggle("fx-live", e.isIntersecting);
      }, { rootMargin: "-35% 0px -35% 0px" });
      sections.forEach((s) => io.observe(s));
      cleanups.push(() => { io.disconnect(); sections.forEach((s) => s.classList.remove("fx-live")); });
    }

    if (fine) {
      const spots = Array.from(document.querySelectorAll<HTMLElement>(SPOT_SELECTOR));
      const tilts = new Set(Array.from(document.querySelectorAll<HTMLElement>(TILT_SELECTOR)));
      const magnets = Array.from(document.querySelectorAll<HTMLElement>(MAGNET_SELECTOR));

      const move = (e: PointerEvent) => {
        const el = e.currentTarget as HTMLElement;
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        el.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
        el.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
        if (tilts.has(el)) {
          el.style.setProperty("--ry", `${((px - 0.5) * 6).toFixed(2)}deg`);
          el.style.setProperty("--rx", `${((0.5 - py) * 6).toFixed(2)}deg`);
        }
      };
      const leave = (e: PointerEvent) => {
        const el = e.currentTarget as HTMLElement;
        el.style.removeProperty("--rx"); el.style.removeProperty("--ry");
      };
      for (const el of spots) {
        el.classList.add("fx-spot");
        if (tilts.has(el)) el.classList.add("fx-tilt");
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerleave", leave);
      }
      cleanups.push(() => spots.forEach((el) => {
        el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave);
        el.classList.remove("fx-spot", "fx-tilt");
        ["--mx", "--my", "--rx", "--ry"].forEach((p) => el.style.removeProperty(p));
      }));

      const mMove = (e: PointerEvent) => {
        const el = e.currentTarget as HTMLElement;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--bx", `${((e.clientX - r.left - r.width / 2) * 0.18).toFixed(1)}px`);
        el.style.setProperty("--by", `${((e.clientY - r.top - r.height / 2) * 0.28).toFixed(1)}px`);
      };
      const mLeave = (e: PointerEvent) => {
        const el = e.currentTarget as HTMLElement;
        el.style.removeProperty("--bx"); el.style.removeProperty("--by");
      };
      for (const el of magnets) {
        el.classList.add("fx-magnet");
        el.addEventListener("pointermove", mMove);
        el.addEventListener("pointerleave", mLeave);
      }
      cleanups.push(() => magnets.forEach((el) => {
        el.removeEventListener("pointermove", mMove); el.removeEventListener("pointerleave", mLeave);
        el.classList.remove("fx-magnet");
        el.style.removeProperty("--bx"); el.style.removeProperty("--by");
      }));
    }

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return null;
}
