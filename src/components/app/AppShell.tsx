"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/app/auth";
import { isPlatformAdmin } from "@/lib/app/admin-access";
import { MY_DEMANDS_PATH } from "@/lib/app/demand";
import { INSTITUTIONAL_AREA_PATH } from "@/lib/app/institutional";
import { normalizeRole } from "@/lib/app/types";
import { DMLogo } from "./DMLogo";
import { Icon, type IconName } from "./Icon";
import { Avatar } from "./Avatar";
import { NotificationBell } from "./NotificationBell";
import { SearchButton } from "./SearchButton";
import { ThemeToggle } from "../ThemeToggle";
import { InstitutionBanner } from "./institution/InstitutionBanner";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/feed", label: "O pulso", icon: "bolt" },
  { href: "/mapa", label: "Território", icon: "map" },
  { href: "/conexoes", label: "Conexões", icon: "link" },
  { href: "/perfil", label: "Meu sinal", icon: "person" },
  // A barra inferior do mobile usa NAV[0..3] por índice; itens a partir daqui
  // aparecem só no menu do topo (desktop) e no dropdown da conta (mobile).
  { href: "/ranking", label: "Impacto", icon: "trophy" },
];

/** Só para contas da operação (ver lib/app/admin-access.ts). */
const ADMIN_NAV: { href: string; label: string; icon: IconName } = { href: "/admin", label: "Painel", icon: "shield" };

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const isAdmin = isPlatformAdmin(user);
  // Agente de Transformação estrutura demandas (T09).
  const isAgent = Boolean(user && normalizeRole(user.role, user.profileType) === "agent");
  // Poder Público atua nas demandas do território (T13).
  const isGovernment = Boolean(user && normalizeRole(user.role, user.profileType) === "government");

  const isActive = (href: string) =>
    href === "/perfil" ? pathname === "/perfil" : pathname === href || pathname.startsWith(href + "/");

  function handleLogout() {
    logout();
    router.push("/login");
  }

  return (
    <div className="app-mesh min-h-dvh">
      {/* ── Header ───────────────────────────────────────── */}
      <header className="nav-blur sticky top-0 z-40 border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <Link href="/feed" className="flex shrink-0 items-center" style={{ color: "var(--th-text)" }}>
            <DMLogo size={30} tone="plain" />
          </Link>

          {/* O menu só cabe ao lado dos botões a partir de lg — abaixo disso
              quem navega é a barra inferior. */}
          <nav className="ml-2 hidden min-w-0 items-center gap-0.5 lg:flex">
            {(isAdmin ? [...NAV, ADMIN_NAV] : NAV).map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-semibold transition-colors"
                  style={{
                    color: active ? "#f4841a" : "var(--th-muted)",
                    background: active ? "rgba(244,132,26,0.10)" : "transparent",
                  }}
                >
                  <Icon name={item.icon} size={18} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {!user && (
              <Link href="/login?next=%2Fcriar" className="hidden rounded-lg px-3 py-2 text-sm font-semibold lg:inline-flex" style={{ color: "#f4841a" }}>
                Entrar
              </Link>
            )}
            <Link
              href="/criar"
              className="hidden h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white lg:inline-flex"
              style={{ background: "linear-gradient(135deg,#f4841a,#f89b45)" }}
            >
              <Icon name="plus" size={18} /> Registrar sinal
            </Link>
            <SearchButton />
            <ThemeToggle />
            <NotificationBell userId={user?.id ?? null} />

            {/* avatar + menu */}
            {user ? <div className="relative">
              <button type="button" onClick={() => setMenuOpen((v) => !v)} aria-label="Conta">
                <Avatar name={user.name} src={user.avatarUrl} email={user.email} id={user.id} size={36} />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                  <div
                    className="absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-xl border shadow-xl"
                    style={{ background: "var(--th-card)", borderColor: "var(--th-border)" }}
                  >
                    <div className="border-b px-4 py-3" style={{ borderColor: "var(--th-border)" }}>
                      <p className="truncate text-sm font-semibold" style={{ color: "var(--th-text)" }}>{user?.name}</p>
                      <p className="truncate text-xs" style={{ color: "var(--th-muted)" }}>{user?.email}</p>
                    </div>
                    <MenuItem icon="person" label="Meu perfil" onClick={() => { setMenuOpen(false); router.push("/perfil"); }} />
                    <MenuItem icon="trophy" label="Impacto" onClick={() => { setMenuOpen(false); router.push("/ranking"); }} />
                    <MenuItem icon="volunteer" label="Ações apoiadas" onClick={() => { setMenuOpen(false); router.push("/meus-apoios"); }} />
                    {isAgent && <MenuItem icon="inventory" label="Minhas demandas" onClick={() => { setMenuOpen(false); router.push(MY_DEMANDS_PATH); }} />}
                    {isGovernment && <MenuItem icon="building" label="Atuação institucional" onClick={() => { setMenuOpen(false); router.push(INSTITUTIONAL_AREA_PATH); }} />}
                    {isAdmin && <MenuItem icon="shield" label="Painel da operação" onClick={() => { setMenuOpen(false); router.push("/admin"); }} />}
                    <MenuItem icon="logout" label="Sair" onClick={handleLogout} danger />
                  </div>
                </>
              )}
            </div> : <Link href="/login?next=%2Fperfil" aria-label="Entrar ou criar conta"><Avatar name="Visitante" size={36} /></Link>}
          </div>
        </div>
      </header>

      {/* ── Conteúdo ─────────────────────────────────────── */}
      <main className="mx-auto max-w-6xl px-3 pb-28 pt-5 sm:px-4 lg:pb-10">
        {/* Requisito institucional (decisões 2 e 3); a própria ficha e o /criar têm aviso próprio. */}
        {!pathname.startsWith("/cadastro-institucional") && pathname !== "/criar" && <InstitutionBanner className="mb-4" />}
        {children}
      </main>

      {/* ── Bottom nav (mobile) ──────────────────────────── */}
      <nav
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

function MenuItem({ icon, label, onClick, danger }: { icon: IconName; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--th-card-alt)]"
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
