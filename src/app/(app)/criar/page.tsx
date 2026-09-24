"use client";

import { Suspense, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import type { Coordinates } from "@/lib/app/location";
import {
  POST_TYPE_COLORS, POST_TYPE_LABELS,
  allowedPostTypes, normalizeRole, ROLE_LABELS, ROLE_RESTRICTIONS, type PostType,
} from "@/lib/app/types";
import { Icon, type IconName } from "@/components/app/Icon";
import { AuthPrompt } from "@/components/app/AuthPrompt";
import { Button } from "@/components/app/Button";
import { Card } from "@/components/app/ui";
import { InstitutionBanner } from "@/components/app/institution/InstitutionBanner";
import { InstitutionGateNotice } from "@/components/app/institution/InstitutionStatus";
import { useInstitutionAccess } from "@/components/app/institution/useInstitutionAccess";
import { gateStatusFrom, isInstitutionNotValidated } from "@/lib/app/institution";
import type { InstitutionValidationStatus, UploadedFile } from "@/lib/app/types";
import { DEMAND_NEW_PATH, MY_DEMANDS_PATH } from "@/lib/app/demand";
import { FileUpload } from "@/components/app/FileUpload";

const LocationPicker = dynamic(
  () => import("@/components/app/LocationPicker").then((mod) => mod.LocationPicker),
  { ssr: false, loading: () => <div className="h-56 animate-pulse rounded-2xl" style={{ background: "var(--th-card-alt)" }} /> },
);

const TYPES: { type: PostType; icon: IconName }[] = [
  { type: "problem", icon: "bolt" },
  { type: "project", icon: "leaf" },
  { type: "need", icon: "volunteer" },
  { type: "event", icon: "calendar" },
  { type: "action", icon: "groups" },
  { type: "message", icon: "message" },
];

function CreatePostContent() {
  const router = useRouter();
  const search = useSearchParams();
  const { user } = useAuth();
  const postTypes = allowedPostTypes(user?.role, user?.profileType);
  const types = TYPES.filter((t) => postTypes.includes(t.type));
  const requested = search.get("type") as PostType | null;
  const [picked, setType] = useState<PostType | null>(requested);
  // O tipo precisa estar entre os permitidos ao perfil (ver ROLE_POST_TYPES).
  const type = picked && postTypes.includes(picked) ? picked : postTypes[0];
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [tags, setTags] = useState("");
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  // Foto do local (upload `post_photo`): obrigatória, como o ponto, para o sinal entrar no mapa.
  const [photo, setPhoto] = useState<UploadedFile | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  /** 403 `institution_not_validated` devolvido pelo post-service. */
  const [gate, setGate] = useState<{ status: InstitutionValidationStatus | null } | null>(null);
  const { access, loading: accessLoading } = useInstitutionAccess();
  const canPublish = postTypes.length > 0;
  const isGovernment = normalizeRole(user?.role, user?.profileType) === "government";
  // O Poder Público só publica com o cadastro validado (Fluxo 3, etapa 02).
  const blockedByInstitution = Boolean(user && isGovernment && !accessLoading && !access.canActInstitutionally);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !type) return;
    if (!photo) {
      setPhotoError("Envie uma foto do local: sem ela o sinal não entra no mapa.");
      return;
    }
    if (!coordinates) {
      setLocationError("Escolha no mapa onde esta demanda acontece.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    setGate(null);
    try {
      const post = await api.createPost(
        {
          type, title: title.trim(), description: description.trim(),
          neighborhood: neighborhood.trim() || undefined,
          city: city.trim() || undefined,
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          images: [photo.ref],
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        },
        user,
      );
      router.push(`/post/${post.id}`);
    } catch (err) {
      if (isInstitutionNotValidated(err)) setGate({ status: gateStatusFrom(err) ?? access.status });
      else setSubmitError(err instanceof Error && err.message !== "network" && err.message !== "timeout"
        ? err.message
        : "Não foi possível publicar agora. Verifique a conexão e tente de novo.");
    } finally { setSubmitting(false); }
  }

  if (user && !canPublish) {
    const role = normalizeRole(user.role, user.profileType);
    return (
      <div className="mx-auto max-w-xl">
        <button onClick={() => router.back()} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--th-muted)" }}>
          <Icon name="arrowLeft" size={18} /> Voltar
        </button>
        <Card>
          <h1 className="text-xl font-bold" style={{ color: "var(--th-text)" }}>Registro indisponível</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--th-muted)" }}>
            {ROLE_RESTRICTIONS[role] ??
              `Perfis do tipo "${ROLE_LABELS[role]}" não publicam demandas, projetos ou eventos.`}
          </p>
          <p className="mt-2 text-sm" style={{ color: "var(--th-muted)" }}>
          Você continua podendo acompanhar demandas e projetos, divulgar e solicitar conexões.
          </p>
          <Button className="mt-4" onClick={() => router.push("/feed")}>Voltar ao pulso</Button>
        </Card>
      </div>
    );
  }

  if (user && isGovernment && accessLoading) {
    return <div className="flex justify-center py-24"><span className="app-spinner" aria-label="Carregando" /></div>;
  }

  if (user && blockedByInstitution) {
    return (
      <div className="mx-auto max-w-xl">
        <button onClick={() => router.back()} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--th-muted)" }}>
          <Icon name="arrowLeft" size={18} /> Voltar
        </button>
        <Card>
          <h1 className="text-xl font-bold" style={{ color: "var(--th-text)" }}>Publicação institucional</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--th-muted)" }}>
            Respostas institucionais, programas e serviços são publicados em nome do órgão, por isso dependem do cadastro institucional validado.
          </p>
          <div className="mt-4"><InstitutionGateNotice action="publicar" status={access.status} /></div>
        </Card>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-xl">
        <Card>
          <h1 className="text-xl font-bold" style={{ color: "var(--th-text)" }}>Registrar um sinal</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--th-muted)" }}>A publicação é uma ação autenticada para manter a autoria e a segurança dos registros.</p>
          <div className="mt-4"><AuthPrompt action="registrar um sinal" returnTo="/criar" /></div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <button onClick={() => router.back()} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--th-muted)" }}>
        <Icon name="arrowLeft" size={18} /> Voltar
      </button>

      <InstitutionBanner dismissible={false} className="mb-4" />
      {normalizeRole(user?.role, user?.profileType) === "agent" && (
        <Card className="mb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "rgba(244,132,26,0.12)", color: "#f4841a" }}>
              <Icon name="inventory" size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold" style={{ color: "var(--th-text)" }}>Estruturar uma demanda</p>
              <p className="mt-0.5 text-sm" style={{ color: "var(--th-muted)" }}>
                Categoria, fotografia, localização com CEP, orçamento detalhado, cronograma, metas e documentos. Passa pela análise da equipe antes da publicação.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button href={DEMAND_NEW_PATH} size="sm" icon="plus">Nova demanda</Button>
              <Button href={MY_DEMANDS_PATH} size="sm" variant="outline">Minhas demandas</Button>
            </div>
          </div>
        </Card>
      )}
      <Card>
        <h1 className="text-xl font-bold" style={{ color: "var(--th-text)" }}>Novo sinal</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>
          {normalizeRole(user?.role, user?.profileType) === "government"
            ? "Publique uma resposta institucional ou informe programas, serviços e oportunidades."
            : "Conte um problema, lance um projeto ou convoque uma ação."}
        </p>

        <form onSubmit={submit} className="mt-5 space-y-5">
          <div>
            <span className="mb-2 block text-sm font-semibold" style={{ color: "var(--th-text)" }}>Tipo</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {types.map(({ type: t, icon }) => {
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

          <FileUpload
            id="post-photo"
            label="Foto do local"
            purpose="post_photo"
            value={photo}
            onChange={(file) => { setPhoto(file); setPhotoError(null); }}
            required
            error={photoError ?? undefined}
            hint="Fotografe a situação, o local ou o projeto. Foto e localização são obrigatórias para o sinal aparecer no mapa."
          />

          <div>
            <span className="mb-1.5 block text-sm font-semibold" style={{ color: "var(--th-text)" }}>Localização do sinal</span>
            <p className="mb-2 text-xs" style={{ color: "var(--th-muted)" }}>
              Marque no mapa o ponto aproximado da demanda. Sem a localização (e a foto) o sinal não aparece no mapa.
            </p>
            <LocationPicker
              value={coordinates}
              onChange={(value) => {
                setCoordinates(value);
                setLocationError(null);
              }}
            />
            {locationError && <p className="mt-2 text-sm font-semibold" style={{ color: "#d64545" }}>{locationError}</p>}
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold" style={{ color: "var(--th-text)" }}>Tags <span className="font-normal" style={{ color: "var(--th-muted)" }}>(separadas por vírgula)</span></span>
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="infraestrutura, urgente, vias" className="app-input" />
          </label>

          {gate && <InstitutionGateNotice action="publicar" status={gate.status} />}
          {submitError && <p role="alert" className="rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(229,57,53,0.10)", color: "#e53935" }}>{submitError}</p>}
          <Button type="submit" block size="lg" loading={submitting} icon="send" disabled={!title.trim() || !description.trim() || !coordinates || !photo}>Registrar sinal</Button>
        </form>
      </Card>
    </div>
  );
}

export default function CreatePostPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-24"><span className="app-spinner" /></div>}>
      <CreatePostContent />
    </Suspense>
  );
}
