"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import { NO_INSTITUTION_ACCESS } from "@/lib/app/institution";
import { institutionKindFor, type InstitutionAccess } from "@/lib/app/types";

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
 * Só consulta para Agente de Transformação e Poder Público; as demais
 * categorias não têm cadastro institucional.
 */
export function useInstitutionAccess(): { access: InstitutionAccess; loading: boolean; applicable: boolean } {
  const { user } = useAuth();
  const applicable = Boolean(user && institutionKindFor(user.role, user.profileType));
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
