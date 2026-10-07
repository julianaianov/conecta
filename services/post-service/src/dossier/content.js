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
const { MODULE_LABELS, MODULE_FIELDS, moduleOf, detailsForCategory } = require('../demand/modules');
const { redactHistory } = require('./history');

const DOCUMENT_TITLE = 'Documento Oficial da Demanda — Dossiê da Demanda';
const SCHEMA_VERSION = 1;

const PRIORITY_LABELS = { baixa: 'Baixa', media: 'Média', alta: 'Alta', urgente: 'Urgente' };

// Texto literal do Modelo de Conexão §04 (Obs.), impresso no dossiê (decisão 14).
const FEE_OBSERVATION = 'Este valor (%) será aplicado exclusivamente às conexões realizadas com Parceiros, '
  + 'Investidores e Empresas. Não se aplica às conexões com o Poder Público.';

const MILESTONE_LABELS = {
  antes: 'Situação inicial (antes)',
  diagnostico: 'Diagnóstico',
  intervencao: 'Intervenção',
  monitoramento: 'Monitoramento',
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
  // Módulos específicos (Modelo §23–§25, T-05-08).
  documento_do_imovel: 'Documento do imóvel',
  projeto_arquitetonico: 'Projeto arquitetônico',
  art_rrt: 'ART/RRT',
  licencas_ou_autorizacoes: 'Licenças ou autorizações',
  contratos: 'Contratos',
  notas_fiscais: 'Notas fiscais',
  comprovantes: 'Comprovantes',
  relatorio_de_execucao: 'Relatório de execução',
  plano_de_trabalho: 'Plano de trabalho',
  metodologia: 'Metodologia',
  equipe: 'Equipe',
  publico_alvo: 'Público-alvo',
  plano_de_recuperacao: 'Plano de recuperação',
  plano_de_monitoramento: 'Plano de monitoramento',
  relatorio_ambiental: 'Relatório ambiental',
};

const TRIGGER_LABELS = {
  envio: 'Envio para análise',
  reenvio: 'Reenvio para análise',
  publicacao: 'Publicação',
  conclusao: 'Conclusão da execução',
  prestacao_de_contas: 'Prestação de contas e resultados',
  encerramento: 'Encerramento da demanda',
};

const VARIANT_LABELS = {
  integral: 'Versão integral (Agente e equipe da plataforma)',
  publica: 'Versão pública (sem endereço completo, contatos e responsáveis)',
};

const toNumber = (v) => (v === null || v === undefined ? null : Number(v));
const toIso = (v) => (v instanceof Date ? v.toISOString() : v ?? null);
const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Coluna DATE como `AAAA-MM-DD` (o pg a entrega como Date à meia-noite local). */
function toDay(v) {
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    const pad = (n) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }
  return typeof v === 'string' && v ? v.slice(0, 10) : null;
}

function daysBetween(start, end) {
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86_400_000) + 1 : null;
}

/**
 * Demanda congelada no pedido do dossiê (linha de `demands` com a projeção do
 * autor + itens de store.loadItems). É o que a versão integral mostra.
 */
function demandSnapshot(row, items, {
  accountability = null, processes = null, history = null, execution = null,
} = {}) {
  const schedule = (items.scheduleItems ?? []).map((s) => ({
    id: s.id,
    stage: s.stage,
    activities: s.activities,
    startsOn: s.starts_on,
    endsOn: s.ends_on,
    responsible: text(s.responsible),
    // Recursos necessários e valor associado da etapa (Modelo §05, T-05-09).
    resourcesNeeded: text(s.resources_needed),
    amountCents: toNumber(s.amount_cents),
    recordMilestones: Array.isArray(s.record_milestones) ? s.record_milestones : [],
  }));
  const stageById = new Map(schedule.map((s) => [s.id, s.stage]));
  const budgetItems = (items.budgetItems ?? []).map((b) => ({
    // Item e fornecedor ou referência (Modelo §04, T-05-09).
    item: text(b.item),
    supplierReference: text(b.supplier_reference),
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
      problemIdentified: row.problem_identified ?? null,
      objective: row.objective ?? null,
      justification: row.justification ?? null,
      beneficiariesEstimate: toNumber(row.beneficiaries_estimate),
      beneficiariesProfile: row.beneficiaries_profile ?? null,
      priority: row.priority ?? null,
      // Critérios declarados para a prioridade (decisão 17, T-02-01; migração 042).
      priorityCriteria: Array.isArray(row.priority_criteria) ? row.priority_criteria : [],
      hasPhysicalExecution: Boolean(row.has_physical_execution),
      // Módulo específico derivado da categoria (T-05-08) e as suas informações.
      module: moduleOf(row.category),
      moduleLabel: MODULE_LABELS[moduleOf(row.category)] ?? null,
      moduleDetails: detailsForCategory(row.category, row.module_details),
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
      coverageArea: text(row.coverage_area),
    },
    budget: {
      items: budgetItems,
      // Projeção "se apoiada por Parceiros/Empresas" (decisão 14): 4% + 6%
      // nunca incidem sobre o Poder Público; o que vale é o de cada processo
      // (`processes`). O orçamento de execução é `budgetAmountCents`.
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
      deadlineDays: daysBetween(s.startsOn, s.endsOn),
      resourcesNeeded: s.resourcesNeeded,
      amountCents: s.amountCents,
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
    // Prestação de contas concluída (T18, slide 24). `null` enquanto não há.
    // A projeção já é a pública (sem nota interna e sem arquivo do anexo),
    // então a variante pública do dossiê a repete sem redigir mais nada.
    accountability: accountabilitySnapshot(accountability),
    // Processos de Conexão com a contribuição e as taxas de cada um (T-05-06,
    // decisão 14; colunas da migração 040). Ausente em retratos anteriores.
    ...(Array.isArray(processes) ? { processes: processes.map(processSnapshot) } : {}),
    // Histórico (Modelo §06, T-05-10): eventos da demanda até o pedido desta
    // versão (src/dossier/history.js). Ausente em retratos anteriores.
    ...(Array.isArray(history) ? { history } : {}),
    // Execução (Modelo de Conexão §22): entregas, evidências (fotos e vídeos) e
    // documentos da execução, sem referência nem URL de arquivo. Ausente em
    // retratos anteriores.
    ...(execution ? { execution: executionSnapshot(execution) } : {}),
    // Encerramento (Modelo de Conexão §22, T-05-14; migração 037): data de
    // conclusão, responsáveis e registro final. Só em demanda encerrada.
    ...(row.closed_at ? {
      closure: {
        closedAt: toIso(row.closed_at),
        responsibles: text(row.closing_responsibles),
        summary: text(row.closing_summary),
      },
    } : {}),
  };
}

/**
 * Retrato da execução (Modelo de Conexão §22: "Entregas, ... Evidências,
 * Documentos, ... Fotos, Vídeos"). Recebe as linhas de `listDeliveries`,
 * `listEvidences` e `listExecutionDocuments` (src/execution/store.js). Nada
 * aqui leva o arquivo: nem a referência `upload:`, nem URL, nem o autor.
 */
function executionSnapshot({ deliveries = [], evidences = [], documents = [] } = {}) {
  return {
    deliveries: deliveries.map((d) => ({
      item: d.item,
      description: text(d.description),
      deliveredOn: toDay(d.delivered_on),
      recipient: text(d.recipient),
      recipientPublic: d.recipient_public === true,
      stage: text(d.stage),
      evidence: d.evidence_id
        ? { milestone: d.evidence_milestone ?? null, mediaKind: d.evidence_media_kind ?? null, recordedOn: toDay(d.evidence_recorded_on) }
        : null,
    })),
    evidences: evidences.map((e) => ({
      milestone: e.milestone,
      mediaKind: e.media_kind,
      caption: text(e.caption),
      recordedOn: toDay(e.recorded_on),
      stage: text(e.stage),
    })),
    documents: documents.map((x) => ({
      kind: x.kind,
      title: x.title,
      description: text(x.description),
      issuedOn: toDay(x.issued_on),
      amountCents: toNumber(x.amount_cents),
      stage: text(x.stage),
      milestone: x.milestone ?? null,
    })),
  };
}

/**
 * Versão pública da execução: o recebedor só fica quando o Agente autorizou
 * (pode ser pessoa física) e a descrição do documento fica de fora, como na
 * página da demanda.
 */
function redactExecution(execution) {
  return {
    ...execution,
    deliveries: execution.deliveries.map((d) => ({ ...d, recipient: d.recipientPublic ? d.recipient : null })),
    documents: execution.documents.map((x) => ({ ...x, description: null })),
  };
}

/** Processo de Conexão no retrato do dossiê (linha de `connection_processes`). */
function processSnapshot(p) {
  return {
    protocol: p.protocol,
    sequenceInDemand: toNumber(p.sequence_in_demand),
    partyKind: p.party_kind,
    partyName: text(p.party_name),
    status: p.status,
    contributionKinds: Array.isArray(p.contribution_kinds) ? p.contribution_kinds : [],
    contributionAmountCents: toNumber(p.contribution_amount_cents),
    feeApplies: p.fee_applies === true,
    agentFeeCents: toNumber(p.agent_fee_cents),
    platformFeeCents: toNumber(p.platform_fee_cents),
    totalWithFeesCents: toNumber(p.total_with_fees_cents),
    formalizedAt: toIso(p.formalized_at),
  };
}

/**
 * Execução × com taxas (decisão 14): orçamento de execução da demanda e a
 * soma das contribuições financeiras dos processos, separando os que têm
 * 4% + 6% (Parceiros, Investidores e Empresas) dos do Poder Público (sem
 * taxas). `null` quando o retrato não traz processos.
 */
function connectionFinance(snapshot) {
  if (!Array.isArray(snapshot.processes)) return null;
  const withAmount = snapshot.processes.filter((p) => p.contributionAmountCents !== null
    && !['cancelada', 'nao_aprovada', 'nao_e_de_competencia'].includes(p.status));
  const sum = (list, key) => list.reduce((total, p) => total + (p[key] ?? 0), 0);
  const withFees = withAmount.filter((p) => p.feeApplies);
  const government = withAmount.filter((p) => !p.feeApplies);
  return {
    executionBudgetCents: snapshot.budget.composition.budgetAmountCents,
    withFees: {
      processes: withFees.length,
      contributionCents: sum(withFees, 'contributionAmountCents'),
      agentFeeCents: sum(withFees, 'agentFeeCents'),
      platformFeeCents: sum(withFees, 'platformFeeCents'),
      totalWithFeesCents: sum(withFees, 'totalWithFeesCents'),
    },
    government: {
      processes: government.length,
      contributionCents: sum(government, 'contributionAmountCents'),
    },
  };
}

/** Retrato da prestação de contas concluída (projeção pública da T18). */
function accountabilitySnapshot(view) {
  if (!view || !view.accountability) return null;
  const a = view.accountability;
  return {
    concludedAt: a.concludedAt,
    executionReport: a.executionReport,
    actionsRecord: a.actionsRecord,
    scheduleSummary: a.scheduleSummary,
    beneficiariesReached: a.beneficiariesReached,
    beneficiariesEstimate: a.beneficiariesEstimate,
    beneficiariesNote: a.beneficiariesNote,
    impactIndicators: a.impactIndicators,
    financialSupport: a.financialSupport === true,
    financialSummary: a.financialSummary,
    executedAmountCents: a.executedAmountCents,
    // Modelo de Conexão §21 (T-05-13).
    participants: a.participants ?? null,
    executedFrom: a.executedFrom ?? null,
    executedTo: a.executedTo ?? null,
    locationSummary: a.locationSummary ?? null,
    finalResult: a.finalResult ?? null,
    results: (view.results ?? []).map((r) => ({
      goal: r.goal,
      indicator: r.indicator,
      expectedResult: r.expectedResult,
      measuredValue: r.measuredValue,
      measurementMethod: r.measurementMethod,
      achieved: r.achieved === true,
    })),
    documents: (view.documents ?? []).map((d) => ({
      kind: d.kind,
      title: d.title,
      issuedOn: d.issuedOn,
      amountCents: d.amountCents,
    })),
    summary: view.summary ?? null,
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
    // O imóvel (documento e autorização) fica fora da versão pública.
    demand: {
      ...demand,
      authorId: null,
      organizationId: null,
      photoRef: null,
      moduleDetails: Object.fromEntries(Object.entries(demand.moduleDetails ?? {}).filter(([key]) => key !== 'imovel')),
    },
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
      coverageArea: location.coverageArea ?? null,
    },
    // Fornecedor ou referência pode ser nome de pessoa (T-05-09).
    budget: { ...snapshot.budget, items: snapshot.budget.items.map((b) => ({ ...b, supplierReference: null })) },
    schedule: schedule.map((s) => ({ ...s, responsible: null })),
    documents: documents.map((d) => ({ type: d.type, title: d.title, description: null, source: null })),
    // Processos como na lista pública: o órgão é identificado; Parceiros, só pelo tipo.
    ...(Array.isArray(snapshot.processes)
      ? { processes: snapshot.processes.map((p) => ({ ...p, partyName: p.partyKind === 'poder_publico' ? p.partyName : null })) }
      : {}),
    // Histórico: só eventos públicos, sem ator e sem nota (T-05-10).
    ...(Array.isArray(snapshot.history) ? { history: redactHistory(snapshot.history) } : {}),
    // Execução: o recebedor da entrega só com autorização do Agente.
    ...(snapshot.execution ? { execution: redactExecution(snapshot.execution) } : {}),
    // Encerramento: os responsáveis podem ser nomes de pessoas (T-05-14).
    ...(snapshot.closure ? { closure: { ...snapshot.closure, responsibles: null } } : {}),
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
 * contentType, embedded } ou null. O histórico (T-05-10), quando o retrato o
 * traz, entra no conteúdo e portanto no SHA-256.
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
    // Execução × com taxas por processo (T-05-06, decisão 14).
    ...(Array.isArray(base.processes) ? { connectionFinance: connectionFinance(base) } : {}),
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

/**
 * Informações do módulo em pares [rótulo, valor], na ordem de MODULE_FIELDS
 * (o grupo vira "Nome — registro"; a área, "1.200,5 m²").
 */
function moduleDetailLines(demand) {
  const details = demand?.moduleDetails ?? {};
  const lines = [];
  for (const field of MODULE_FIELDS[demand?.module] ?? []) {
    const value = details[field.key];
    if (value === undefined || value === null) continue;
    if (field.type === 'number') {
      lines.push([field.label, `${Number(value).toLocaleString('pt-BR')} m²`]);
    } else if (field.type === 'group') {
      const parts = field.fields.map((sub) => (value[sub.key] ? `${sub.label}: ${value[sub.key]}` : null)).filter(Boolean);
      if (parts.length) lines.push([field.label, parts.join('\n')]);
    } else {
      lines.push([field.label, value]);
    }
  }
  return lines;
}

module.exports = {
  moduleDetailLines,
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
  accountabilitySnapshot,
  executionSnapshot,
  processSnapshot,
  connectionFinance,
  FEE_OBSERVATION,
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
