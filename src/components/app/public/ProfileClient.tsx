"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/app/auth";
import { formatDate, timeAgo } from "@/lib/app/format";
import type { Post, Profile, PublicInstitution } from "@/lib/app/types";
import { InstitutionSeal, PublicInstitutionCard } from "../institution/PublicInstitutionCard";
import { AuthPrompt } from "../AuthPrompt";
import { Avatar } from "../Avatar";
import { ProfileView } from "../ProfileView";
import { Card } from "../ui";

export function ProfileClient({ initialProfile, initialPosts, initialInstitution = null }: { initialProfile: Profile; initialPosts: Post[]; initialInstitution?: PublicInstitution | null }) {
  const { user } = useAuth();
  const [posts] = useState(initialPosts);
  const profileHref = `/perfil/${encodeURIComponent(initialProfile.userId)}`;

  // Usuários autenticados mantêm as ações completas do perfil: atualizações,
  // referências, conexões e frentes. A versão pública continua enxuta para
  // visitantes e indexadores.
  if (user) return <ProfileView userId={initialProfile.userId} />;

  return (
    <div className="mx-auto grid max-w-4xl items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <Card>
        <div className="flex flex-col items-center text-center"><Avatar name={initialProfile.name} src={initialProfile.avatarUrl} id={initialProfile.userId} size={88} ring /><h1 className="mt-3 text-xl font-bold" style={{ color: "var(--th-text)" }}>{initialProfile.name}</h1>{initialInstitution && <div className="mt-1"><InstitutionSeal institution={initialInstitution} /></div>}<p className="text-sm" style={{ color: "#2e7ba8" }}>{initialProfile.role}{initialProfile.profileType ? ` · ${initialProfile.profileType}` : ""}</p></div>
        {initialProfile.bio && <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--th-text)" }}>{initialProfile.bio}</p>}
        <div className="mt-4 space-y-1 text-sm" style={{ color: "var(--th-muted)" }}>{(initialProfile.neighborhood || initialProfile.city) && <p>{[initialProfile.neighborhood, initialProfile.city].filter(Boolean).join(", ")}</p>}{initialProfile.website && <p>{initialProfile.website}</p>}{initialProfile.memberSince && <p>Participante desde {formatDate(initialProfile.memberSince)}</p>}<p>{initialProfile.friendCount ?? 0} colaborações registradas</p></div>
        <div className="mt-5">{user ? <Link href={`/conexoes/nova?para=${encodeURIComponent(initialProfile.userId)}`} className="flex items-center justify-center rounded-xl px-3 py-2 text-sm font-bold text-white" style={{ background: "#f4841a" }}>Solicitar conexão</Link> : <AuthPrompt action="solicitar uma conexão" returnTo={profileHref} />}</div>
      </Card>
      {initialInstitution && <div className="lg:col-start-1"><PublicInstitutionCard institution={initialInstitution} /></div>}
      <section className="space-y-4 lg:col-start-2 lg:row-span-2 lg:row-start-1" aria-label={`Atuação pública de ${initialProfile.name}`}><div className="app-card rounded-2xl p-4"><h2 className="text-lg font-bold" style={{ color: "var(--th-text)" }}>Atuação pública</h2><p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>Registros e iniciativas publicados por {initialProfile.name}.</p></div>{posts.length === 0 ? <Card><p className="text-sm" style={{ color: "var(--th-muted)" }}>Ainda não há registros públicos neste perfil.</p></Card> : posts.map((post) => <Link key={post.id} href={`/post/${encodeURIComponent(post.id)}`} className="app-card block rounded-2xl p-4 hover:shadow-md"><h2 className="text-base font-bold" style={{ color: "var(--th-text)" }}>{post.title}</h2><p className="mt-1 text-sm line-clamp-3" style={{ color: "var(--th-muted)" }}>{post.description}</p><p className="mt-2 text-xs" style={{ color: "var(--th-muted)" }}>{timeAgo(post.createdAt)} · {post.commentsCount} atualizações</p></Link>)}</section>
    </div>
  );
}
