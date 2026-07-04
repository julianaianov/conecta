import Link from "next/link";
import { DMLogo } from "./app/DMLogo";
import { ThemeToggle } from "./ThemeToggle";
import { APP_URL, NAV_LINKS } from "@/lib/constants";

type ButtonProps = {
  href: string;
  variant?: "primary" | "ghost" | "outline";
  size?: "md" | "lg";
  block?: boolean;
  children: React.ReactNode;
  className?: string;
};

const variantClasses = {
  primary:
    "bg-orange text-white shadow-sm shadow-orange/20 hover:bg-orange-light",
  ghost:
    "hover:bg-black/5",
  outline:
    "border border-[var(--th-border)] hover:border-orange/60 hover:bg-orange/10",
};

const sizeClasses = {
  md: "px-5 py-2 text-sm",
  lg: "px-7 py-3.5 text-base",
};

export function Button({
  href,
  variant = "primary",
  size = "md",
  block = false,
  children,
  className = "",
}: ButtonProps) {
  return (
    <Link
      href={href}
      style={variant !== "primary" ? { color: "var(--th-text)" } : undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-all duration-200 ${variantClasses[variant]} ${sizeClasses[size]} ${block ? "w-full" : ""} ${className}`}
    >
      {children}
    </Link>
  );
}

export function Navbar() {
  return (
    <header className="nav-blur fixed inset-x-0 top-0 z-50 border-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3 lg:px-8">

        {/* Logo */}
        <Link href="/" className="flex items-center" style={{ color: "var(--th-text)" }}>
          <DMLogo size={30} tone="petroleo" />
        </Link>

        {/* Nav links — center */}
        <nav className="hidden items-center gap-6 md:flex" aria-label="Principal">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              style={{ color: "var(--th-muted)" }}
              className="text-sm font-medium transition-colors hover:text-orange"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Actions — right */}
        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle />
          <Link
            href={`${APP_URL}/login`}
            style={{ color: "var(--th-muted)" }}
            className="rounded-lg px-4 py-2 text-sm font-semibold transition-colors hover:text-orange"
          >
            Entrar
          </Link>
          <Link
            href={`${APP_URL}/register`}
            className="rounded-lg bg-orange px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-orange-light"
          >
            Criar conta
          </Link>
        </div>

        {/* Mobile */}
        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <MobileNav />
        </div>
      </div>
    </header>
  );
}

function MobileNav() {
  return (
    <details className="group relative">
      <summary
        style={{ borderColor: "var(--th-border)" }}
        className="flex h-9 w-9 cursor-pointer list-none flex-col items-center justify-center gap-1.5 rounded-lg border [&::-webkit-details-marker]:hidden"
      >
        <span style={{ background: "var(--th-text)" }} className="h-0.5 w-4.5 transition-transform group-open:translate-y-2 group-open:rotate-45" />
        <span style={{ background: "var(--th-text)" }} className="h-0.5 w-4.5 transition-opacity group-open:opacity-0" />
        <span style={{ background: "var(--th-text)" }} className="h-0.5 w-4.5 transition-transform group-open:-translate-y-2 group-open:-rotate-45" />
      </summary>
      <div
        style={{ background: "var(--th-card)", borderColor: "var(--th-border)" }}
        className="absolute right-0 top-full mt-2 w-52 rounded-2xl border p-3 shadow-2xl backdrop-blur-xl"
      >
        <nav className="flex flex-col gap-0.5">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              style={{ color: "var(--th-muted)" }}
              className="rounded-lg px-3 py-2.5 text-sm font-medium hover:text-orange"
            >
              {link.label}
            </a>
          ))}
          <div className="my-2 border-t" style={{ borderColor: "var(--th-border)" }} />
          <a
            href={`${APP_URL}/login`}
            style={{ color: "var(--th-muted)" }}
            className="rounded-lg px-3 py-2.5 text-sm font-medium hover:text-orange"
          >
            Entrar
          </a>
          <Link
            href={`${APP_URL}/register`}
            className="mt-1 flex w-full items-center justify-center rounded-lg bg-orange px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-light"
          >
            Criar conta
          </Link>
        </nav>
      </div>
    </details>
  );
}
