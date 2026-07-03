"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "text-white",
  secondary: "text-white",
  ghost: "",
  outline: "",
  danger: "text-white",
};

const styleFor = (v: Variant): React.CSSProperties => {
  switch (v) {
    case "primary":
      return { background: "linear-gradient(135deg,#f4841a,#f89b45)", boxShadow: "0 6px 18px rgba(244,132,26,0.30)" };
    case "secondary":
      return { background: "linear-gradient(135deg,#0d2d42,#1b4f72)" };
    case "danger":
      return { background: "#e53935" };
    case "outline":
      return { border: "1px solid var(--th-border)", background: "var(--th-card)", color: "var(--th-text)" };
    case "ghost":
      return { color: "var(--th-muted)" };
  }
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3.5 text-[13px] gap-1.5 rounded-lg",
  md: "h-11 px-5 text-sm gap-2 rounded-xl",
  lg: "h-12 px-6 text-[15px] gap-2 rounded-xl",
};

interface BaseProps {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconRight?: IconName;
  block?: boolean;
  loading?: boolean;
  children?: ReactNode;
  className?: string;
}

type ButtonProps = BaseProps & ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };
type LinkProps = BaseProps & { href: string };

function inner(icon: IconName | undefined, iconRight: IconName | undefined, loading: boolean | undefined, size: Size, children: ReactNode) {
  const px = size === "sm" ? 16 : 18;
  return (
    <>
      {loading ? <span className="app-spinner" style={{ width: px, height: px }} /> : icon ? <Icon name={icon} size={px} /> : null}
      {children}
      {iconRight && !loading ? <Icon name={iconRight} size={px} /> : null}
    </>
  );
}

export function Button(props: ButtonProps | LinkProps) {
  const { variant = "primary", size = "md", icon, iconRight, block, loading, children, className = "" } = props;
  const cls = `inline-flex items-center justify-center font-semibold transition-all duration-200 hover:brightness-[1.05] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none ${VARIANTS[variant]} ${SIZES[size]} ${block ? "w-full" : ""} ${className}`;

  if ("href" in props && props.href !== undefined) {
    return (
      <Link href={props.href} className={cls} style={styleFor(variant)}>
        {inner(icon, iconRight, loading, size, children)}
      </Link>
    );
  }
  const { variant: _v, size: _s, icon: _i, iconRight: _ir, block: _b, loading: _l, className: _c, ...rest } = props as ButtonProps;
  void _v; void _s; void _i; void _ir; void _b; void _l; void _c;
  return (
    <button className={cls} style={styleFor(variant)} disabled={loading || rest.disabled} {...rest}>
      {inner(icon, iconRight, loading, size, children)}
    </button>
  );
}
