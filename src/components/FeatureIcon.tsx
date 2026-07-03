type FeatureIconProps = {
  name: string;
  accent?: boolean;
  className?: string;
};

export function FeatureIcon({ name, accent = false, className }: FeatureIconProps) {
  const base = className ?? `h-6 w-6 ${accent ? "text-orange" : "text-white"}`;

  switch (name) {
    case "feed":
      return (
        <svg className={base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      );
    case "map":
      return (
        <svg className={base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M12 8v8M8 12h8" stroke={accent ? "#F7941D" : "currentColor"} />
          <circle cx="12" cy="12" r="2" fill={accent ? "#F7941D" : "currentColor"} />
        </svg>
      );
    case "support":
      return (
        <svg className={base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4 12c0-1.5 1-3 3-3 1 0 2 .5 2.5 1.5M20 12c0-1.5-1-3-3-3-1 0-2 .5-2.5 1.5M8 14l-1 3M16 14l1 3M9 11l3 3 3-3" />
        </svg>
      );
    case "community":
      return (
        <svg className={base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case "shield":
      return (
        <svg className={base} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      );
    default:
      return null;
  }
}
