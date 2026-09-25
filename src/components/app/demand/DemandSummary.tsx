import type { ReactNode } from "react";
import {
  DEMAND_CATEGORY_LABELS,
  DEMAND_PRIORITY_LABELS,
  type Demand,
} from "@/lib/app/types";
import { DEMAND_PRIORITY_CRITERION_LABELS, type DemandStepId } from "@/lib/app/demand";
import { Button } from "../Button";
import {
  BudgetTable,
  CompositionCard,
  DocumentsSummary,
  GoalsList,
  ReadSection,
  ResourcesSummary,
  ScheduleList,
  TextBlock,
  ThemeChips,
  ModuleDetailsBlock,
} from "./DemandParts";

function Missing() {
  return <span style={{ color: "var(--th-muted)" }}>Não informado</span>;
}

const value = (text: string | number | null | undefined): ReactNode =>
  text === null || text === undefined || text === "" ? <Missing /> : text;

/**
 * Revisão da demanda do autor (etapa 9 e leitura de demanda enviada): tudo o
 * que foi preenchido, com atalho para a etapa quando ainda é editável.
 */
export function DemandSummary({ demand, onEdit }: { demand: Demand; onEdit?: (step: DemandStepId) => void }) {
  const edit = (step: DemandStepId, label: string) => onEdit && (
    <Button type="button" size="sm" variant="outline" icon="edit" onClick={() => onEdit(step)} aria-label={`Editar ${label}`}>Editar</Button>
  );
  const address = [
    demand.street && `${demand.street}${demand.addressNumber ? `, ${demand.addressNumber}` : ""}`,
    demand.addressComplement,
    demand.district,
    [demand.municipality, demand.uf].filter(Boolean).join("/"),
    demand.cep && `CEP ${demand.cep.replace(/^(\d{5})(\d{3})$/, "$1-$2")}`,
  ].filter(Boolean).join(" · ");

  return (
    <div className="space-y-4">
      <ReadSection title="Demanda" icon="tag" action={edit("descricao", "descrição")}>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
          <div className="space-y-3">
            <TextBlock label="Categoria">{demand.category ? DEMAND_CATEGORY_LABELS[demand.category] : <Missing />}</TextBlock>
            <ModuleDetailsBlock module={demand.module} moduleLabel={demand.moduleLabel} moduleDetails={demand.moduleDetails} />
            <TextBlock label="Eixos temáticos">
              {demand.themes?.length
                ? <ThemeChips themes={demand.themes} linkToMap={false} />
                : <span style={{ color: "var(--th-muted)" }}>Nenhum eixo marcado (opcional)</span>}
            </TextBlock>
            <TextBlock label="Título">{value(demand.title)}</TextBlock>
            <TextBlock label="Descrição detalhada">{value(demand.description)}</TextBlock>
            <TextBlock label="Problema identificado">{value(demand.problemIdentified)}</TextBlock>
          </div>
          {demand.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={demand.photoUrl} alt={`Fotografia da demanda ${demand.title ?? ""}`.trim()} className="h-40 w-full rounded-xl object-cover" />
          ) : (
            <div className="flex h-40 items-center justify-center rounded-xl border border-dashed text-xs" style={{ borderColor: "var(--th-border)", color: "var(--th-muted)" }}>Sem fotografia</div>
          )}
        </div>
      </ReadSection>

      <ReadSection title="Localização e território" icon="location" action={edit("descricao", "localização")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextBlock label="Endereço">{value(address)}</TextBlock>
          <TextBlock label="Território de abrangência">{value(demand.territory)}</TextBlock>
          <TextBlock label="Área de abrangência">{value(demand.coverageArea)}</TextBlock>
          <TextBlock label="Ponto no mapa">{demand.latitude != null && demand.longitude != null ? "Marcado" : <Missing />}</TextBlock>
        </div>
      </ReadSection>

      <ReadSection title="Público, objetivo e justificativa" icon="groups" action={edit("publico", "público beneficiado")}>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextBlock label="Estimativa de pessoas beneficiadas">
            {demand.beneficiariesEstimate != null ? <span className="font-numeric">{demand.beneficiariesEstimate.toLocaleString("pt-BR")}</span> : <Missing />}
          </TextBlock>
          <TextBlock label="Nível de prioridade">{demand.priority ? DEMAND_PRIORITY_LABELS[demand.priority] : <Missing />}</TextBlock>
          <TextBlock label="Critérios da prioridade">
            {demand.priorityCriteria?.length
              ? demand.priorityCriteria.map((c) => DEMAND_PRIORITY_CRITERION_LABELS[c] ?? c).join("; ")
              : <span style={{ color: "var(--th-muted)" }}>Nenhum critério marcado</span>}
          </TextBlock>
          <TextBlock label="Perfil dos beneficiários">{value(demand.beneficiariesProfile)}</TextBlock>
          <TextBlock label="Objetivo">{value(demand.objective)}</TextBlock>
          <TextBlock label="Justificativa">{value(demand.justification)}</TextBlock>
        </div>
      </ReadSection>

      <ReadSection title="Orçamento e composição financeira" icon="payments" action={edit("orcamento", "orçamento")}>
        <p className="mb-3 text-sm" style={{ color: "var(--th-text)" }}>
          Execução física ou intervenção com registro do antes e do depois: <strong>{demand.hasPhysicalExecution ? "sim" : "não"}</strong>
        </p>
        <BudgetTable items={demand.budgetItems ?? []} markUnlinked={(demand.scheduleItems ?? []).length > 0} />
        <div className="mt-4"><CompositionCard composition={demand.composition} /></div>
      </ReadSection>

      <ReadSection title="Cronograma físico-financeiro" icon="calendar" action={edit("cronograma", "cronograma")}>
        <ScheduleList items={demand.scheduleItems ?? []} budgetItems={demand.budgetItems ?? []} />
      </ReadSection>

      <ReadSection title="Metas e indicadores" icon="trophy" action={edit("metas", "metas")}>
        <GoalsList goals={demand.goals ?? []} />
      </ReadSection>

      <ReadSection title="Recursos e contrapartida" icon="inventory" action={edit("recursos", "recursos")}>
        <ResourcesSummary resources={demand.resources ?? []} />
      </ReadSection>

      <ReadSection title="Documentação comprobatória" icon="shield" action={edit("documentos", "documentos")}>
        <DocumentsSummary documents={demand.documents ?? []} />
      </ReadSection>
    </div>
  );
}
