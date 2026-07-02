"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import { formatCurrency } from "@/lib/app/format";
import {
  PAYMENT_CONFIG, PAYMENT_METHODS, SUPPORT_TYPES, SUPPORT_TYPE_META,
  type Post, type PaymentMethod, type SupportType,
} from "@/lib/app/types";
import { Avatar } from "@/components/app/Avatar";
import { Icon, type IconName } from "@/components/app/Icon";
import { Button } from "@/components/app/Button";
import { Card } from "@/components/app/ui";

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
    { key: "Canais", label: "Canais de divulgação", placeholder: "Ex.: Instagram, grupos" },
    { key: "Alcance", label: "Alcance estimado", placeholder: "Ex.: 5 mil pessoas" },
  ],
};

const QUICK_AMOUNTS = [20, 50, 100, 200];

export default function SupportFlowPage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();

  const [post, setPost] = useState<Post | null>(null);
  const [type, setType] = useState<SupportType | null>((search.get("type") as SupportType) || null);
  const [sub, setSub] = useState(0); // sub-etapa (financeiro)
  const [amount, setAmount] = useState<number>(50);
  const [method, setMethod] = useState<PaymentMethod>("pix");
  const [message, setMessage] = useState("");
  const [details, setDetails] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => { api.getPost(id).then(setPost); }, [id]);

  const isFinancial = type === "financial";
  const totalSteps = isFinancial ? 3 : 1;
  const progress = type ? (done ? 1 : (sub + 1) / totalSteps) : 0;

  async function confirm() {
    if (!type || !user) return;
    setSubmitting(true);
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
    } finally { setSubmitting(false); }
  }

  function copyPix() {
    navigator.clipboard?.writeText(PAYMENT_CONFIG.pixKey).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); });
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
            {isFinancial && <p className="mt-1 text-sm font-numeric" style={{ color: "var(--th-muted)" }}>{formatCurrency(amount)} · {PAYMENT_METHODS.find((m) => m.method === method)?.label}</p>}
            {post && <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>em <b>{post.title}</b></p>}
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Button href="/meus-apoios" block icon="heart">Ver meus apoios</Button>
            <Button href={`/post/${id}`} variant="outline" block>Voltar à publicação</Button>
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

      {/* progresso */}
      {type && (
        <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--th-card-alt)" }}>
          <div className="h-full rounded-full transition-all" style={{ width: `${progress * 100}%`, background: "linear-gradient(90deg,#f4841a,#f89b45)" }} />
        </div>
      )}

      {post && (
        <div className="mb-4 flex items-center gap-3">
          <Avatar name={post.authorName} src={post.authorAvatar} id={post.authorId} size={38} />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold" style={{ color: "var(--th-text)" }}>{post.title}</p>
            <p className="text-xs" style={{ color: "var(--th-muted)" }}>Como você quer apoiar?</p>
          </div>
        </div>
      )}

      {/* ── Escolha do tipo ─────────────────────────────── */}
      {!type && (
        <div className="space-y-2">
          {SUPPORT_TYPES.map((s) => (
            <button key={s.type} onClick={() => { setType(s.type); setSub(0); }} className="app-card flex w-full items-center gap-3 rounded-xl p-3.5 text-left transition-all hover:border-[#f4841a]">
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

      {/* ── Financeiro ──────────────────────────────────── */}
      {isFinancial && (
        <Card>
          {sub === 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold" style={{ color: "var(--th-text)" }}>Quanto deseja doar?</h2>
              <div className="flex items-center gap-2 rounded-xl border px-4 py-3" style={{ borderColor: "var(--th-border)" }}>
                <span className="text-xl font-bold" style={{ color: "var(--th-muted)" }}>R$</span>
                <input type="number" min={1} value={amount} onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))} className="w-full bg-transparent text-2xl font-bold outline-none font-numeric" style={{ color: "var(--th-text)" }} />
              </div>
              <div className="flex flex-wrap gap-2">
                {QUICK_AMOUNTS.map((v) => (
                  <button key={v} onClick={() => setAmount(v)} className="app-chip" data-active={amount === v}>{formatCurrency(v)}</button>
                ))}
              </div>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Mensagem (opcional)" className="app-textarea" />
              <Button block size="lg" disabled={amount <= 0} onClick={() => setSub(1)} iconRight="chevronRight">Continuar</Button>
            </div>
          )}

          {sub === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold" style={{ color: "var(--th-text)" }}>Forma de pagamento</h2>
              {PAYMENT_METHODS.map((m) => (
                <button key={m.method} onClick={() => setMethod(m.method)} className="flex w-full items-center gap-3 rounded-xl border p-3.5 text-left" style={{ borderColor: method === m.method ? "#f4841a" : "var(--th-border)", background: method === m.method ? "rgba(244,132,26,0.06)" : "var(--th-card)" }}>
                  <Icon name={m.icon as IconName} size={20} style={{ color: "#f4841a" }} />
                  <div className="flex-1"><p className="text-sm font-bold" style={{ color: "var(--th-text)" }}>{m.label}</p><p className="text-xs" style={{ color: "var(--th-muted)" }}>{m.subtitle}</p></div>
                  {method === m.method && <Icon name="check" size={18} style={{ color: "#f4841a" }} />}
                </button>
              ))}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setSub(0)} icon="arrowLeft">Voltar</Button>
                <Button block onClick={() => setSub(2)} iconRight="chevronRight">Continuar</Button>
              </div>
            </div>
          )}

          {sub === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold" style={{ color: "var(--th-text)" }}>{method === "pix" ? "Pague com PIX" : "Dados do cartão"}</h2>
              {method === "pix" ? (
                <div className="text-center">
                  <FakeQR />
                  <p className="mt-3 text-xs" style={{ color: "var(--th-muted)" }}>Chave PIX ({PAYMENT_CONFIG.pixName})</p>
                  <button onClick={copyPix} className="mt-1 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold" style={{ borderColor: "var(--th-border)", color: "var(--th-text)" }}>
                    <Icon name={copied ? "check" : "copy"} size={16} style={{ color: copied ? "#2e9e5b" : "#f4841a" }} /> {copied ? "Copiada!" : PAYMENT_CONFIG.pixKey}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <input placeholder="Número do cartão" className="app-input font-numeric" />
                  <input placeholder="Nome impresso no cartão" className="app-input" />
                  <div className="flex gap-3"><input placeholder="Validade" className="app-input font-numeric" /><input placeholder="CVV" className="app-input font-numeric" /></div>
                </div>
              )}
              <div className="rounded-xl p-3 text-center" style={{ background: "var(--th-card-alt)" }}>
                <span className="text-sm" style={{ color: "var(--th-muted)" }}>Total: </span>
                <span className="text-lg font-bold font-numeric" style={{ color: "var(--th-text)" }}>{formatCurrency(amount)}</span>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setSub(1)} icon="arrowLeft">Voltar</Button>
                <Button block size="lg" loading={submitting} onClick={confirm} icon="check">Confirmar apoio</Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ── Demais tipos ────────────────────────────────── */}
      {type && !isFinancial && meta && (
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
            <Button block size="lg" loading={submitting} onClick={confirm} icon="check">Confirmar apoio</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function FakeQR() {
  // QR decorativo (demo) — gerado deterministicamente
  const cells = useMemo(() => {
    const out: boolean[] = [];
    let seed = 7;
    for (let i = 0; i < 441; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; out.push((seed >> 16) % 2 === 0); }
    return out;
  }, []);
  return (
    <div className="mx-auto grid w-44 gap-0.5 rounded-xl bg-white p-3" style={{ gridTemplateColumns: "repeat(21,1fr)" }}>
      {cells.map((on, i) => <span key={i} style={{ aspectRatio: "1", background: on ? "#0d2d42" : "transparent", borderRadius: 1 }} />)}
    </div>
  );
}
