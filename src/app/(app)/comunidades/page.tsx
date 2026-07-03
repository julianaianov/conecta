"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/app/api";
import type { Community } from "@/lib/app/types";
import { Icon } from "@/components/app/Icon";

export default function CommunitiesPage() {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [joined, setJoined] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.communities().then((c) => { setCommunities(c); setLoading(false); }); }, []);

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold" style={{ color: "var(--th-text)" }}>Comunidades</h1>
        <p className="text-sm" style={{ color: "var(--th-muted)" }}>Organize grupos por bairro, causa ou interesse.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><span className="app-spinner" style={{ width: 28, height: 28 }} /></div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {communities.map((c) => {
            const isJoined = joined[c.id];
            return (
              <div key={c.id} className="app-card overflow-hidden rounded-2xl" style={{ boxShadow: "0 4px 16px rgba(13,45,66,0.05)" }}>
                <div className="relative h-32">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.imageUrl ?? ""} alt={c.name} className="h-full w-full object-cover" />
                  <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(13,45,66,0.65), transparent 60%)" }} />
                  <span className="absolute bottom-2 left-3 rounded-full px-2.5 py-1 text-[11px] font-bold text-white" style={{ background: "#f4841a" }}>{c.category}</span>
                </div>
                <div className="p-4">
                  <h2 className="text-base font-bold" style={{ color: "var(--th-text)" }}>{c.name}</h2>
                  <p className="mt-1 text-sm clamp-2" style={{ color: "var(--th-muted)" }}>{c.description}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--th-muted)" }}>
                      <Icon name="users" size={14} /> <span className="font-numeric">{c.memberCount.toLocaleString("pt-BR")}</span> membros
                    </span>
                    <button
                      onClick={() => setJoined((j) => ({ ...j, [c.id]: !j[c.id] }))}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-all"
                      style={isJoined
                        ? { border: "1px solid var(--th-border)", color: "var(--th-text)" }
                        : { background: "linear-gradient(135deg,#f4841a,#f89b45)", color: "#fff" }}
                    >
                      {isJoined ? <><Icon name="check" size={15} /> Participando</> : "Participar"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
