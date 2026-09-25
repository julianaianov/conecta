/**
 * Peças de leitura da demanda, sem estado: servem ao assistente (revisão), a
 * "Minhas demandas" e à página pública (SSR). Só mostram o que recebem; a
 * projeção pública do post-service já tira os dados privados.
 */
import type { ReactNode } from "react";
import {
  DEMAND_CATEGORY_LABELS,
  DEMAND_PRIORITY_LABELS,
  DEMAND_STATUS_LABELS,
  type DemandBudgetItem,
  type DemandCategory,
  type DemandComposition,
  type DemandGoal,
  type DemandPriority,
  type DemandScheduleMilestone,
  type DemandModule,
  type DemandModuleDetails,
  type DemandResource,
  type DemandReviewState,
  type DemandStatus,
  type DemandDocumentType,
} from "@/lib/app/types";
import {
  DEMAND_PRIORITY_COLORS,
  DEMAND_REVIEW_STATE_COLORS,
  DEMAND_STATUS_COLORS,
  DOCUMENT_TYPE_LABELS,
  RECORD_MILESTONE_LABELS,
  RESOURCE_TYPE_LABELS,
  demandStatusText,
  formatBps,
  formatCents,
  formatIsoDate,
  formatQuantity,
  physicalFinancialRows,
} from "@/lib/app/demand";
import { Icon, type IconName } from "../Icon";
import { moduleDetailLines } from "@/lib/app/demand-modules";

const CATEGORY_ICONS: Record<DemandCategory, IconName> = {
  projeto_social: "groups",
  projeto_ambiental: "leaf",
  necessidade_de_patrocinio: "payments",
  problema_urbano: "construction",
  problema_urgente: "bolt",
  obra_ou_melhoria_de_infraestrutura: "home_work",
  revitalizacao_de_espaco: "map",
  recuperacao_ambiental: "leaf",
  apoio_tecnico: "handyman",
  apoio_com_servicos: "volunteer",
  apoio_com_materiais: "inventory",
  outras_demandas_territoriais: "location",
};

export function categoryIcon(category: DemandCategory): IconName {
  return CATEGORY_ICONS[category] ?? "tag";
}

function Pill({ color, icon, children }: { color: string; icon?: IconName; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: `${color}1a`, color }}>
      {icon ? <Icon name={icon} size={12} /> : <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />}
      {children}
    </span>
  );
}

export function DemandStatusBadge({ status, reviewState }: { status: DemandStatus; reviewState?: DemandReviewState | null }) {
  const color = status === "em_analise" && reviewState ? DEMAND_REVIEW_STATE_COLORS[reviewState] : DEMAND_STATUS_COLORS[status];
  if (!DEMAND_STATUS_LABELS[status]) return null;
  return <Pill color={color ?? "#868e96"}>{demandStatusText({ status, reviewState })}</Pill>;
}

export function CategoryBadge({ category }: { category: DemandCategory | null }) {
  if (!category || !DEMAND_CATEGORY_LABELS[category]) return null;
  return <Pill color="#1b4f72" icon={categoryIcon(category)}>{DEMAND_CATEGORY_LABELS[category]}</Pill>;
}

export function PriorityBadge({ priority }: { priority: DemandPriority | null }) {
  if (!priority || !DEMAND_PRIORITY_LABELS[priority]) return null;
  return <Pill color={DEMAND_PRIORITY_COLORS[priority]}>Prioridade {DEMAND_PRIORITY_LABELS[priority].toLowerCase()}</Pill>;
}

/** Fluxo canônico (Fluxo 2, slide 21) com o status atual destacado. */
export function StatusTrack({ status }: { status: DemandStatus }) {
  const order: DemandStatus[] = ["em_analise", "publicada", "em_busca_de_parceiro", "conectada", "em_execucao", "concluida", "prestacao_de_contas"];
  const current = order.indexOf(status);
  return (
    <ol className="flex flex-wrap gap-1.5" aria-label="Etapas do status da demanda">
      {order.map((s, i) => {
        const done = current >= 0 && i < current;
        const active = i === current;
        return (
          <li
            key={s}
            aria-current={active ? "step" : undefined}
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{
              background: active ? "#1b4f72" : done ? "rgba(46,158,91,0.12)" : "var(--th-card-alt)",
              color: active ? "#fff" : done ? "#2e9e5b" : "var(--th-muted)",
            }}
          >
            {done && <span className="sr-only">Concluído: </span>}
            {DEMAND_STATUS_LABELS[s]}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Composição financeira (Fluxo 2, slides 9 e 10; decisão 5). Os percentuais
 * são acrescidos ao valor original, nunca descontados do recurso de execução.
 */
// TODO(fonte-da-verdade): Modelo de Conexão §04 Obs. — 4% + 6% não se aplica a conexões com o Poder Público; ver TODO em services/post-service/migrations/007-demands.sql.
export function CompositionCard({ composition, preview = false, pending = false, title = "Composição financeira" }: {
  composition: DemandComposition; preview?: boolean; pending?: boolean; title?: string;
}) {
  const rows: [string, string, boolean?][] = [
    ["Valor do orçamento para execução", formatCents(composition.budgetAmountCents)],
    [`${formatBps(composition.agentFeeBps)} — Agente de Transformação`, `+ ${formatCents(composition.agentFeeCents)}`],
    [`${formatBps(composition.platformFeeBps)} — Plataforma`, `+ ${formatCents(composition.platformFeeCents)}`],
    ["Valor total da demanda", formatCents(composition.totalAmountCents), true],
  ];
  return (
    <section aria-label={title} className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--th-border)", background: "var(--th-card)" }}>
      <div className="flex items-center justify-between gap-2 px-4 py-3 text-white" style={{ background: "linear-gradient(135deg,#0d2d42,#1b4f72,#2e7ba8)" }}>
        <h3 className="text-sm font-bold">{title}</h3>
        {preview && <span className="text-[11px] font-semibold opacity-90" aria-live="polite">{pending ? "Calculando…" : "Prévia calculada pelo servidor"}</span>}
      </div>
      <dl className="divide-y" style={{ borderColor: "var(--th-border)" }}>
        {rows.map(([label, value, strong]) => (
          <div key={label} className="flex items-baseline justify-between gap-3 px-4 py-2.5" style={{ borderColor: "var(--th-border)", background: strong ? "rgba(244,132,26,0.08)" : undefined }}>
            <dt className={`text-sm ${strong ? "font-bold" : ""}`} style={{ color: "var(--th-text)" }}>{label}</dt>
            <dd className={`font-numeric text-sm ${strong ? "text-base font-bold" : "font-semibold"}`} style={{ color: strong ? "#f4841a" : "var(--th-text)" }}>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="px-4 py-3 text-xs" style={{ color: "var(--th-muted)" }}>
        Os percentuais de 4% e 6% são calculados sobre o valor original do orçamento e <strong>acrescidos</strong> ao valor total da demanda,
        <strong> não descontados</strong> do recurso destinado à execução. O cálculo é feito automaticamente pelo sistema.
      </p>
    </section>
  );
}

export function BudgetTable({ items, actions, caption = "Orçamento detalhado", markUnlinked = false }: {
  items: DemandBudgetItem[];
  actions?: (item: DemandBudgetItem) => ReactNode;
  caption?: string;
  /** Marca os itens sem etapa do cronograma (físico-financeiro, slide 14; T-02-05). */
  markUnlinked?: boolean;
}) {
  if (!items.length) return <p className="text-sm" style={{ color: "var(--th-muted)" }}>Nenhum item no orçamento.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--th-border)" }}>
      <table className="w-full min-w-[36rem] text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead style={{ background: "var(--th-card-alt)", color: "var(--th-muted)" }}>
          <tr className="text-xs uppercase tracking-wide">
            <th scope="col" className="px-3 py-2 font-semibold">Item</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Qtd.</th>
            <th scope="col" className="px-3 py-2 font-semibold">Unid.</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Valor unit.</th>
            <th scope="col" className="px-3 py-2 text-right font-semibold">Total</th>
            {actions && <th scope="col" className="px-3 py-2"><span className="sr-only">Ações</span></th>}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-t align-top" style={{ borderColor: "var(--th-border)", color: "var(--th-text)" }}>
              <td className="px-3 py-2">
                <span className="font-semibold">{item.description}</span>
                {item.isAudiovisualRecord && (
                  <span className="mt-1 flex items-center gap-1 text-[11px] font-bold" style={{ color: "#2e7ba8" }}>
                    <Icon name="eye" size={12} /> Registro fotográfico e audiovisual
                  </span>
                )}
                {markUnlinked && !item.scheduleItemId && (
                  <span className="mt-1 flex items-center gap-1 text-[11px] font-bold" style={{ color: "#b35c00" }}>
                    <Icon name="info" size={12} /> Sem etapa do cronograma vinculada
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-right font-numeric">{formatQuantity(item.quantity)}</td>
              <td className="px-3 py-2">{item.unit}</td>
              <td className="px-3 py-2 text-right font-numeric">{formatCents(item.unitPriceCents)}</td>
              <td className="px-3 py-2 text-right font-numeric font-semibold">{formatCents(item.totalCents)}</td>
              {actions && <td className="px-3 py-2 text-right">{actions(item)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type ScheduleLike = {
  id: string; stage: string; activities: string; startsOn: string; endsOn: string;
  responsible?: string | null; recordMilestones: DemandScheduleMilestone[];
};

export function MilestoneChips({ milestones }: { milestones: DemandScheduleMilestone[] }) {
  if (!milestones.length) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Registro fotográfico e audiovisual previsto">
      {milestones.map((m) => (
        <li key={m} className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold" style={{ background: "rgba(46,123,168,0.10)", color: "#2e7ba8" }}>
          <Icon name="eye" size={11} /> {RECORD_MILESTONE_LABELS[m]}
        </li>
      ))}
    </ul>
  );
}

export function ScheduleList({ items, budgetItems = [], actions }: {
  items: ScheduleLike[]; budgetItems?: DemandBudgetItem[]; actions?: (item: ScheduleLike) => ReactNode;
}) {
  if (!items.length) return <p className="text-sm" style={{ color: "var(--th-muted)" }}>Nenhuma etapa no cronograma.</p>;
  const costs = new Map(physicalFinancialRows(budgetItems, items).map((row) => [row.scheduleItemId, row]));
  return (
    <ol className="space-y-3">
      {items.map((item, index) => {
        const cost = costs.get(item.id);
        return (
          <li key={item.id} className="rounded-xl border p-3" style={{ borderColor: "var(--th-border)" }}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold" style={{ color: "var(--th-text)" }}>
                  <span className="font-numeric" style={{ color: "#f4841a" }}>{index + 1}.</span> {item.stage}
                </p>
                <p className="text-xs font-numeric" style={{ color: "var(--th-muted)" }}>
                  {formatIsoDate(item.startsOn)} a {formatIsoDate(item.endsOn)}
                  {item.responsible ? ` · Responsável: ${item.responsible}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {cost && cost.itemCount > 0 && (
                  <span className="rounded-md px-2 py-0.5 text-xs font-bold font-numeric" style={{ background: "rgba(244,132,26,0.10)", color: "#f4841a" }}>
                    {formatCents(cost.totalCents)}
                  </span>
                )}
                {actions?.(item)}
              </div>
            </div>
            <p className="mt-2 whitespace-pre-line text-sm" style={{ color: "var(--th-text)" }}>{item.activities}</p>
            <MilestoneChips milestones={item.recordMilestones} />
          </li>
        );
      })}
    </ol>
  );
}

export function GoalsList({ goals, actions }: { goals: DemandGoal[]; actions?: (goal: DemandGoal) => ReactNode }) {
  if (!goals.length) return <p className="text-sm" style={{ color: "var(--th-muted)" }}>Nenhuma meta informada.</p>;
  return (
    <ol className="space-y-3">
      {goals.map((goal, index) => (
        <li key={goal.id} className="rounded-xl border p-3" style={{ borderColor: "var(--th-border)" }}>
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-bold" style={{ color: "var(--th-text)" }}>
              <span className="font-numeric" style={{ color: "#f4841a" }}>Meta {index + 1}.</span> {goal.goal}
            </p>
            {actions?.(goal)}
          </div>
          <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
            {([["Resultado esperado", goal.expectedResult], ["Indicador", goal.indicator], ["Mensuração", goal.measurementMethod]] as const).map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>{label}</dt>
                <dd className="whitespace-pre-line" style={{ color: "var(--th-text)" }}>{value}</dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ol>
  );
}

export function ResourcesSummary({ resources }: { resources: DemandResource[] }) {
  const groups: [string, DemandResource[]][] = [
    ["Recursos necessários", resources.filter((r) => r.kind === "necessario")],
    ["Contrapartida da instituição", resources.filter((r) => r.kind === "contrapartida")],
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {groups.map(([title, list]) => (
        <div key={title}>
          <h4 className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>{title}</h4>
          {list.length ? (
            <ul className="mt-2 space-y-2">
              {list.map((r) => (
                <li key={r.id} className="text-sm" style={{ color: "var(--th-text)" }}>
                  <span className="font-semibold">{RESOURCE_TYPE_LABELS[r.type] ?? "Recurso"}</span>
                  {r.description && <span className="block whitespace-pre-line text-xs" style={{ color: "var(--th-muted)" }}>{r.description}</span>}
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm" style={{ color: "var(--th-muted)" }}>Nada informado.</p>}
        </div>
      ))}
    </div>
  );
}

export function DocumentsSummary({ documents, actions }: {
  documents: { id: string; type: DemandDocumentType; title: string }[];
  actions?: (doc: { id: string }) => ReactNode;
}) {
  if (!documents.length) return <p className="text-sm" style={{ color: "var(--th-muted)" }}>Nenhum documento anexado.</p>;
  return (
    <ul className="space-y-2">
      {documents.map((doc) => (
        <li key={doc.id} className="flex items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "var(--th-border)" }}>
          <Icon name="inventory" size={16} className="shrink-0" style={{ color: "#2e7ba8" }} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold" style={{ color: "var(--th-text)" }}>{doc.title}</p>
            <p className="text-xs" style={{ color: "var(--th-muted)" }}>{DOCUMENT_TYPE_LABELS[doc.type] ?? "Documento"}</p>
          </div>
          {actions?.(doc)}
        </li>
      ))}
    </ul>
  );
}

/** Bloco de leitura com título. */
export function ReadSection({ title, icon, children, action }: { title: string; icon?: IconName; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="app-card rounded-2xl p-4 sm:p-5" aria-label={title}>
      <div className="mb-3 flex items-center gap-2">
        {icon && (
          <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: "rgba(46,123,168,0.12)", color: "#2e7ba8" }}>
            <Icon name={icon} size={15} />
          </span>
        )}
        <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--th-text)", letterSpacing: "0.04em" }}>{title}</h2>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/**
 * Módulo específico (T-05-08, Modelo §29) e as suas informações, derivados da
 * categoria. Sem módulo ou sem informação, mostra só o nome do módulo.
 */
export function ModuleDetailsBlock({ module: demandModule, moduleLabel, moduleDetails }: {
  module?: DemandModule | null; moduleLabel?: string | null; moduleDetails?: DemandModuleDetails | null;
}) {
  if (!demandModule || !moduleLabel) return null;
  const lines = moduleDetailLines(demandModule, moduleDetails);
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>Módulo específico</h3>
      <p className="mt-1 text-[15px] font-semibold" style={{ color: "var(--th-text)" }}>{moduleLabel}</p>
      {lines.length > 0 && (
        <dl className="mt-2 grid gap-2 sm:grid-cols-2">
          {lines.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-semibold" style={{ color: "var(--th-muted)" }}>{label}</dt>
              <dd className="whitespace-pre-line text-sm" style={{ color: "var(--th-text)" }}>{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export function TextBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>{label}</h3>
      <div className="mt-1 whitespace-pre-line text-[15px] leading-relaxed" style={{ color: "var(--th-text)" }}>{children}</div>
    </div>
  );
}
