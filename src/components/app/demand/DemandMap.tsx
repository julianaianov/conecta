"use client";

import dynamic from "next/dynamic";

const Inner = dynamic(() => import("./DemandMapInner"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse" style={{ background: "var(--th-card-alt)" }} />,
});

export function DemandMap({ latitude, longitude, label }: { latitude: number; longitude: number; label: string }) {
  return (
    <div className="relative h-56 overflow-hidden rounded-xl border sm:h-64" style={{ borderColor: "var(--th-border)" }} role="img" aria-label={label}>
      <Inner latitude={latitude} longitude={longitude} />
    </div>
  );
}
