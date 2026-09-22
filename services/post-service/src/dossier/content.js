// Conteúdo do Documento Oficial da Demanda — Dossiê da Demanda (T10).
//
// Fonte: slide 19 do Fluxo 2 ("O que o dossiê reúne"): identificação do
// Agente de Transformação (CNPJ e CNAE); categoria, descrição e justificativa,
// localização, território impactado, público beneficiado, objetivos;
// orçamento detalhado, composição financeira, previsão de custos de fotografia
// e filmagem; cronograma, prazos, metas, indicadores; recursos necessários,
// contrapartidas e documentação comprobatória.
//
// Módulo puro: monta o snapshot a partir das linhas do banco, a variante
// pública (redação) e o JSON canônico cujo SHA-256 identifica o dossiê.

const crypto = require('node:crypto');
const { CATEGORY_LABELS, STATUS_LABELS } = require('../demand/constants');

const DOCUMENT_TITLE = 'Documento Oficial da Demanda — Dossiê da Demanda';
const SCHEMA_VERSION = 1;

const PRIORITY_LABELS = { baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente' };

const MILESTONE_LABELS = {
  antes: 'Situação inicial (antes)',
  acompanhamento: 'Acompanhamento',
  depois: 'Resultado final (depois)',
};

// Os mesmos rótulos de src/lib/app/demand.ts (há teste que compara).
const RESOURCE_TYPE_LABELS = {
  recursos_financeiros: 'Recursos financeiros',
  materiais: 'Materiais',
  servicos: 'Serviços',
  equipamentos: 'Equipamentos',
  mao_de_obra: 'Mão de obra',
  estrutura: 'Estrutura',
  apoio_tecnico: 'Apoio técnico',
  conhecimento_especializado: 'Conhecimento especializado',
  servicos_de_fotografia_e_filmagem: 'Serviços de fotografia e filmagem',
  equipe: 'Equipe',
  espaco_fisico: 'Espaço físico',
  recursos_proprios: 'Recursos próprios',
  conhecimento_tecnico: 'Conhecimento técnico',
};

const DOCUMENT_TYPE_LABELS = {
  documentos_institucionais: 'Documentos institucionais',
  estatuto: 'Estatuto',
  documentos_de_representacao: 'Documentos de representação',
  autorizacoes: 'Autorizações',
  orcamentos_e_cotacoes: 'Orçamentos e cotações',
  projetos_tecnicos: 'Projetos técnicos',
  fotografias: 'Fotografias',
  outros: 'Outros documentos',
};

const TRIGGER_LABELS = {
  envio: 'Envio para análise',
  reenvio: 'Reenvio para análise',
  publicacao: 'Publicação',
};

const VARIANT_LABELS = {
  integral: 'Versão integral (Agente e equipe da plataforma)',
  publica: 'Versão pública (sem endereço completo, contatos e responsáveis)',
};

const toNumber = (v) => (v === null || v === undefined ? null : Number(v));
const toIso = (v) => (v instanceof Date ? v.toISOString() : v ?? null);
const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

function daysBetween(start, end) {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86_400_000) + 1 : null;
}

/**
 * Demanda congelada no pedido do dossiê (linha de `demands` com a projeção do
 * autor + itens de store.loadItems). É o que a versão integral mostra.
 */
function demandSnapshot(row, items) {
  const schedule = (items.scheduleItems ?? []).map((s) => ({
    id: s.id,
    stage: s.stage,
    activities: s.activities,
    startsOn: s.starts_on,
    endsOn: s.ends_on,
    responsible: text(s.responsible),
    recordMilestones: Array.isArray(s.record_milestones) ? s.record_milestones : [],
  }));
  const stageById = new Map(schedule.map((s) => [s.id, s.stage]));
  const budgetItems = (items.budgetItems ?? []).map((b) => ({
    description: b.description,
    quantity: String(b.quantity),
    unit: b.unit,
    unitPriceCents: toNumber(b.unit_price_cents),
    totalCents: toNumber(b.total_cents),
    isAudiovisualRecord: Boolean(b.is_audiovisual_record),
    scheduleStage: b.schedule_item_id ? stageById.get(b.schedule_item_id) ?? null : null,
  }));
  const resources = (items.resources ?? []).map((r) => ({
    kind: r.kind,
    type: r.resource_type,
    description: text(r.description),
  }));
  return {
    demand: {
      id: row.id,
      authorId: row.author_id,
      authorName: text(row.author_name),
      organizationId: row.organization_id ?? null,
      category: row.category ?? null,
      title: row.title ?? null,
      description: row.description ?? null,
      objective: row.objective ?? null,
      justification: row.justification ?? null,
      beneficiariesEstimate: toNumber(row.beneficiaries_estimate),
      beneficiariesProfile: row.beneficiaries_profile ?? null,
      priority: row.priority ?? null,
      hasPhysicalExecution: Boolean(row.has_physical_execution),
      photoRef: row.photo_ref ?? null,
      status: row.status,
      submittedAt: toIso(row.submitted_at),
      publishedAt: toIso(row.published_at),
    },
    location: {
      cep: row.cep ?? null,
      street: text(row.street),
      addressNumber: text(row.address_number),
      addressComplement: text(row.address_complement),
      district: text(row.district),
      municipality: text(row.municipality),
      uf: row.uf ?? null,
      latitude: toNumber(row.latitude),
      longitude: toNumber(row.longitude),
      territory: text(row.territory),
    },
    budget: {
      items: budgetItems,
      composition: {
        budgetAmountCents: toNumber(row.budget_amount_cents),
        agentFeeBps: toNumber(row.agent_fee_bps),
        platformFeeBps: toNumber(row.platform_fee_bps),
        agentFeeCents: toNumber(row.agent_fee_cents),
        platformFeeCents: toNumber(row.platform_fee_cents),
        totalAmountCents: toNumber(row.total_amount_cents),
      },
    },
    schedule: schedule.map((s) => ({
      stage: s.stage,
      activities: s.activities,
      startsOn: s.startsOn,
      endsOn: s.endsOn,
      responsible: s.responsible,
      recordMilestones: s.recordMilestones,
    })),
    goals: (items.goals ?? []).map((g) => ({
      goal: g.goal,
      expectedResult: g.expected_result,
      indicator: g.indicator,
      measurementMethod: g.measurement_method,
    })),
    resources: {
      necessary: resources.filter((r) => r.kind === 'necessario').map((r) => ({ type: r.type, description: r.description })),
      counterpart: resources.filter((r) => r.kind === 'contrapartida').map((r) => ({ type: r.type, description: r.description })),
    },
    documents: (items.documents ?? []).map((d) => ({
      type: d.document_type,
      title: d.title,
      description: text(d.description),
      // Arquivo enviado à plataforma ou link externo (compatibilidade).
      source: /^upload:/i.test(d.reference ?? '') ? 'arquivo' : 'link',
    })),
  };
}

/**
 * Variante pública: sem endereço completo (CEP, rua, número, complemento,
 * coordenadas), sem responsáveis do cronograma, sem descrição e origem dos
 * documentos, sem ids internos da instituição e do autor.
 */
function redactSnapshot(snapshot) {
  const { demand, location, schedule, documents } = snapshot;
  return {
    ...snapshot,
    // A foto é descrita em `photo` (sem a referência interna do upload).
    demand: { ...demand, authorId: null, organizationId: null, photoRef: null },
    location: {
      cep: null,
      street: null,
      addressNumber: null,
      addressComplement: null,
      district: location.district,
      municipality: location.municipality,
      uf: location.uf,
      latitude: null,
      longitude: null,
      territory: location.territory,
    },
    schedule: schedule.map((s) => ({ ...s, responsible: null })),
    documents: documents.map((d) => ({ type: d.type, title: d.title, description: null, source: null })),
  };
}

/**
 * Identificação do Agente a partir da projeção pública do user-service
 * (GET /:userId/institution: só instituição validada, sem contatos).
 */
function institutionIdentity(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const secondary = Array.isArray(raw.cnae_secondary) ? raw.cnae_secondary : [];
  return {
    kind: raw.institution_kind ?? null,
    legalName: text(raw.legal_name),
    tradeName: text(raw.trade_name),
    cnpj: text(raw.cnpj),
    cnaePrimary: text(raw.cnae_primary),
    cnaePrimaryDescription: text(raw.cnae_primary_description),
    cnaeSecondary: secondary
      .map((c) => (typeof c === 'string' ? { code: c, description: null } : { code: c?.code ?? null, description: c?.description ?? null }))
      .filter((c) => c.code),
    municipality: text(raw.municipality),
    uf: raw.uf ?? null,
    territory: text(raw.territory),
    validationStatus: raw.validation_status ?? null,
  };
}

/** Prazos derivados do cronograma: início, término e duração em dias. */
function deadlines(schedule) {
  const starts = schedule.map((s) => s.startsOn).filter(Boolean).sort();
  const ends = schedule.map((s) => s.endsOn).filter(Boolean).sort();
  if (!starts.length || !ends.length) return { startsOn: null, endsOn: null, durationDays: null, stages: 0 };
  const startsOn = starts[0];
  const endsOn = ends[ends.length - 1];
  return { startsOn, endsOn, durationDays: daysBetween(startsOn, endsOn), stages: schedule.length };
}

/**
 * Conteúdo final do dossiê (o que o PDF mostra e o hash identifica).
 * `meta`: { number, version, variant, trigger, issuedAt }; `photo`: { sha256,
 * contentType, embedded } ou null.
 */
function buildDossierContent({ snapshot, institution, meta, photo = null }) {
  const base = meta.variant === 'publica' ? redactSnapshot(snapshot) : snapshot;
  const audiovisualCents = base.budget.items
    .filter((i) => i.isAudiovisualRecord)
    .reduce((sum, i) => sum + (i.totalCents ?? 0), 0);
  return {
    schema: SCHEMA_VERSION,
    document: DOCUMENT_TITLE,
    number: meta.number,
    version: meta.version,
    variant: meta.variant,
    trigger: meta.trigger,
    issuedAt: meta.issuedAt,
    agent: {
      institution: institutionIdentity(institution),
      authorName: base.demand.authorName,
    },
    ...base,
    photo: snapshot.demand.photoRef
      ? {
        ref: base.demand.photoRef,
        sha256: photo?.sha256 ?? null,
        contentType: photo?.contentType ?? null,
        embedded: Boolean(photo?.embedded),
      }
      : null,
    deadlines: deadlines(base.schedule),
    audiovisualCents,
  };
}

/** JSON canônico: chaves ordenadas, sem espaços (mesma entrada → mesmos bytes). */
function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
}

const sha256Hex = (data) => crypto.createHash('sha256').update(data).digest('hex');

/** SHA-256 do conteúdo (impresso no PDF e usado na verificação pública). */
const contentHash = (content) => sha256Hex(canonicalJson(content));

const HASH_RE = /^[0-9a-f]{64}$/;

/** Endereço público de verificação (`<site>/dossie/verificar/<hash>`). */
function verifyUrl(siteUrl, hash) {
  return `${String(siteUrl).replace(/\/+$/, '')}/dossie/verificar/${hash}`;
}

/** Número do dossiê: DMC-<ano>-<sequência com 6 dígitos>. */
function formatDossierNumber(year, sequence) {
  return `DMC-${year}-${String(sequence).padStart(6, '0')}`;
}

module.exports = {
  DOCUMENT_TITLE,
  SCHEMA_VERSION,
  CATEGORY_LABELS,
  STATUS_LABELS,
  PRIORITY_LABELS,
  MILESTONE_LABELS,
  RESOURCE_TYPE_LABELS,
  DOCUMENT_TYPE_LABELS,
  TRIGGER_LABELS,
  VARIANT_LABELS,
  HASH_RE,
  demandSnapshot,
  redactSnapshot,
  institutionIdentity,
  deadlines,
  buildDossierContent,
  canonicalJson,
  contentHash,
  sha256Hex,
  verifyUrl,
  formatDossierNumber,
};
