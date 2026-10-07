"use client";

import { useEffect } from "react";

const REVEAL_SELECTOR = [
  ".sec-head", ".dz-hero>*", ".dz-pts", ".ws", ".ap2", ".cf-actorsbar", ".hw", ".qx-hero>*", ".qx-card", ".qx-end",
  ".pcard", ".dos", ".px-more", ".mapapp", ".ix", ".ai-stack", ".dg-gov>div", ".trans>div", ".ficha", ".er-rec",
  ".ai-intro", ".sim", ".ai-warn", ".pillar", ".cta",
].join(",");

/**
 * Movimento da landing que não pertence a um componente só: revelar os blocos
 * ao rolar e acender o fluxo do topo. Sem `IntersectionObserver` ou com
 * movimento reduzido, tudo aparece de uma vez.
 */
export function LandingEffects() {
  useEffect(() => {
    const root = document.documentElement;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const supported = "IntersectionObserver" in window;
    const observers: IntersectionObserver[] = [];

    const flows = Array.from(document.querySelectorAll<HTMLElement>(".hflow"));
    for (const flow of flows) {
      if (reduce || !supported) { flow.classList.add("is-on"); continue; }
      const observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        flow.classList.add("is-on");
      }, { threshold: 0.4 });
      observer.observe(flow);
      observers.push(observer);
    }

    let revealed: HTMLElement[] = [];
    if (!reduce && supported) {
      revealed = Array.from(document.querySelectorAll<HTMLElement>(REVEAL_SELECTOR)).filter((el) => !el.closest(".hero"));
      root.classList.add("rv-on");
      for (const el of revealed) {
        el.classList.add("rv");
        const siblings = Array.from(el.parentElement?.children ?? []).filter((child) => child.classList.contains("rv") || child === el);
        el.style.setProperty("--d", `${Math.min(siblings.indexOf(el), 6) * 70}ms`);
      }
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          for (const child of Array.from(entry.target.parentElement?.children ?? [])) {
            if (!child.classList.contains("rv")) continue;
            child.classList.add("in");
            observer.unobserve(child);
          }
        }
      }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
      for (const el of revealed) observer.observe(el);
      observers.push(observer);
    }

    return () => {
      for (const observer of observers) observer.disconnect();
      root.classList.remove("rv-on");
      for (const el of revealed) { el.classList.remove("rv", "in"); el.style.removeProperty("--d"); }
    };
  }, []);

  return null;
}
