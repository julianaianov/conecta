// Módulos específicos da demanda (T-05-08) — espelho de
// services/post-service/src/demand/modules.js; demand-modules.test.mjs compara.
//
// Fonte: Modelo de Conexão §29 (tabela Tipo de demanda → Módulo), §23 (obra),
// §24 (restinga), §25 (projeto social) e §40. Decisão 15: o módulo é
// derivado da categoria, nunca escolhido pelo usuário.

import type {
  DemandCategory,
  DemandDocumentType,
  DemandModule,
  DemandModuleDetails,
  DemandScheduleMilestone,
} from "./types.ts";

export const DEMAND_MODULES: DemandModule[] = ["obras", "ambiental", "social", "apoio_investimento", "articulacao_publica"];

export const DEMAND_MODULE_LABELS: Record<DemandModule, string> = {
  obras: "Módulo de Obras",
  ambiental: "Módulo Ambiental",
  social: "Módulo Social",
  apoio_investimento: "Módulo de Apoio/Investimento",
  articulacao_publica: "Módulo de Articulação Pública",
};

export const MODULE_BY_CATEGORY: Record<DemandCategory, DemandModule> = {
  obra_ou_melhoria_de_infraestrutura: "obras",
  revitalizacao_de_espaco: "obras",
  projeto_ambiental: "ambiental",
  recuperacao_ambiental: "ambiental",
  projeto_social: "social",
  necessidade_de_patrocinio: "apoio_investimento",
  apoio_tecnico: "apoio_investimento",
  apoio_com_servicos: "apoio_investimento",
  apoio_com_materiais: "apoio_investimento",
  problema_urbano: "articulacao_publica",
  problema_urgente: "articulacao_publica",
  outras_demandas_territoriais: "articulacao_publica",
};

export function moduleOf(category: DemandCategory | "" | null | undefined): DemandModule | null {
  return category ? MODULE_BY_CATEGORY[category] ?? null : null;
}

export const MODULE_DOCUMENT_TYPES: Record<DemandModule, DemandDocumentType[]> = {
  obras: [
    "documentos_institucionais", "documento_do_imovel", "autorizacoes", "projeto_arquitetonico",
    "projetos_tecnicos", "orcamentos_e_cotacoes", "art_rrt", "licencas_ou_autorizacoes", "contratos",
    "notas_fiscais", "comprovantes", "relatorio_de_execucao",
  ],
  ambiental: [
    "fotografias", "metodologia", "plano_de_recuperacao", "licencas_ou_autorizacoes",
    "plano_de_monitoramento", "relatorio_ambiental",
  ],
  social: [
    "projetos_tecnicos", "plano_de_trabalho", "orcamentos_e_cotacoes", "metodologia",
    "documentos_institucionais", "equipe", "publico_alvo", "relatorio_de_execucao", "comprovantes",
    "fotografias",
  ],
  apoio_investimento: [],
  articulacao_publica: [],
};

export const MODULE_INDICATORS: Record<DemandModule, string[]> = {
  obras: [
    "Área reformada", "Etapas concluídas", "Valor executado", "Prazo", "Número de beneficiários",
    "Melhorias realizadas",
  ],
  ambiental: [
    "Área recuperada", "Número de mudas", "Espécies utilizadas", "Taxa de sobrevivência",
    "Área monitorada", "Ações realizadas", "Período de acompanhamento",
  ],
  social: [
    "Número de beneficiários", "Número de atividades", "Número de atendimentos", "Frequência",
    "Horas de atividade", "Capacitações realizadas", "Metas alcançadas", "Resultados sociais",
  ],
  apoio_investimento: [],
  articulacao_publica: [],
};

export const BASE_MILESTONES: DemandScheduleMilestone[] = ["antes", "acompanhamento", "depois"];

export const MODULE_MILESTONES: Record<DemandModule, DemandScheduleMilestone[]> = {
  obras: BASE_MILESTONES,
  ambiental: ["antes", "diagnostico", "intervencao", "monitoramento", "depois"],
  social: BASE_MILESTONES,
  apoio_investimento: BASE_MILESTONES,
  articulacao_publica: BASE_MILESTONES,
};

/** Marcos oferecidos no cronograma (o ambiental soma os seus aos comuns). */
export function scheduleMilestonesFor(category: DemandCategory | "" | null | undefined): DemandScheduleMilestone[] {
  const mod = moduleOf(category);
  if (mod !== "ambiental") return BASE_MILESTONES;
  return ["antes", "diagnostico", "intervencao", "monitoramento", "acompanhamento", "depois"];
}

export interface ModuleTextField { key: string; label: string; max: number }

export type ModuleField =
  | { key: keyof DemandModuleDetails; label: string; type: "number" }
  | { key: keyof DemandModuleDetails; label: string; type: "text"; max: number }
  | { key: keyof DemandModuleDetails; label: string; type: "group"; fields: ModuleTextField[] };

const PERSON_FIELDS: ModuleTextField[] = [
  { key: "nome", label: "Nome", max: 200 },
  { key: "registro", label: "Registro profissional (CREA, CAU, CRBio ou outro)", max: 120 },
];

export const MODULE_FIELDS: Record<DemandModule, ModuleField[]> = {
  obras: [
    { key: "area_m2", label: "Área da obra ou reforma (m²)", type: "number" },
    {
      key: "imovel",
      label: "Imóvel",
      type: "group",
      fields: [
        { key: "documento", label: "Documento do imóvel (matrícula, escritura, cessão ou outro)", max: 500 },
        { key: "autorizacao", label: "Autorização para a obra (quem autoriza e como)", max: 500 },
      ],
    },
    { key: "responsavel_tecnico", label: "Responsável técnico", type: "group", fields: PERSON_FIELDS },
  ],
  ambiental: [
    { key: "area_m2", label: "Área (m²)", type: "number" },
    { key: "diagnostico", label: "Diagnóstico", type: "text", max: 4000 },
    { key: "situacao_atual", label: "Situação atual", type: "text", max: 4000 },
    { key: "vegetacao", label: "Vegetação", type: "text", max: 2000 },
    { key: "metodologia", label: "Metodologia", type: "text", max: 4000 },
    { key: "responsavel_tecnico", label: "Responsável técnico", type: "group", fields: PERSON_FIELDS },
    { key: "plano_de_monitoramento", label: "Plano de monitoramento", type: "text", max: 4000 },
  ],
  social: [
    { key: "equipe", label: "Equipe", type: "text", max: 4000 },
    { key: "publico_alvo", label: "Público-alvo", type: "text", max: 2000 },
    { key: "metodologia", label: "Metodologia", type: "text", max: 4000 },
  ],
  apoio_investimento: [],
  articulacao_publica: [],
};

/** Tipos de documento com os do módulo primeiro (sem repetir os comuns). */
export function documentTypesFor(
  category: DemandCategory | "" | null | undefined,
  all: DemandDocumentType[],
): DemandDocumentType[] {
  const mod = moduleOf(category);
  const first = mod ? MODULE_DOCUMENT_TYPES[mod] : [];
  return [...first, ...all.filter((type) => !first.includes(type))];
}

/** Formulário: tudo em texto; grupos como objetos de texto. */
export type ModuleDetailsForm = Record<string, string | Record<string, string>>;

export function moduleDetailsFormFrom(details: DemandModuleDetails | null | undefined): ModuleDetailsForm {
  const out: ModuleDetailsForm = {};
  for (const [key, value] of Object.entries(details ?? {})) {
    if (value === null || value === undefined) continue;
    if (typeof value === "object") {
      out[key] = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, String(v ?? "")]));
    } else {
      out[key] = typeof value === "number" ? String(value).replace(".", ",") : String(value);
    }
  }
  return out;
}

/**
 * Formulário → corpo do PUT (`moduleDetails`), só com as chaves do módulo da
 * categoria; branco some; área vai como número quando dá para ler.
 */
export function moduleDetailsInput(
  category: DemandCategory | "" | null | undefined,
  form: ModuleDetailsForm,
): DemandModuleDetails {
  const mod = moduleOf(category);
  const out: Record<string, unknown> = {};
  for (const field of mod ? MODULE_FIELDS[mod] : []) {
    const raw = form[field.key];
    if (raw === undefined) continue;
    if (field.type === "group") {
      const group: Record<string, string> = {};
      for (const sub of field.fields) {
        const v = typeof raw === "object" ? (raw[sub.key] ?? "").trim() : "";
        if (v) group[sub.key] = v;
      }
      if (Object.keys(group).length) out[field.key] = group;
    } else if (typeof raw === "string" && raw.trim()) {
      if (field.type === "number") {
        const text = raw.trim();
        const n = Number(text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text);
        out[field.key] = Number.isFinite(n) ? n : raw.trim();
      } else {
        out[field.key] = raw.trim();
      }
    }
  }
  return out as DemandModuleDetails;
}

/** Informações do módulo em pares [rótulo, valor] para leitura. */
export function moduleDetailLines(
  demandModule: DemandModule | null | undefined,
  details: DemandModuleDetails | null | undefined,
): [string, string][] {
  const lines: [string, string][] = [];
  const source = (details ?? {}) as Record<string, unknown>;
  for (const field of demandModule ? MODULE_FIELDS[demandModule] : []) {
    const value = source[field.key];
    if (value === undefined || value === null) continue;
    if (field.type === "number") {
      lines.push([field.label, `${Number(value).toLocaleString("pt-BR")} m²`]);
    } else if (field.type === "group") {
      const group = value as Record<string, string>;
      const parts = field.fields.map((sub) => (group[sub.key] ? `${sub.label}: ${group[sub.key]}` : null)).filter(Boolean);
      if (parts.length) lines.push([field.label, parts.join(" · ")]);
    } else {
      lines.push([field.label, String(value)]);
    }
  }
  return lines;
}
