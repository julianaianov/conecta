import type { CSSProperties } from "react";
import { PIN_COLORS, type PinCategory } from "@/lib/banner-data";

type MapPinMarkerProps = {
  category: PinCategory;
  icon: string;
  active?: boolean;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
  label?: string;
};

export function MapPinMarker({
  category,
  icon,
  active = false,
  onClick,
  className = "",
  style,
  label,
}: MapPinMarkerProps) {
  const color = PIN_COLORS[category];
  const Tag = onClick ? "button" : "span";

  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`group absolute z-10 -translate-x-1/2 ${className}`}
      style={style}
      aria-label={label}
      aria-pressed={onClick ? active : undefined}
    >
      <svg
        width="36"
        height="44"
        viewBox="0 0 36 44"
        className={`drop-shadow-lg transition-transform duration-300 ${active ? "scale-125" : "group-hover:scale-110"}`}
        aria-hidden="true"
      >
        <path
          d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 26 18 26s18-12.5 18-26C36 8.06 27.94 0 18 0z"
          fill={color}
          stroke="white"
          strokeWidth="2"
        />
        <text
          x="18"
          y="21"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="white"
          fontSize={icon.length > 1 ? "11" : "16"}
          fontWeight="bold"
        >
          {icon}
        </text>
      </svg>
    </Tag>
  );
}

type ActivityIconProps = {
  category: PinCategory;
  icon: string;
  size?: "sm" | "md";
};

export function ActivityPinIcon({ category, icon, size = "md" }: ActivityIconProps) {
  const color = PIN_COLORS[category];
  const dim = size === "sm" ? "h-9 w-9 text-xs" : "h-11 w-11 text-sm";

  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${dim}`}
      style={{ backgroundColor: color }}
    >
      {icon}
    </span>
  );
}
