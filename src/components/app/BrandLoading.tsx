"use client";

import { useEffect, useState } from "react";
import {
  BRAND_LOADING_MAX_MS,
  BRAND_LOADING_MIN_MS,
  shouldDismissBrandLoading,
} from "@/lib/app/brand";
import { DMMonogram } from "./DMLogo";

export function BrandLoading() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const startedAt = performance.now();
    let dismissId: number | undefined;

    const dismiss = (reason: "page-finished" | "timeout") => {
      const elapsedMs = performance.now() - startedAt;
      const remainingMs = Math.max(0, BRAND_LOADING_MIN_MS - elapsedMs);
      dismissId = window.setTimeout(() => {
        if (shouldDismissBrandLoading(reason, performance.now() - startedAt)) {
          setVisible(false);
        }
      }, remainingMs);
    };
    const timeoutId = window.setTimeout(() => dismiss("timeout"), BRAND_LOADING_MAX_MS);

    if (document.readyState === "complete") {
      dismiss("page-finished");
      return () => {
        if (dismissId !== undefined) window.clearTimeout(dismissId);
        window.clearTimeout(timeoutId);
      };
    }

    const onLoad = () => dismiss("page-finished");
    window.addEventListener("load", onLoad, { once: true });
    return () => {
      window.removeEventListener("load", onLoad);
      if (dismissId !== undefined) window.clearTimeout(dismissId);
      window.clearTimeout(timeoutId);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="brand-loading" role="status" aria-label="Carregando DM Conecta">
      <div className="brand-loading__glow" aria-hidden="true" />
      <div className="brand-loading__logo-stage">
        <div className="brand-loading__orbit" aria-hidden="true" />
        <div className="brand-loading__logo-open">
          <DMMonogram size={142} tone="light" />
        </div>
      </div>
      <span className="sr-only">Carregando o site</span>
    </div>
  );
}
