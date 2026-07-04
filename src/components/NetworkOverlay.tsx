export function NetworkOverlay({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      viewBox="0 0 1200 600"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="net-line" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#2E7BA8" stopOpacity="0" />
          <stop offset="50%" stopColor="#F4841A" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#2E7BA8" stopOpacity="0" />
        </linearGradient>
        <filter id="net-glow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {[
        "M120,420 L320,280 L520,340 L720,220 L920,300 L1080,180",
        "M80,300 L280,380 L480,260 L680,320 L880,240 L1120,360",
        "M200,180 L400,320 L600,200 L800,280 L1000,160",
      ].map((d, i) => (
        <path
          key={d}
          d={d}
          fill="none"
          stroke="url(#net-line)"
          strokeWidth="1.5"
          strokeDasharray="6 8"
          filter="url(#net-glow)"
          className="network-line"
          style={{ animationDelay: `${i * 0.8}s` }}
        />
      ))}

      {[
        [320, 280],
        [520, 340],
        [720, 220],
        [480, 260],
        [680, 320],
        [600, 200],
        [800, 280],
      ].map(([cx, cy], i) => (
        <g key={`${cx}-${cy}`}>
          <circle cx={cx} cy={cy} r="8" fill="#F4841A" opacity="0.25" className="network-pulse" style={{ animationDelay: `${i * 0.3}s` }} />
          <circle cx={cx} cy={cy} r="4" fill="#F89B45" filter="url(#net-glow)" />
        </g>
      ))}
    </svg>
  );
}
