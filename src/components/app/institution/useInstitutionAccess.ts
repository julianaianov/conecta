"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import { NO_INSTITUTION_ACCESS } from "@/lib/app/institution";
import { effectiveRole } from "@/lib/app/organization";
import type { InstitutionAccess, UserRole } from "@/lib/app/types";

const TTL_MS = 60_000;
let cache: { userId: string; access: InstitutionAccess; at: number } | null = null;
const listeners = new Set<() => void>();

/** Descarta o estado guardado (depois de salvar ou enviar o cadastro). */
export function invalidateInstitutionAccess(next?: { userId: string; access: InstitutionAccess }) {
  cache = next ? { ...next, at: Date.now() } : null;
  listeners.forEach((listener) => listener());
}

/**
 * Estado institucional da conta logada (GET /api/users/me/institution/status).
 * Vale para toda conta logada: Agente e Poder Público têm cadastro próprio; as
 * demais categorias podem agir por vínculo a uma instituição (T29,
 * `access.delegation`). Uma consulta barata, com cache de 60 s.
 */
export function useInstitutionAccess(): { access: InstitutionAccess; loading: boolean; applicable: boolean } {
  const { user } = useAuth();
  const applicable = Boolean(user);
  const userId = user?.id ?? null;
  const [state, setState] = useState<{ userId: string | null; access: InstitutionAccess | null }>(() => ({
    userId,
    access: userId && cache?.userId === userId && Date.now() - cache.at < TTL_MS ? cache.access : null,
  }));
  const [version, setVersion] = useState(0);

  const bump = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    listeners.add(bump);
    return () => { listeners.delete(bump); };
  }, [bump]);

  useEffect(() => {
    if (!applicable || !userId) return;
    if (cache?.userId === userId && Date.now() - cache.at < TTL_MS) {
      const access = cache.access;
      setState((current) => (current.userId === userId && current.access === access ? current : { userId, access }));
      return;
    }
    let alive = true;
    api.myInstitutionAccess()
      .then((access) => {
        cache = { userId, access, at: Date.now() };
        if (alive) setState({ userId, access });
      })
      .catch(() => {
        // Sem resposta do serviço: sem banner (o servidor continua aplicando a regra).
        if (alive) setState({ userId, access: NO_INSTITUTION_ACCESS });
      });
    return () => { alive = false; };
  }, [applicable, userId, version]);

  if (!applicable) return { access: NO_INSTITUTION_ACCESS, loading: false, applicable: false };
  const access = state.userId === userId ? state.access : null;
  return { access: access ?? NO_INSTITUTION_ACCESS, loading: access === null, applicable: true };
}

/**
 * Papel efetivo da conta (T29): o próprio para Agente e Poder Público; para as
 * demais categorias, o que o vínculo empresta (`publicar_demandas` → Agente,
 * `atuar_institucionalmente` → Poder Público). `resolving` enquanto a
 * delegação ainda não foi lida — as telas de Agente/Poder Público esperam
 * antes de dizer que a área não é da conta.
 */
export function useEffectiveRole(): { role: UserRole | null; resolving: boolean; access: InstitutionAccess } {
  const { user } = useAuth();
  const { access, loading } = useInstitutionAccess();
  const role = effectiveRole(user, access);
  const ownIsInstitutional = role === "agent" || role === "government";
  return { role, resolving: Boolean(user) && loading && !ownIsInstitutional && !access.delegation, access };
}
