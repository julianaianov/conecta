"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/app/auth";
import { DMLogo } from "./DMLogo";
import { Icon, type IconName } from "./Icon";
import { Avatar } from "./Avatar";
import { ThemeToggle } from "../ThemeToggle";

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/feed", label: "Início", icon: "home" },
  { href: "/mapa", label: "Mapa", icon: "map" },
  { href: "/comunidades", label: "Comunidades", icon: "groups" },
  { href: "/perfil", label: "Perfil", icon: "person" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, demoMode, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

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
          <Link href="/feed" className="flex items-center" style={{ color: "var(--th-text)" }}>
            <DMLogo size={30} tone="plain" />
          </Link>

          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {NAV.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors"
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

          <div className="ml-auto flex items-center gap-2">
            {demoMode && (
              <span
                className="hidden rounded-full px-2.5 py-1 text-[11px] font-bold sm:inline-block"
                style={{ background: "rgba(244,132,26,0.14)", color: "#f4841a" }}
              >
                MODO DEMO
              </span>
            )}
            <Link
              href="/criar"
              className="hidden h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white md:inline-flex"
              style={{ background: "linear-gradient(135deg,#f4841a,#f89b45)" }}
            >
              <Icon name="plus" size={18} /> Publicar
            </Link>
            <ThemeToggle />
            <button
              type="button"
              className="relative flex h-9 w-9 items-center justify-center rounded-lg border"
              style={{ borderColor: "var(--th-border)", color: "var(--th-muted)", background: "var(--th-surface)" }}
              aria-label="Notificações"
            >
              <Icon name="bell" size={17} />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full" style={{ background: "#f4841a" }} />
            </button>

            {/* avatar + menu */}
            <div className="relative">
              <button type="button" onClick={() => setMenuOpen((v) => !v)} aria-label="Conta">
                <Avatar name={user?.name ?? "Visitante"} src={user?.avatarUrl} id={user?.id} size={36} />
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
                    <MenuItem icon="heart" label="Meus apoios" onClick={() => { setMenuOpen(false); router.push("/meus-apoios"); }} />
                    <MenuItem icon="logout" label="Sair" onClick={handleLogout} danger />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── Conteúdo ─────────────────────────────────────── */}
      <main className="mx-auto max-w-6xl px-3 pb-28 pt-5 sm:px-4 md:pb-10">{children}</main>

      {/* ── Bottom nav (mobile) ──────────────────────────── */}
      <nav
        className="nav-blur fixed inset-x-0 bottom-0 z-40 border-t md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="relative mx-auto grid h-16 max-w-md grid-cols-5 items-center px-2">
          <BottomItem item={NAV[0]} active={isActive(NAV[0].href)} />
          <BottomItem item={NAV[1]} active={isActive(NAV[1].href)} />
          <div className="flex justify-center">
            <Link
              href="/criar"
              className="-mt-8 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg"
              style={{ background: "linear-gradient(135deg,#f4841a,#f89b45)", boxShadow: "0 8px 20px rgba(244,132,26,0.4)" }}
              aria-label="Publicar"
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
