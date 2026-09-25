"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useAuth } from "@/lib/app/auth";
import { isPlatformAdmin } from "@/lib/app/admin-access";
import { MY_DEMANDS_PATH } from "@/lib/app/demand";
import { INSTITUTIONAL_AREA_PATH } from "@/lib/app/institutional";
import { OPPORTUNITIES_PATH, canFilterOpportunities } from "@/lib/app/interest";
import { AGENDA_PATH, canIdentifyAgenda } from "@/lib/app/media";
import { MEMBERSHIPS_PATH, TEAM_PATH, managesTeam } from "@/lib/app/organization";
import { PROCESSES_PATH } from "@/lib/app/process";
import { PRIVACY_PATH } from "@/lib/app/privacy";
import { normalizeRole } from "@/lib/app/types";
import { DMLogo } from "./DMLogo";
import { Icon, type IconName } from "./Icon";
import { Avatar } from "./Avatar";
import { NotificationBell } from "./NotificationBell";
import { SearchButton } from "./SearchButton";
import { ThemeToggle } from "../ThemeToggle";
import { InstitutionBanner } from "./institution/InstitutionBanner";
import { useEffectiveRole } from "./institution/useInstitutionAccess";
import { ConsentBanner } from "./privacy/ConsentBanner";

type NavItem = { href: string; label: string; icon: IconName };

const NAV: NavItem[] = [
  { href: "/feed", label: "O pulso", icon: "bolt" },
  { href: "/mapa", label: "Território", icon: "map" },
  { href: "/conexoes", label: "Conexões", icon: "link" },
  { href: "/perfil", label: "Meu sinal", icon: "person" },
  // A barra inferior do mobile usa NAV[0..3] por índice; itens a partir daqui
  // aparecem na barra superior (desktop) e no menu da conta (mobile).
  { href: "/ranking", label: "Impacto", icon: "trophy" },
  // Agenda do território (T25): eventos, oficinas, mutirões, ações e aulas.
  { href: "/eventos", label: "Agenda", icon: "calendar" },
];

/** Atalhos por perfil que a barra superior mostra no desktop (no mobile ficam no menu da conta). */
const AGENT_NAV: NavItem = { href: MY_DEMANDS_PATH, label: "Minhas demandas", icon: "inventory" };
const GOVERNMENT_NAV: NavItem = { href: INSTITUTIONAL_AREA_PATH, label: "Atuação institucional", icon: "building" };
/** Comunicação identifica pautas e registra divulgação (T28, §3.5). */
const MEDIA_NAV: NavItem = { href: AGENDA_PATH, label: "Pautas", icon: "megaphone" };
/** Só para contas da operação (ver lib/app/admin-access.ts). */
const ADMIN_NAV: NavItem = { href: "/admin", label: "Painel", icon: "shield" };

/** Foco visível com contraste nos dois temas (petróleo no claro, quase branco no escuro). */
const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--th-text)]";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const isAdmin = isPlatformAdmin(user);
  // Papel efetivo (T29): a própria categoria ou a que o vínculo empresta.
  const { role: effective, access } = useEffectiveRole();
  // Agente de Transformação estrutura demandas (T09).
  const isAgent = effective === "agent";
  // Poder Público atua nas demandas do território (T13).
  const isGovernment = effective === "government";
  // Titular do cadastro institucional ou gestor por vínculo gere a equipe (T29).
  const managesOrganization = Boolean(user && managesTeam(access));
  // Membro da Comunidade se inscreve em eventos (T25, slide 9).
  const isMember = Boolean(user && normalizeRole(user.role, user.profileType) === "member");
  // Agente e Poder Público publicam eventos do território (T25, slides 8 e 11).
  const organizesEvents = isAgent || isGovernment;
  // Parceiros e Poder Público filtram oportunidades de apoio (T15).
  const seesOpportunities = Boolean(user && canFilterOpportunities(user.role, user.profileType));
  // Comunicação identifica pautas e registra divulgação (T28).
  const isMedia = Boolean(user && canIdentifyAgenda(user.role, user.profileType));

  const profileNav: NavItem[] = [
    ...(isAgent ? [AGENT_NAV] : []),
    ...(isGovernment ? [GOVERNMENT_NAV] : []),
    ...(isMedia ? [MEDIA_NAV] : []),
    ...(isAdmin ? [ADMIN_NAV] : []),
  ];

  const isActive = (href: string) =>
    href === "/perfil" ? pathname === "/perfil" : pathname === href || pathname.startsWith(href + "/");

  function handleLogout() {
    logout();
    router.push("/login");
  }

  const accountMenu = (placement: "header" | "rail" = "header") => (
    <AccountMenu
      placement={placement}
      user={user}
      flags={{ isAgent, isGovernment, isMember, isAdmin, organizesEvents, seesOpportunities, isMedia, managesOrganization }}
      onNavigate={(href) => router.push(href)}
      onLogout={handleLogout}
    />
  );

  return (
    <div className="app-mesh flex min-h-dvh flex-col">
      {/* ── Barra superior (Menu Desktop + Header Mobile) ───── */}
      <header className="nav-blur sticky top-0 z-30 w-full border-b transition-colors">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-3 sm:px-4 lg:gap-4 lg:px-6">
          {/* Esquerda: Marca e Logo */}
          <div className="flex shrink-0 items-center">
            <Link
              href="/feed"
              className={`flex items-center rounded-lg transition-opacity hover:opacity-90 ${FOCUS_RING}`}
              style={{ color: "var(--th-text)" }}
            >
              <span className="hidden sm:inline-flex">
                <DMLogo size={32} tone="plain" />
              </span>
              <span className="sm:hidden">
                <DMLogo size={28} tone="plain" />
              </span>
              <span className="sr-only">DM Conecta — O pulso</span>
            </Link>
          </div>

          {/* Centro: Menu na Barra Superior (Desktop) */}
          <nav aria-label="Navegação principal" className="hidden items-center gap-1 lg:flex xl:gap-1.5">
            {NAV.map((item) => (
              <TopNavItem key={item.href} item={item} active={isActive(item.href)} />
            ))}
            {profileNav.length > 0 && (
              <>
                <span className="mx-1 h-5 w-px bg-[var(--th-border)]" aria-hidden="true" />
                {profileNav.map((item) => (
                  <TopNavItem key={item.href} item={item} active={isActive(item.href)} />
                ))}
              </>
            )}
          </nav>

          {/* Direita: Ação primária, utilitários, tema e conta */}
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2 lg:gap-3">
            {/* Botão Registrar sinal — Ação primária em destaque */}
            <Link
              href="/criar"
              className={`hidden sm:inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#f4841a] to-[#f89b45] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:brightness-105 active:scale-95 lg:text-sm ${FOCUS_RING}`}
              style={{ boxShadow: "0 2px 8px rgba(244,132,26,0.25)" }}
            >
              <Icon name="plus" size={17} strokeWidth={2.6} />
              <span>Registrar sinal</span>
            </Link>

            <span className="hidden h-5 w-px bg-[var(--th-border)] sm:block" aria-hidden="true" />

            <SearchButton />
            <NotificationBell userId={user?.id ?? null} government={isGovernment} />
            <ThemeToggle />

            {!user && (
              <Link
                href="/login?next=%2Fcriar"
                className={`hidden sm:inline-flex rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-[var(--th-card-alt)] lg:text-sm ${FOCUS_RING}`}
                style={{ color: "var(--th-text)", borderColor: "var(--th-border)" }}
              >
                Entrar
              </Link>
            )}

            {accountMenu("header")}
          </div>
        </div>
      </header>

      {/* ── Conteúdo Principal ───────────────────────────────── */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-3 pb-28 pt-4 sm:px-4 sm:pt-6 lg:px-6 lg:pb-12">
        {/* Requisito institucional (decisões 2 e 3); a própria ficha e o /criar têm aviso próprio. */}
        {!pathname.startsWith("/cadastro-institucional") && pathname !== "/criar" && <InstitutionBanner className="mb-4" />}
        {/* Aceite de versão nova dos Termos e da Política (T24). */}
        <ConsentBanner className="mb-4" />
        {children}
      </main>

      {/* ── Barra inferior estilo app (mobile) ──────────────── */}
      <nav
        aria-label="Navegação principal móvel"
        className="nav-blur fixed inset-x-0 bottom-0 z-40 border-t shadow-[0_-4px_24px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_24px_rgba(0,0,0,0.3)] lg:hidden"
        style={{ paddingBottom: "max(0.6rem, env(safe-area-inset-bottom))" }}
      >
        <div className="relative mx-auto grid h-16 max-w-md grid-cols-5 items-center px-1">
          <BottomItem item={NAV[0]} active={isActive(NAV[0].href)} />
          <BottomItem item={NAV[1]} active={isActive(NAV[1].href)} />
          {/* FAB de registro central estilo app */}
          <div className="flex justify-center">
            <Link
              href="/criar"
              className="-mt-7 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-transform active:scale-90"
              style={{
                background: "linear-gradient(135deg, #f4841a, #f89b45)",
                boxShadow: "0 8px 24px rgba(244, 132, 26, 0.45)",
                border: "3.5px solid var(--th-bg)",
              }}
              aria-label="Registrar sinal"
            >
              <Icon name="plus" size={26} strokeWidth={2.8} />
            </Link>
          </div>
          <BottomItem item={NAV[2]} active={isActive(NAV[2].href)} />
          <BottomItem item={NAV[3]} active={isActive(NAV[3].href)} />
        </div>
      </nav>
    </div>
  );
}

type AccountFlags = {
  isAgent: boolean;
  isGovernment: boolean;
  isMember: boolean;
  isAdmin: boolean;
  organizesEvents: boolean;
  seesOpportunities: boolean;
  isMedia: boolean;
  managesOrganization: boolean;
};

/**
 * Botão de conta + menu suspenso. Abre no canto superior direito a partir do avatar.
 */
function AccountMenu({
  placement = "header",
  user,
  flags,
  onNavigate,
  onLogout,
}: {
  placement?: "header" | "rail";
  user: ReturnType<typeof useAuth>["user"];
  flags: AccountFlags;
  onNavigate: (href: string) => void;
  onLogout: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuId = `app-account-menu-${useId().replace(/:/g, "")}`;
  const { isAgent, isGovernment, isMember, isAdmin, organizesEvents, seesOpportunities, isMedia, managesOrganization } = flags;
  const rail = placement === "rail";

  // Esc fecha o menu da conta e devolve o foco ao botão que o abriu.
  useEffect(() => {
    if (!menuOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  function go(href: string) {
    setMenuOpen(false);
    onNavigate(href);
  }

  return (
    <div className="relative">
      <button
        ref={menuButtonRef}
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-label={user ? "Menu da conta" : "Menu do visitante"}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuId}
        className={`rounded-full transition-all duration-150 hover:ring-2 hover:ring-[#f4841a]/40 ${FOCUS_RING}`}
      >
        {user
          ? <Avatar name={user.name} src={user.avatarUrl} email={user.email} id={user.id} size={36} />
          : <Avatar name="Visitante" size={36} />}
      </button>
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
          <div
            id={menuId}
            role="menu"
            aria-label={user ? "Conta" : "Visitante"}
            className={`absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-2xl border shadow-2xl ${
              rail ? "bottom-full left-0 mb-2 top-auto" : ""
            }`}
            style={{ background: "var(--th-card)", borderColor: "var(--th-border)" }}
          >
            {user ? (
              <>
                <div className="border-b px-4 py-3" style={{ borderColor: "var(--th-border)" }}>
                  <p className="truncate text-sm font-semibold" style={{ color: "var(--th-text)" }}>{user.name}</p>
                  <p className="truncate text-xs" style={{ color: "var(--th-muted)" }}>{user.email}</p>
                </div>
                <MenuItem icon="person" label="Meu perfil" onClick={() => go("/perfil")} />
                <MenuItem icon="shield" label="Privacidade" onClick={() => go(PRIVACY_PATH)} />
                <MenuItem icon="calendar" label="Agenda" onClick={() => go("/eventos")} />
                <MenuItem icon="trophy" label="Impacto" onClick={() => go("/ranking")} />
                <MenuItem icon="volunteer" label="Ações apoiadas" onClick={() => go("/meus-apoios")} />
                {isAgent && <MenuItem icon="inventory" label="Minhas demandas" onClick={() => go(MY_DEMANDS_PATH)} />}
                {seesOpportunities && <MenuItem icon="filter" label="Oportunidades de apoio" onClick={() => go(OPPORTUNITIES_PATH)} />}
                {isMember && <MenuItem icon="calendar" label="Minhas inscrições" onClick={() => go("/minhas-inscricoes")} />}
                {organizesEvents && <MenuItem icon="calendar" label="Meus eventos" onClick={() => go("/meus-eventos")} />}
                {isGovernment && <MenuItem icon="building" label="Atuação institucional" onClick={() => go(INSTITUTIONAL_AREA_PATH)} />}
                {(isAgent || seesOpportunities) && <MenuItem icon="document" label="Processos de conexão" onClick={() => go(PROCESSES_PATH)} />}
                {isMedia && <MenuItem icon="megaphone" label="Pautas" onClick={() => go(AGENDA_PATH)} />}
                {managesOrganization && <MenuItem icon="users" label="Equipe da instituição" onClick={() => go(TEAM_PATH)} />}
                <MenuItem icon="link" label="Meus vínculos" onClick={() => go(MEMBERSHIPS_PATH)} />
                {isAdmin && <MenuItem icon="shield" label="Painel da operação" onClick={() => go("/admin")} />}
                <MenuItem icon="logout" label="Sair" onClick={onLogout} danger />
              </>
            ) : (
              <>
                {/* /eventos e /ranking são públicas (SSR, indexáveis). */}
                <MenuItem icon="calendar" label="Agenda" onClick={() => go("/eventos")} />
                <MenuItem icon="trophy" label="Impacto" onClick={() => go("/ranking")} />
                <MenuItem icon="person" label="Entrar ou criar conta" onClick={() => go("/login?next=%2Fperfil")} />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function TopNavItem({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`relative flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-all xl:gap-2 xl:px-3.5 xl:py-2 xl:text-sm ${FOCUS_RING} ${
        active
          ? "bg-[var(--th-card-alt)] font-bold text-[#f4841a] shadow-xs ring-1 ring-[#f4841a]/20"
          : "text-[var(--th-muted)] hover:bg-[var(--th-card-alt)] hover:text-[var(--th-text)]"
      }`}
    >
      <Icon name={item.icon} size={17} strokeWidth={active ? 2.4 : 1.8} />
      <span>{item.label}</span>
      {active && (
        <span
          aria-hidden="true"
          className="absolute inset-x-3 -bottom-0.5 h-[2px] rounded-full bg-[#f4841a]"
        />
      )}
    </Link>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: IconName; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--th-card-alt)] focus-visible:bg-[var(--th-card-alt)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#f4841a]"
      style={{ color: danger ? "#e53935" : "var(--th-text)" }}
    >
      <Icon name={icon} size={17} />
      {label}
    </button>
  );
}

function BottomItem({ item, active }: { item: { href: string; label: string; icon: IconName }; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`relative flex flex-col items-center justify-center gap-0.5 py-1 text-center transition-all ${FOCUS_RING} ${
        active ? "text-[#f4841a]" : "text-[var(--th-muted)] hover:text-[var(--th-text)]"
      }`}
    >
      <div className={`transition-transform duration-150 ${active ? "scale-110" : ""}`}>
        <Icon name={item.icon} size={22} strokeWidth={active ? 2.5 : 1.8} />
      </div>
      <span className={`text-[10px] tracking-tight ${active ? "font-bold text-[#f4841a]" : "font-medium"}`}>
        {item.label}
      </span>
      {active && (
        <span
          aria-hidden="true"
          className="absolute -bottom-1 h-1 w-4 rounded-full bg-[#f4841a]"
        />
      )}
    </Link>
  );
}
