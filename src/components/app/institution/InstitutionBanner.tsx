"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/app/auth";
import { INSTITUTION_HUB_PATH, institutionRequirement } from "@/lib/app/institution";
import { MEMBERSHIPS_PATH, MEMBER_LEVEL_LABELS, type OrganizationMemberLevel } from "@/lib/app/organization";
import { Icon } from "../Icon";
import { useInstitutionAccess } from "./useInstitutionAccess";

function dismissKey(userId: string, status: string | null) {
  return `dmc_inst_banner:${userId}:${status ?? "sem_cadastro"}`;
}

function readDismissed(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/**
 * Explica o requisito institucional (decisões 2 e 3) para Agente de
 * Transformação e Poder Público sem cadastro validado. Não aparece para as
 * demais categorias nem depois da validação.
 */
export function InstitutionBanner({ dismissible = true, className = "" }: { dismissible?: boolean; className?: string }) {
  const { user } = useAuth();
  const { access, loading, applicable } = useInstitutionAccess();
  const key = user ? dismissKey(user.id, access.status) : null;
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  useEffect(() => {
    if (key && dismissible && readDismissed(key)) setDismissedKey(key);
  }, [key, dismissible]);

  if (!user || !applicable || loading) return null;
  // Vínculo (T29): quem atua por delegação vê de quem é a instituição, sem
  // pedido de cadastro próprio.
  const delegation = access.delegation ?? null;
  const requirement = delegation
    ? {
      kind: access.kind ?? "agente_transformacao",
      blocking: false,
      title: `Você atua em nome de ${delegation.organizationName}`,
      message: `Vínculo como ${MEMBER_LEVEL_LABELS[delegation.level as OrganizationMemberLevel] ?? delegation.level}${access.status === "validada" ? "" : " (instituição ainda não validada)"}. Veja e encerre o vínculo em Meus vínculos.`,
    }
    : institutionRequirement(user.role, user.profileType, access.status);
  if (!requirement || (dismissible && dismissedKey === key)) return null;

  const accent = requirement.blocking ? "#2e7ba8" : "#f4841a";
  const cta = delegation ? "Meus vínculos" : access.status === "em_analise" ? "Acompanhar cadastro" : access.status ? "Revisar cadastro" : "Fazer cadastro institucional";
  const href = delegation ? MEMBERSHIPS_PATH : INSTITUTION_HUB_PATH;

  function dismiss() {
    if (!key) return;
    try { sessionStorage.setItem(key, "1"); } catch { /* sem armazenamento: some só nesta tela */ }
    setDismissedKey(key);
  }

  return (
    <aside
      aria-label="Cadastro institucional"
      className={`app-card flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center ${className}`}
      style={{ borderLeft: `4px solid ${accent}` }}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${accent}1f`, color: accent }}>
        <Icon name={requirement.kind === "poder_publico" ? "shield" : "building"} size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold" style={{ color: "var(--th-text)" }}>{requirement.title}</p>
        <p className="mt-0.5 text-sm" style={{ color: "var(--th-muted)" }}>{requirement.message}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link href={href} className="inline-flex h-9 items-center rounded-lg px-3.5 text-[13px] font-semibold text-white" style={{ background: "linear-gradient(135deg,#0d2d42,#1b4f72)" }}>
          {cta}
        </Link>
        {dismissible && (
          <button type="button" onClick={dismiss} className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ color: "var(--th-muted)" }} aria-label="Ocultar aviso nesta sessão">
            <Icon name="close" size={16} />
          </button>
        )}
      </div>
    </aside>
  );
}
