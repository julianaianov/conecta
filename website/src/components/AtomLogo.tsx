type AtomLogoProps = {
  className?: string;
  size?: number;
};

export function AtomLogo({ className = "", size = 48 }: AtomLogoProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
    >
      <circle cx="24" cy="24" r="5" fill="currentColor" />
      <ellipse
        cx="24"
        cy="24"
        rx="20"
        ry="7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <ellipse
        cx="24"
        cy="24"
        rx="20"
        ry="7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        transform="rotate(60 24 24)"
      />
      <ellipse
        cx="24"
        cy="24"
        rx="20"
        ry="7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        transform="rotate(120 24 24)"
      />
      <circle cx="40" cy="24" r="3" fill="currentColor" />
      <circle cx="16" cy="41" r="3" fill="currentColor" />
      <circle cx="16" cy="7" r="3" fill="currentColor" />
    </svg>
  );
}
