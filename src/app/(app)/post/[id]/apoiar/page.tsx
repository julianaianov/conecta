"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import { formatCurrency } from "@/lib/app/format";
import {
  PAYMENT_METHODS, SUPPORT_TYPES, SUPPORT_TYPE_META, allowedSupportTypes,
  type PaymentMethod, type Post, type SupportType,
} from "@/lib/app/types";
import { Avatar } from "@/components/app/Avatar";
import { Icon, type IconName } from "@/components/app/Icon";
import { Button } from "@/components/app/Button";
import { InDevelopment } from "@/components/app/InDevelopment";
import { Card } from "@/components/app/ui";
import { AuthPrompt } from "@/components/app/AuthPrompt";
import { InstitutionGateNotice } from "@/components/app/institution/InstitutionStatus";
import { gateStatusFrom, isInstitutionNotValidated } from "@/lib/app/institution";
import type { InstitutionValidationStatus } from "@/lib/app/types";

/** Campos específicos por tipo de apoio (espelha support_flow_page.dart) */
const FIELDS: Partial<Record<SupportType, { key: string; label: string; placeholder: string }[]>> = {
  materials: [
    { key: "Materiais", label: "Materiais", placeholder: "Ex.: tinta, telas, ferramentas" },
    { key: "Quantidade", label: "Quantidade / detalhes", placeholder: "Ex.: 5 galões de 18L" },
    { key: "Entrega", label: "Quando pode entregar", placeholder: "Ex.: a partir de segunda" },
  ],
  labor: [
    { key: "Habilidade", label: "Habilidade", placeholder: "Ex.: pedreiro, eletricista" },
    { key: "Horas", label: "Horas disponíveis", placeholder: "Ex.: 8h" },
    { key: "Dias", label: "Dias disponíveis", placeholder: "Ex.: fins de semana" },
  ],
  volunteering: [
    { key: "Ajuda", label: "Como pode ajudar", placeholder: "Ex.: organização, limpeza" },
    { key: "Horas/semana", label: "Horas por semana", placeholder: "Ex.: 4h" },
    { key: "Disponibilidade", label: "Disponibilidade", placeholder: "Ex.: sábados de manhã" },
  ],
  equipment: [
    { key: "Equipamento", label: "Equipamento", placeholder: "Ex.: betoneira, projetor" },
    { key: "Modalidade", label: "Emprestar ou doar", placeholder: "Ex.: empréstimo" },
    { key: "Período", label: "Período disponível", placeholder: "Ex.: 2 semanas" },
  ],
  space: [
    { key: "Espaço", label: "Tipo de espaço", placeholder: "Ex.: salão, galpão" },
    { key: "Capacidade", label: "Capacidade", placeholder: "Ex.: 50 pessoas" },
    { key: "Datas", label: "Datas disponíveis", placeholder: "Ex.: dia 15 e 16" },
  ],
  food: [
    { key: "Alimentos", label: "Alimentos", placeholder: "Ex.: cestas básicas, água" },
    { key: "Porções", label: "Porções / quantidade", placeholder: "Ex.: 40 cestas" },
    { key: "Entrega", label: "Data de entrega", placeholder: "Ex.: sexta-feira" },
  ],
  transport: [
    { key: "Veículo", label: "Veículo / frete", placeholder: "Ex.: caminhão, van" },
    { key: "Capacidade", label: "Capacidade de carga", placeholder: "Ex.: 1 tonelada" },
    { key: "Disponibilidade", label: "Disponibilidade", placeholder: "Ex.: manhãs" },
  ],
  knowledge: [
    { key: "Área", label: "Área de expertise", placeholder: "Ex.: jurídico, marketing" },
    { key: "Formato", label: "Formato", placeholder: "Ex.: mentoria, palestra" },
    { key: "Horários", label: "Horários disponíveis", placeholder: "Ex.: noites" },
  ],
  sharing: [
    { key: "Canais", label: "Canais de divulgação", placeholder: "Ex.: Instagram, canais locais" },
    { key: "Alcance", label: "Alcance estimado", placeholder: "Ex.: 5 mil pessoas" },
  ],
};

export default function SupportFlowPage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();

  const [post, setPost] = useState<Post | null>(null);
  const [type, setType] = useState<SupportType | null>((search.get("type") as SupportType) || null);
  const [financialStep, setFinancialStep] = useState<0 | 1>(0);
  const [amount, setAmount] = useState(50);
  const [method, setMethod] = useState<PaymentMethod>("pix");
  const [message, setMessage] = useState("");
  const [details, setDetails] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  /** 403 `institution_not_validated` (Poder Público sem cadastro validado). */
  const [gate, setGate] = useState<{ status: InstitutionValidationStatus | null } | null>(null);

  const allowed = allowedSupportTypes(user?.role, user?.profileType);
  // T16: o apoio financeiro não é processado na plataforma (decisão 5). No
  // feed ele sai da escolha; na demanda, o valor é declarado e confirmado pelo
  // Agente (página da demanda → "Registrar apoio").
  const options = SUPPORT_TYPES.filter((s) => allowed.includes(s.type) && s.type !== "financial");

  // Um tipo pedido pela URL que o perfil não pode oferecer volta para a escolha.
  useEffect(() => {
    if (type && user && (!allowed.includes(type) || type === "financial")) setType(null);
  }, [type, user, allowed]);

  useEffect(() => { api.getPost(id).then(setPost); }, [id]);

  if (!user) {
    const query = search.toString();
    return (
      <div className="mx-auto max-w-lg py-10">
        <Card>
          <h1 className="text-xl font-bold" style={{ color: "var(--th-text)" }}>Registrar apoio</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--th-muted)" }}>O apoio é uma ação autenticada e fica associado à sua conta.</p>
          <div className="mt-4"><AuthPrompt action="registrar apoio" returnTo={`/post/${encodeURIComponent(id)}/apoiar${query ? `?${query}` : ""}`} /></div>
        </Card>
      </div>
    );
  }

  const isFinancial = type === "financial";

  const progress = type ? (done ? 1 : isFinancial ? (financialStep + 1) / 2 : 1) : 0;

  async function confirm() {
    if (!type || !user) return;
    setSubmitting(true);
    setSubmitError(null);
    setGate(null);
    try {
      await api.addSupport(id, user, {
        type,
        message: message.trim() || undefined,
        amount: isFinancial ? amount : undefined,
        paymentMethod: isFinancial ? method : undefined,
        details: isFinancial ? {} : details,
        status: "confirmed",
      });
      setDone(true);
    } catch (err) {
      if (isInstitutionNotValidated(err)) setGate({ status: gateStatusFrom(err) });
      else setSubmitError(err instanceof Error && err.message !== "network" && err.message !== "timeout"
        ? err.message
        : "Não foi possível registrar o apoio agora. Tente de novo.");
    } finally { setSubmitting(false); }
  }

  const meta = type ? SUPPORT_TYPE_META[type] : null;

  // ── Sucesso ──────────────────────────────────────────────
  if (done && meta) {
    return (
      <div className="mx-auto max-w-lg py-6">
        <Card className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full" style={{ background: "rgba(46,158,91,0.14)", color: "#2e9e5b" }}>
            <Icon name="check" size={34} strokeWidth={2.5} />
          </div>
          <h1 className="mt-4 text-2xl font-bold" style={{ color: "var(--th-text)" }}>Apoio confirmado!</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>Obrigado por transformar o bairro. Sua contribuição faz a diferença.</p>

          <div className="mt-5 rounded-xl border p-4 text-left" style={{ borderColor: "var(--th-border)", background: "var(--th-card-alt)" }}>
            <div className="flex items-center gap-2">
              <Icon name={meta.icon as IconName} size={18} style={{ color: "#f4841a" }} />
              <span className="font-bold" style={{ color: "var(--th-text)" }}>{meta.label}</span>
            </div>
            {isFinancial && <p className="mt-1 text-sm font-numeric" style={{ color: "var(--th-muted)" }}>{formatCurrency(amount)} · {PAYMENT_METHODS.find((item) => item.method === method)?.label}</p>}
            {post && <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>em <b>{post.title}</b></p>}
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Button href="/meus-apoios" block icon="volunteer">Ver meus apoios</Button>
            <Button href={`/post/${id}`} variant="outline" block>Voltar ao sinal</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg py-2">
      <button onClick={() => (type && search.get("type") == null ? setType(null) : router.back())} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--th-muted)" }}>
        <Icon name="arrowLeft" size={18} /> Voltar
      </button>

      {post && (
        <div className="mb-4 flex items-center gap-3">
          <Avatar name={post.authorName} src={post.authorAvatar} id={post.authorId} size={38} />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold" style={{ color: "var(--th-text)" }}>{post.title}</p>
            <p className="text-xs" style={{ color: "var(--th-muted)" }}>Como você quer apoiar?</p>
          </div>
        </div>
      )}

      {/* Post-vitrine de demanda (T16): o apoio é registrado na demanda, com
          modalidade, valor declarado e confirmação do Agente. */}
      {post?.demandId && (
        <Card className="mb-4">
          <h2 className="text-base font-bold" style={{ color: "var(--th-text)" }}>Esta publicação é a vitrine de uma demanda</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>
            O apoio a uma demanda é registrado na página dela, com uma das seis modalidades (patrocinar, doar recursos,
            financiar eventos, adotar espaços públicos, apoiar ações ambientais ou contratar serviços locais) e
            confirmação do Agente de Transformação.
          </p>
          <div className="mt-4"><Button href={`/demandas/${encodeURIComponent(post.demandId)}`} icon="volunteer" block>Registrar apoio na demanda</Button></div>
        </Card>
      )}

      {/* ── Escolha do tipo ─────────────────────────────── */}
      {!post?.demandId && !type && (
        <div className="space-y-2">
          {options.map((s) => (
            <button key={s.type} onClick={() => { setType(s.type); setFinancialStep(0); }} className="app-card flex w-full items-center gap-3 rounded-xl p-3.5 text-left transition-all hover:border-[#f4841a]">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: "rgba(244,132,26,0.12)", color: "#f4841a" }}>
                <Icon name={s.icon as IconName} size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold" style={{ color: "var(--th-text)" }}>{s.label}</p>
                <p className="truncate text-xs" style={{ color: "var(--th-muted)" }}>{s.subtitle}</p>
              </div>
              <Icon name="chevronRight" size={18} style={{ color: "var(--th-muted)" }} />
            </button>
          ))}
        </div>
      )}

      {!post?.demandId && type && (
        <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--th-card-alt)" }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${progress * 100}%`, background: "linear-gradient(90deg,#f4841a,#f89b45)" }} />
        </div>
      )}

      {/* Apoio financeiro registra a intenção e a forma escolhida; não realiza cobrança automática. */}
      {!post?.demandId && isFinancial && (
        <Card>
          {financialStep === 0 ? (
            <div className="space-y-4">
              <h2 className="text-lg font-bold" style={{ color: "var(--th-text)" }}>Qual valor você quer registrar?</h2>
              {/* Slide 25: funcionalidade não disponível é identificada como tal. */}
              <InDevelopment title="Pagamento em desenvolvimento">
                A plataforma ainda não processa pagamento. O valor aqui é <strong>declarado</strong> e combinado
                diretamente com quem publicou.
              </InDevelopment>
              <div className="flex items-center gap-2 rounded-xl border px-4 py-3" style={{ borderColor: "var(--th-border)" }}>
                <span className="text-xl font-bold" style={{ color: "var(--th-muted)" }}>R$</span>
                <input type="number" min={1} value={amount} onChange={(event) => setAmount(Math.max(0, Number(event.target.value)))} className="w-full bg-transparent text-2xl font-bold outline-none font-numeric" style={{ color: "var(--th-text)" }} />
              </div>
              <div className="flex flex-wrap gap-2">
                {[20, 50, 100, 200].map((value) => <button key={value} type="button" onClick={() => setAmount(value)} className="app-chip" data-active={amount === value}>{formatCurrency(value)}</button>)}
              </div>
              <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Mensagem (opcional)" className="app-textarea" />
              <Button block size="lg" disabled={amount <= 0} onClick={() => setFinancialStep(1)} iconRight="chevronRight">Continuar</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <h2 className="text-lg font-bold" style={{ color: "var(--th-text)" }}>Como esse apoio será encaminhado?</h2>
              {PAYMENT_METHODS.map((item) => (
                <button key={item.method} type="button" onClick={() => setMethod(item.method)} className="flex w-full items-center gap-3 rounded-xl border p-3.5 text-left" style={{ borderColor: method === item.method ? "#f4841a" : "var(--th-border)", background: method === item.method ? "rgba(244,132,26,0.06)" : "var(--th-card)" }}>
                  <Icon name={item.icon as IconName} size={20} style={{ color: "#f4841a" }} />
                  <div className="flex-1"><p className="text-sm font-bold" style={{ color: "var(--th-text)" }}>{item.label}</p><p className="text-xs" style={{ color: "var(--th-muted)" }}>{item.subtitle}</p></div>
                  {method === item.method && <Icon name="check" size={18} style={{ color: "#f4841a" }} />}
                </button>
              ))}
              <p className="rounded-xl p-3 text-xs leading-relaxed" style={{ background: "var(--th-card-alt)", color: "var(--th-muted)" }}>Este registro não faz cobrança automática. A pessoa responsável receberá a informação do valor e da forma escolhida para combinar o próximo passo.</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setFinancialStep(0)} icon="arrowLeft">Voltar</Button>
                <Button block size="lg" loading={submitting} onClick={confirm} icon="check">Registrar apoio</Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ── Demais tipos ────────────────────────────────── */}
      {!post?.demandId && type && !isFinancial && meta && (
        <Card>
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: "rgba(244,132,26,0.12)", color: "#f4841a" }}><Icon name={meta.icon as IconName} size={20} /></span>
            <div><p className="font-bold" style={{ color: "var(--th-text)" }}>{meta.label}</p><p className="text-xs" style={{ color: "var(--th-muted)" }}>{meta.subtitle}</p></div>
          </div>
          <div className="space-y-3">
            {(FIELDS[type] ?? []).map((f) => (
              <label key={f.key} className="block">
                <span className="mb-1.5 block text-sm font-semibold" style={{ color: "var(--th-text)" }}>{f.label}</span>
                <input value={details[f.key] ?? ""} onChange={(e) => setDetails((d) => ({ ...d, [f.key]: e.target.value }))} placeholder={f.placeholder} className="app-input" />
              </label>
            ))}
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold" style={{ color: "var(--th-text)" }}>Mensagem (opcional)</span>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Quer dizer algo a quem publicou?" className="app-textarea" />
            </label>
          </div>
          <div className="mt-4">
            <Button block size="lg" loading={submitting} onClick={confirm} icon="check">Registrar apoio</Button>
          </div>
        </Card>
      )}

      {gate && <div className="mt-4"><InstitutionGateNotice action="apoiar" status={gate.status} /></div>}
      {submitError && <p role="alert" className="mt-4 rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(229,57,53,0.10)", color: "#e53935" }}>{submitError}</p>}
    </div>
  );
}
