"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/app/api";
import { normalizeMapView, normalizeThemeIntelligence } from "@/lib/app/landing";
import { emptyMapFilter } from "@/lib/app/map";
import type { MapTerritory, MapView, ThemeIntelligence } from "@/lib/app/types";

/**
 * Leitura pública que alimenta a landing (mapa e inteligência territorial).
 *
 * O SSR já entrega a leitura do banco. Quando ele não consegue (post-service
 * fora do ar, rede interna sem `DM_INTERNAL_POST_API_URL`, página pré-gerada
 * antes da API subir), `null` chega aqui e o navegador pede de novo, na mesma
 * origem (`/api/posts/demands/...`). É a mesma rota pública: não há dado local
 * nem amostra de reserva. Se a segunda tentativa também falhar, as seções
 * mostram o estado indisponível, sem inventar número.
 */
interface LandingDataValue {
  view: MapView | null;
  intelligence: ThemeIntelligence | null;
  /** Territórios com demanda publicada: as opções do filtro do mapa. */
  territories: MapTerritory[];
  /** Verdadeiro enquanto o navegador relê o que o SSR não trouxe. */
  recovering: boolean;
}

const LandingDataContext = createContext<LandingDataValue>({ view: null, intelligence: null, territories: [], recovering: false });

export function LandingDataProvider({
  initialView,
  initialIntelligence,
  territories: initialTerritories = [],
  children,
}: {
  initialView: MapView | null;
  initialIntelligence: ThemeIntelligence | null;
  territories?: MapTerritory[];
  children: ReactNode;
}) {
  const [view, setView] = useState<MapView | null>(initialView);
  const [intelligence, setIntelligence] = useState<ThemeIntelligence | null>(initialIntelligence);
  const [territories, setTerritories] = useState<MapTerritory[]>(initialTerritories);
  const missing = initialView === null || initialIntelligence === null;
  const [recovering, setRecovering] = useState(missing);

  useEffect(() => {
    if (!missing) return;
    let active = true;
    const jobs: Promise<unknown>[] = [];
    if (initialView === null) {
      jobs.push(
        api.demandMap(emptyMapFilter())
          .then((next) => { const fresh = normalizeMapView(next); if (active && fresh) setView(fresh); })
          .catch(() => undefined),
      );
    }
    if (initialIntelligence === null) {
      jobs.push(
        api.themeIntelligence()
          .then((next) => { const fresh = normalizeThemeIntelligence(next); if (active && fresh) setIntelligence(fresh); })
          .catch(() => undefined),
      );
    }
    // Sem a leitura do SSR, a lista de territórios do filtro também não veio.
    if (initialTerritories.length === 0) {
      jobs.push(
        api.mapTerritories()
          .then((next) => { if (active && next.length) setTerritories(next); })
          .catch(() => undefined),
      );
    }
    void Promise.all(jobs).then(() => { if (active) setRecovering(false); });
    return () => { active = false; };
  }, [missing, initialView, initialIntelligence, initialTerritories]);

  const value = useMemo(() => ({ view, intelligence, territories, recovering }), [view, intelligence, territories, recovering]);
  return <LandingDataContext.Provider value={value}>{children}</LandingDataContext.Provider>;
}

export function useLandingData(): LandingDataValue {
  return useContext(LandingDataContext);
}
