"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import {
  DEFAULT_CITY, DEFAULT_NEIGHBORHOOD, POST_TYPE_COLORS, POST_TYPE_LABELS,
  can, normalizeRole, ROLE_LABELS, ROLE_RESTRICTIONS, type PostType,
} from "@/lib/app/types";
import { Icon, type IconName } from "@/components/app/Icon";
import { Button } from "@/components/app/Button";
import { Card } from "@/components/app/ui";

const TYPES: { type: PostType; icon: IconName }[] = [
  { type: "problem", icon: "bolt" },
  { type: "project", icon: "leaf" },
  { type: "need", icon: "volunteer" },
  { type: "event", icon: "calendar" },
  { type: "action", icon: "groups" },
  { type: "message", icon: "message" },
];

export default function CreatePostPage() {
  const router = useRouter();
  const search = useSearchParams();
  const { user } = useAuth();
  const [type, setType] = useState<PostType>((search.get("type") as PostType) || "problem");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [neighborhood, setNeighborhood] = useState(DEFAULT_NEIGHBORHOOD);
  const [city, setCity] = useState(DEFAULT_CITY);
  const [tags, setTags] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const canPublish = can(user?.role, "publish");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !canPublish) return;
    setSubmitting(true);
    try {
      const post = await api.createPost(
        {
          type, title: title.trim(), description: description.trim(),
          neighborhood, city,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        },
        user,
      );
      router.push(`/post/${post.id}`);
    } finally { setSubmitting(false); }
  }

  if (user && !canPublish) {
    const role = normalizeRole(user.role);
    return (
      <div className="mx-auto max-w-xl">
        <button onClick={() => router.back()} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--th-muted)" }}>
          <Icon name="arrowLeft" size={18} /> Voltar
        </button>
        <Card>
          <h1 className="text-xl font-bold" style={{ color: "var(--th-text)" }}>Publicação indisponível</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--th-muted)" }}>
            {ROLE_RESTRICTIONS[role] ??
              `Perfis do tipo "${ROLE_LABELS[role]}" não publicam demandas, projetos ou eventos.`}
          </p>
          <p className="mt-2 text-sm" style={{ color: "var(--th-muted)" }}>
            Você continua podendo curtir, comentar, compartilhar e se conectar com as comunidades pelo feed.
          </p>
          <Button className="mt-4" onClick={() => router.push("/feed")}>Voltar ao feed</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <button onClick={() => router.back()} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--th-muted)" }}>
        <Icon name="arrowLeft" size={18} /> Voltar
      </button>

      <Card>
        <h1 className="text-xl font-bold" style={{ color: "var(--th-text)" }}>Nova publicação</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>Conte um problema, lance um projeto ou convoque uma ação.</p>

        <form onSubmit={submit} className="mt-5 space-y-5">
          <div>
            <span className="mb-2 block text-sm font-semibold" style={{ color: "var(--th-text)" }}>Tipo</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {TYPES.map(({ type: t, icon }) => {
                const active = type === t;
                const color = POST_TYPE_COLORS[t];
                return (
                  <button key={t} type="button" onClick={() => setType(t)} className="flex items-center gap-2 rounded-xl border p-3 text-left transition-all" style={{ borderColor: active ? color : "var(--th-border)", background: active ? `${color}14` : "var(--th-card)" }}>
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${color}1f`, color }}><Icon name={icon} size={16} /></span>
                    <span className="text-sm font-semibold" style={{ color: "var(--th-text)" }}>{POST_TYPE_LABELS[t]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold" style={{ color: "var(--th-text)" }}>Título</span>
            <input required maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Buraco na Av. das Américas" className="app-input" />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold" style={{ color: "var(--th-text)" }}>Descrição</span>
            <textarea required maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descreva a situação, o que precisa e como as pessoas podem ajudar." className="app-textarea" style={{ minHeight: "8rem" }} />
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold" style={{ color: "var(--th-text)" }}>Bairro</span>
              <input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} className="app-input" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold" style={{ color: "var(--th-text)" }}>Cidade</span>
              <input value={city} onChange={(e) => setCity(e.target.value)} className="app-input" />
            </label>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold" style={{ color: "var(--th-text)" }}>Tags <span className="font-normal" style={{ color: "var(--th-muted)" }}>(separadas por vírgula)</span></span>
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="infraestrutura, urgente, vias" className="app-input" />
          </label>

          <Button type="submit" block size="lg" loading={submitting} icon="send" disabled={!title.trim() || !description.trim()}>Publicar</Button>
        </form>
      </Card>
    </div>
  );
}
