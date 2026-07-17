"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import { formatDate, timeAgo } from "@/lib/app/format";
import {
  ROLE_LABELS, normalizeRole, PROFILE_LABELS, type Post, type Profile, type Scrap, type Testimonial, type Community, type Profile as P, type ProfileType,
} from "@/lib/app/types";
import { Avatar } from "./Avatar";
import { Icon, type IconName } from "./Icon";
import { Button } from "./Button";

export function OrkutProfile({ userId }: { userId: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const isOwn = user?.id === userId;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [scraps, setScraps] = useState<Scrap[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [friends, setFriends] = useState<P[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [scrapDraft, setScrapDraft] = useState("");
  const [testimonialDraft, setTestimonialDraft] = useState("");
  const [showTestimonialBox, setShowTestimonialBox] = useState(false);
  const [connectionSent, setConnectionSent] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      api.getProfile(userId), api.postsByAuthor(userId), api.scrapsFor(userId),
      api.testimonialsFor(userId), api.friendsOf(userId), api.communities(),
    ]).then(([pr, po, sc, te, fr, co]) => {
      if (!alive) return;
      setProfile(pr); setPosts(po); setScraps(sc); setTestimonials(te); setFriends(fr); setCommunities(co.slice(0, 4));
      setLoading(false);
    }).catch(() => {
      if (!alive) return;
      setLoading(false);
    });
    return () => { alive = false; };
  }, [userId]);

  async function sendScrap() {
    if (!scrapDraft.trim() || !user) return;
    const s = await api.addScrap(userId, user, scrapDraft.trim());
    setScraps((list) => [s, ...list]);
    setScrapDraft("");
  }
  async function sendTestimonial() {
    if (!testimonialDraft.trim() || !user) return;
    const t = await api.addTestimonial(userId, user, testimonialDraft.trim());
    setTestimonials((list) => [t, ...list]);
    setTestimonialDraft("");
    setShowTestimonialBox(false);
  }

  if (loading) return <div className="flex justify-center py-24"><span className="app-spinner" style={{ width: 30, height: 30 }} /></div>;
  if (!profile) return <p className="py-20 text-center" style={{ color: "var(--th-muted)" }}>Perfil não encontrado.</p>;

  const role = normalizeRole(profile.role);

  const infoCard = (
    <Panel accent="#1b4f72">
      <div className="relative">
        <div className="h-24 w-full overflow-hidden rounded-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {profile.coverUrl && <img src={profile.coverUrl} alt="" className="h-full w-full object-cover" />}
          <div className="absolute inset-0" style={{ background: "linear-gradient(135deg,rgba(13,45,66,0.45),transparent)" }} />
        </div>
        <div className="-mt-9 px-1">
          <Avatar name={profile.name} src={profile.avatarUrl} id={profile.userId} size={72} ring />
        </div>
      </div>
      <h1 className="mt-2 text-lg font-bold leading-tight" style={{ color: "var(--th-text)" }}>{profile.name}</h1>
      <p className="text-xs font-semibold" style={{ color: "#2e7ba8" }}>
        {[ROLE_LABELS[role], profile.profileType && PROFILE_LABELS[profile.profileType as ProfileType]]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {profile.status && <p className="mt-1 text-sm italic" style={{ color: "var(--th-muted)" }}>“{profile.status}”</p>}

      <div className="mt-3 space-y-1.5 text-sm" style={{ color: "var(--th-muted)" }}>
        {profile.bio && <p>{profile.bio}</p>}
        {(profile.neighborhood || profile.city) && <InfoLine icon="location">{[profile.neighborhood, profile.city].filter(Boolean).join(", ")}</InfoLine>}
        {profile.website && <InfoLine icon="globe">{profile.website}</InfoLine>}
        {profile.memberSince && <InfoLine icon="calendar">Membro desde {formatDate(profile.memberSince)}</InfoLine>}
        <InfoLine icon="users"><span className="font-numeric font-semibold" style={{ color: "var(--th-text)" }}>{profile.friendCount ?? friends.length}</span> conexões</InfoLine>
      </div>

      {!isOwn && (
        <div className="mt-4 space-y-2">
          <Button block size="sm" icon={connectionSent ? "check" : "users"} onClick={() => setConnectionSent(true)} variant={connectionSent ? "outline" : "primary"}>
            {connectionSent ? "Solicitação enviada" : "Enviar conexão"}
          </Button>
          <Button block size="sm" variant="outline" icon="star" onClick={() => setShowTestimonialBox((v) => !v)}>Escrever depoimento</Button>
        </div>
      )}
    </Panel>
  );

  const communitiesPanel = (
    <Panel accent="#2e7ba8" icon="groups" title={`Comunidades (${communities.length})`}>
      <div className="grid grid-cols-4 gap-2">
        {communities.map((c) => (
          <Link key={c.id} href="/comunidades" className="text-center">
            <Avatar name={c.name} src={c.imageUrl} id={c.id} size={44} className="mx-auto" />
            <p className="mt-1 truncate text-[10px]" style={{ color: "var(--th-muted)" }}>{c.name.split(" ")[0]}</p>
          </Link>
        ))}
      </div>
    </Panel>
  );

  const friendsPanel = (
    <Panel accent="#f4841a" icon="users" title={`Conexões (${friends.length})`}>
      <div className="grid grid-cols-4 gap-2">
        {friends.map((f) => (
          <Link key={f.userId} href={`/perfil/${f.userId}`} className="text-center">
            <Avatar name={f.name} src={f.avatarUrl} id={f.userId} size={44} className="mx-auto" />
            <p className="mt-1 truncate text-[10px]" style={{ color: "var(--th-muted)" }}>{f.name.split(" ")[0]}</p>
          </Link>
        ))}
      </div>
    </Panel>
  );

  const postsPanel = (
    <Panel accent="#1b4f72" icon="home" title={`Publicações (${posts.length})`}>
      {posts.length === 0 ? (
        <p className="py-3 text-center text-sm" style={{ color: "var(--th-muted)" }}>Nenhuma publicação ainda.</p>
      ) : (
        <div className="space-y-2.5">
          {posts.map((p) => (
            <Link key={p.id} href={`/post/${p.id}`} className="flex gap-3 rounded-xl p-2 transition-colors hover:bg-[var(--th-card-alt)]">
              {p.images?.[0] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.images[0]} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold" style={{ color: "var(--th-text)" }}>{p.title}</p>
                <p className="text-xs clamp-2" style={{ color: "var(--th-muted)" }}>{p.description}</p>
                <p className="mt-0.5 text-[11px] font-numeric" style={{ color: "var(--th-muted)" }}>{timeAgo(p.createdAt)} · {p.reactionsCount} apoios</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Panel>
  );

  const scrapsPanel = (
    <Panel accent="#2e9e5b" icon="scrap" title={`Recados (${scraps.length})`}>
      <div className="mb-3 flex items-start gap-2.5">
        <Avatar name={user?.name ?? ""} src={user?.avatarUrl} id={user?.id} size={34} />
        <div className="flex-1">
          <textarea value={scrapDraft} onChange={(e) => setScrapDraft(e.target.value)} placeholder={isOwn ? "Deixe um recado no seu mural..." : `Deixe um recado para ${profile.name.split(" ")[0]}...`} className="app-textarea" style={{ minHeight: "3rem" }} />
          <div className="mt-2 flex justify-end"><Button size="sm" icon="send" onClick={sendScrap} disabled={!scrapDraft.trim()}>Enviar recado</Button></div>
        </div>
      </div>
      <div className="space-y-3">
        {scraps.length === 0 && <p className="py-2 text-center text-sm" style={{ color: "var(--th-muted)" }}>Nenhum recado ainda.</p>}
        {scraps.map((s) => (
          <div key={s.id} className="flex gap-2.5">
            <Link href={`/perfil/${s.authorId}`}><Avatar name={s.authorName} src={s.authorAvatar} id={s.authorId} size={34} /></Link>
            <div className="flex-1 rounded-2xl rounded-tl-sm px-3.5 py-2.5" style={{ background: "var(--th-card-alt)" }}>
              <div className="flex items-baseline gap-2">
                <Link href={`/perfil/${s.authorId}`} className="text-sm font-bold hover:underline" style={{ color: "var(--th-text)" }}>{s.authorName}</Link>
                <span className="text-xs font-numeric" style={{ color: "var(--th-muted)" }}>{timeAgo(s.createdAt)}</span>
              </div>
              <p className="mt-0.5 text-sm" style={{ color: "var(--th-text)" }}>{s.content}</p>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );

  const testimonialsPanel = (
    <Panel accent="#f4841a" icon="star" title={`Depoimentos (${testimonials.length})`}>
      {!isOwn && showTestimonialBox && (
        <div className="mb-3 rounded-xl border p-3" style={{ borderColor: "var(--th-border)" }}>
          <textarea value={testimonialDraft} onChange={(e) => setTestimonialDraft(e.target.value)} placeholder={`Escreva um depoimento sobre ${profile.name.split(" ")[0]}...`} className="app-textarea" style={{ minHeight: "3.5rem" }} />
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowTestimonialBox(false)}>Cancelar</Button>
            <Button size="sm" icon="star" onClick={sendTestimonial} disabled={!testimonialDraft.trim()}>Publicar</Button>
          </div>
        </div>
      )}
      <div className="space-y-3">
        {testimonials.length === 0 && <p className="py-2 text-center text-sm" style={{ color: "var(--th-muted)" }}>Nenhum depoimento ainda.</p>}
        {testimonials.map((t) => (
          <div key={t.id} className="rounded-xl border-l-2 px-3 py-2" style={{ borderColor: "#f4841a", background: "var(--th-card-alt)" }}>
            <p className="text-sm italic" style={{ color: "var(--th-text)" }}>“{t.content}”</p>
            <div className="mt-1.5 flex items-center gap-2">
              <Avatar name={t.authorName} src={t.authorAvatar} id={t.authorId} size={22} />
              <Link href={`/perfil/${t.authorId}`} className="text-xs font-semibold hover:underline" style={{ color: "var(--th-muted)" }}>{t.authorName}</Link>
              <span className="text-xs font-numeric" style={{ color: "var(--th-muted)" }}>· {formatDate(t.createdAt)}</span>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );

  return (
    <div>
      <button onClick={() => router.back()} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold md:hidden" style={{ color: "var(--th-muted)" }}>
        <Icon name="arrowLeft" size={18} /> Voltar
      </button>
      <div className="mx-auto grid max-w-2xl grid-cols-1 gap-4 lg:mx-0 lg:max-w-none lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">{infoCard}{communitiesPanel}{friendsPanel}</div>
        <div className="min-w-0 space-y-4">{postsPanel}{scrapsPanel}{testimonialsPanel}</div>
      </div>
    </div>
  );
}

function Panel({ accent, icon, title, children }: { accent: string; icon?: IconName; title?: string; children: React.ReactNode }) {
  return (
    <section className="app-card overflow-hidden rounded-2xl" style={{ boxShadow: "0 4px 16px rgba(13,45,66,0.05)" }}>
      {title && (
        <div className="flex items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: "var(--th-border)", borderLeft: `3px solid ${accent}` }}>
          {icon && <Icon name={icon} size={15} style={{ color: accent }} />}
          <h3 className="text-sm font-bold" style={{ color: "var(--th-text)" }}>{title}</h3>
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

function InfoLine({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2">
      <Icon name={icon} size={14} style={{ color: "#2e7ba8" }} />
      <span className="truncate">{children}</span>
    </p>
  );
}
