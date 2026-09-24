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
import { PRIVACY_PATH } from "@/lib/app/privacy";
import { normalizeRole } from "@/lib/app/types";
import { DMLogo, DMMonogram } from "./DMLogo";
import { Icon, type IconName } from "./Icon";
import { Avatar } from "./Avatar";
import { NotificationBell } from "./NotificationBell";
import { SearchButton } from "./SearchButton";
import { ThemeToggle } from "../ThemeToggle";
import { InstitutionBanner } from "./institution/InstitutionBanner";
import { ConsentBanner } from "./privacy/ConsentBanner";

type NavItem = { href: string; label: string; icon: IconName };

const NAV: NavItem[] = [
  { href: "/feed", label: "O pulso", icon: "bolt" },
  { href: "/mapa", label: "Território", icon: "map" },
  { href: "/conexoes", label: "Conexões", icon: "link" },
  { href: "/perfil", label: "Meu sinal", icon: "person" },
  // A barra inferior do mobile usa NAV[0..3] por índice; itens a partir daqui
  // aparecem só no trilho lateral (desktop) e no dropdown da conta (mobile).
  { href: "/ranking", label: "Impacto", icon: "trophy" },
  // Agenda do território (T25): eventos, oficinas, mutirões, ações e aulas.
  { href: "/eventos", label: "Agenda", icon: "calendar" },
];

/** Atalhos por perfil que o trilho lateral mostra no desktop (no mobile ficam no menu da conta). */
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
  // Agente de Transformação estrutura demandas (T09).
  const isAgent = Boolean(user && normalizeRole(user.role, user.profileType) === "agent");
  // Poder Público atua nas demandas do território (T13).
  const isGovernment = Boolean(user && normalizeRole(user.role, user.profileType) === "government");
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

  const accountMenu = (placement: "header" | "rail") => (
    <AccountMenu
      placement={placement}
      user={user}
      flags={{ isAgent, isGovernment, isMember, isAdmin, organizesEvents, seesOpportunities, isMedia }}
      onNavigate={(href) => router.push(href)}
      onLogout={handleLogout}
    />
  );

  return (
    <div className="app-mesh min-h-dvh">
      {/* ── Trilho lateral (desktop, a partir de lg) ─────────
          Em lg (1024px) é estreito, com ícone e rótulo curto empilhados; em xl
          (1280px+) abre com ícone e rótulo em linha. Abaixo de lg quem navega é
          a barra inferior. */}
      <aside
        aria-label="Trilho lateral"
        className="app-rail fixed inset-y-0 left-0 z-40 hidden w-[5.5rem] flex-col border-r lg:flex xl:w-60"
      >
        <div className="flex h-16 shrink-0 items-center justify-center px-3 xl:justify-start xl:px-5">
          <Link href="/feed" className={`flex items-center rounded-lg ${FOCUS_RING}`} style={{ color: "var(--th-text)" }}>
            <span className="xl:hidden"><DMMonogram size={30} tone="plain" /><span className="sr-only">DM Conecta — O pulso</span></span>
            <span className="hidden xl:inline-flex"><DMLogo size={30} tone="plain" /></span>
          </Link>
        </div>

        {/* Ação primária em destaque: petróleo (base da marca) com o sinal em laranja cívico. */}
        <div className="shrink-0 px-2.5 pb-3 xl:px-4">
          <Link
            href="/criar"
            className={`rail-primary flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-2.5 text-center text-[11px] font-semibold leading-tight text-white shadow-sm xl:flex-row xl:gap-2 xl:px-4 xl:py-3 xl:text-sm ${FOCUS_RING}`}
          >
            <Icon name="plus" size={20} className="text-[#f4841a]" strokeWidth={2.6} />
            Registrar sinal
          </Link>
        </div>

        <nav aria-label="Navegação principal" className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 xl:px-3">
          <ul className="flex flex-col gap-0.5">
            {NAV.map((item) => (
              <li key={item.href}><RailItem item={item} active={isActive(item.href)} /></li>
            ))}
          </ul>
          {profileNav.length > 0 && (
            <>
              <p className="mt-4 mb-1 hidden px-3 text-[11px] font-semibold uppercase tracking-wide xl:block" style={{ color: "var(--th-muted)" }}>
                Sua atuação
              </p>
              <hr className="mx-3 my-3 xl:hidden" style={{ borderColor: "var(--th-border)" }} />
              <ul className="flex flex-col gap-0.5">
                {profileNav.map((item) => (
                  <li key={item.href}><RailItem item={item} active={isActive(item.href)} /></li>
                ))}
              </ul>
            </>
          )}
        </nav>

        {/* Conta e tema, no pé do trilho. */}
        <div className="flex shrink-0 flex-col gap-2 border-t px-2 py-3 xl:px-4" style={{ borderColor: "var(--th-border)" }}>
          {!user && (
            <Link
              href="/login?next=%2Fcriar"
              className={`rounded-lg border px-2 py-1.5 text-center text-xs font-semibold xl:text-sm ${FOCUS_RING}`}
              style={{ color: "var(--th-text)", borderColor: "var(--th-border)" }}
            >
              Entrar
            </Link>
          )}
          <div className="flex flex-col items-center gap-2 xl:flex-row">
            <div className="xl:min-w-0 xl:flex-1">{accountMenu("rail")}</div>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* ── Coluna de conteúdo (desloca pela largura do trilho) ── */}
      <div className="lg:pl-[5.5rem] xl:pl-60">
        {/* Header: no mobile tem marca, busca, tema, sino e conta; no desktop
            vira uma barra fina com busca e sino (o resto está no trilho). */}
        <header className="nav-blur sticky top-0 z-30 border-b">
          <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 lg:h-14">
            <Link href="/feed" className="flex shrink-0 items-center lg:hidden" style={{ color: "var(--th-text)" }}>
              <DMLogo size={30} tone="plain" />
            </Link>

            <div className="ml-auto flex shrink-0 items-center gap-2">
              <SearchButton />
              <div className="lg:hidden"><ThemeToggle /></div>
              <NotificationBell userId={user?.id ?? null} government={isGovernment} />
              {/* No mobile, Agenda e Impacto não cabem na barra inferior
                  (NAV[4..]); o menu da conta — e o do visitante — é o caminho
                  até eles, a um toque além da barra. */}
              <div className="lg:hidden">{accountMenu("header")}</div>
            </div>
          </div>
        </header>

        {/* ── Conteúdo ─────────────────────────────────────── */}
        <main className="mx-auto max-w-6xl px-3 pb-28 pt-5 sm:px-4 lg:px-6 lg:pb-10">
          {/* Requisito institucional (decisões 2 e 3); a própria ficha e o /criar têm aviso próprio. */}
          {!pathname.startsWith("/cadastro-institucional") && pathname !== "/criar" && <InstitutionBanner className="mb-4" />}
          {/* Aceite de versão nova dos Termos e da Política (T24). */}
          <ConsentBanner className="mb-4" />
          {children}
        </main>
      </div>

      {/* ── Bottom nav (mobile) ──────────────────────────── */}
      <nav
        aria-label="Navegação principal"
        className="nav-blur fixed inset-x-0 bottom-0 z-40 border-t lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="relative mx-auto grid h-16 max-w-md grid-cols-5 items-center px-2">
          <BottomItem item={NAV[0]} active={isActive(NAV[0].href)} />
          <BottomItem item={NAV[1]} active={isActive(NAV[1].href)} />
            {/* FAB de registro — visível para todos os perfis; /criar explica a
              restrição a quem não pode registrar sinais */}
          <div className="flex justify-center">
            <Link
              href="/criar"
              className="-mt-8 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg"
              style={{ background: "linear-gradient(135deg,#f4841a,#f89b45)", boxShadow: "0 8px 20px rgba(244,132,26,0.4)" }}
              aria-label="Registrar sinal"
            >
              <Icon name="plus" size={26} />
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
};

/**
 * Botão de conta + menu. Aparece no header do mobile (abre para baixo) e no pé
 * do trilho lateral do desktop (abre para cima). Só um dos dois fica visível
 * por largura de tela.
 */
function AccountMenu({
  placement,
  user,
  flags,
  onNavigate,
  onLogout,
}: {
  placement: "header" | "rail";
  user: ReturnType<typeof useAuth>["user"];
  flags: AccountFlags;
  onNavigate: (href: string) => void;
  onLogout: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuId = `app-account-menu-${useId().replace(/:/g, "")}`;
  const { isAgent, isGovernment, isMember, isAdmin, organizesEvents, seesOpportunities, isMedia } = flags;
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
        className={
          rail
            ? `flex items-center gap-2.5 rounded-full xl:w-full xl:rounded-xl xl:p-1 xl:pr-2 xl:hover:bg-[var(--th-card-alt)] ${FOCUS_RING}`
            : `rounded-full ${FOCUS_RING}`
        }
      >
        {user
          ? <Avatar name={user.name} src={user.avatarUrl} email={user.email} id={user.id} size={36} />
          : <Avatar name="Visitante" size={36} />}
        {rail && (
          <span className="hidden min-w-0 text-left xl:block">
            <span className="block truncate text-sm font-semibold" style={{ color: "var(--th-text)" }}>
              {user ? user.name : "Visitante"}
            </span>
            <span className="block truncate text-xs" style={{ color: "var(--th-muted)" }}>Conta</span>
          </span>
        )}
      </button>
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
          <div
            id={menuId}
            role="menu"
            aria-label={user ? "Conta" : "Visitante"}
            className={`absolute z-50 w-56 overflow-hidden rounded-xl border shadow-xl ${rail ? "bottom-full left-0 mb-2" : "right-0 top-12"}`}
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
                {isMedia && <MenuItem icon="megaphone" label="Pautas" onClick={() => go(AGENDA_PATH)} />}
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

function RailItem({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`rail-item relative flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-center text-[11px] leading-tight transition-colors xl:flex-row xl:gap-3 xl:px-3 xl:py-2.5 xl:text-left xl:text-sm ${active ? "font-bold" : "font-medium"} ${FOCUS_RING}`}
    >
      {/* Indicador do item ativo: laranja cívico como apoio visual, não como cor do texto. */}
      {active && <span aria-hidden="true" className="absolute inset-y-2 left-0 w-1 rounded-full bg-[#f4841a]" />}
      <Icon name={item.icon} size={20} strokeWidth={active ? 2.4 : 1.9} />
      <span>{item.label}</span>
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
    <Link href={item.href} className="flex flex-col items-center justify-center gap-0.5" style={{ color: active ? "#f4841a" : "var(--th-muted)" }}>
      <Icon name={item.icon} size={22} strokeWidth={active ? 2.4 : 1.8} />
      <span className="text-[10px] font-semibold">{item.label}</span>
    </Link>
  );
}
