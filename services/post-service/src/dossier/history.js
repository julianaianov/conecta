// Histórico do Dossiê da Demanda (T-05-10).
//
// Fonte: Modelo de Conexão §06 "O Dossiê reúne … Documentos, Histórico" e o
// exemplo do §12 ("22/09/2026 — 14h35 …"). O histórico são os eventos de
// `demand_events` até o momento em que a versão é pedida (o retrato congela
// junto com a demanda). Versão integral: todos os eventos, com o tipo de ator
// e a nota. Versão pública: só `is_public`, sem ator e sem nota — a mesma
// regra de `GET /demands/:id/timeline`.
//
// O texto de cada evento é montado aqui, no momento do retrato, a partir do
// tipo e do `payload->'public'` (o que já é público por construção); ids,
// nomes de pessoas e o payload interno nunca entram.

const { STATUS_LABELS } = require('../demand/constants');
const { INSTITUTIONAL_STATUS_LABELS, RESPONSE_TYPE_LABELS } = require('../institutional/constants');
const { PARTY_KIND_LABELS, PROCESS_STATUS_LABELS } = require('../process/constants');

// Eventos da demanda até agora, em ordem. O protocolo do processo vem da
// ligação `process_id` (T-05-01) ou do payload público.
const HISTORY_SQL = `
  SELECT e.id, e.event_type, e.actor_type, e.note, e.is_public, e.to_status::text AS to_status, e.created_at,
         e.payload->'public' AS details, e.payload->>'reenvio' AS reenvio, e.payload->>'version' AS dossier_version,
         coalesce(p.protocol, e.payload->'public'->>'protocol') AS protocol
    FROM demand_events e
    LEFT JOIN connection_processes p ON p.id = e.process_id
   WHERE e.demand_id = $1
   ORDER BY e.created_at, e.id`;

const ACTOR_LABELS = {
  agente: 'Agente de Transformação',
  gestao: 'Equipe da plataforma',
  sistema: 'Sistema',
  poder_publico: 'Poder Público',
  parceiro: 'Parceiro',
  comunicacao: 'Comunicação',
  comunidade: 'Membro da Comunidade',
};

const USER_CATEGORY_LABELS = {
  parceiro: 'Parceiro', poder_publico: 'Poder Público', comunidade: 'Membro da Comunidade',
  comunicacao: 'Comunicação', agente: 'Agente de Transformação',
};

// Tipos sem detalhe variável.
const FIXED_LABELS = {
  criada: 'Rascunho criado',
  devolvida_para_ajustes: 'Devolvida para ajustes',
  publicada: 'Demanda publicada',
  arquivada: 'Arquivada',
  interesse_retirado: 'Manifestação de interesse retirada',
  conexao_solicitada: 'Conexão solicitada ao Agente',
  conexao_recusada: 'Pedido de conexão recusado',
  conexao_cancelada: 'Pedido de conexão cancelado',
  apoio_confirmado: 'Apoio confirmado pelo Agente de Transformação',
  apoio_contestado: 'Apoio contestado pelo Agente de Transformação',
  encaminhamento_status_alterado: 'Encaminhamento atualizado',
  encaminhamento_atualizado: 'Encaminhamento atualizado',
  evidencia_registrada: 'Evidência da execução registrada',
  registro_pareado: 'Registros do antes e do depois pareados',
  andamento_registrado: 'Andamento da execução atualizado',
  prazo_alterado: 'Prazo de etapa alterado',
  registro_dispensado: 'Demanda sem execução física a registrar',
  etapa_atrasada: 'Etapa atrasada',
  ocorrencia_registrada: 'Ocorrência registrada na execução',
  ocorrencia_resolvida: 'Ocorrência resolvida',
  documento_da_execucao_registrado: 'Documento da execução anexado',
  prestacao_de_contas_concluida: 'Prestação de contas concluída',
  resultados_registrados: 'Resultados registrados',
  divulgacao_registrada: 'Divulgação registrada pela Comunicação',
  responsavel_do_processo_definido: 'Responsável atual do processo definido',
  mensagem_registrada: 'Mensagem registrada no processo',
  prazo_definido: 'Prazo definido no processo',
  prazo_cumprido: 'Prazo cumprido no processo',
  prazo_vencido: 'Prazo vencido no processo',
};

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Texto do evento ("O que aconteceu"), sem nome de pessoa nem id. */
function historyLabel(row) {
  const d = row.details && typeof row.details === 'object' ? row.details : {};
  const org = str(d.organizationName) ?? 'Poder Público';
  const protocol = str(row.protocol) ?? str(d.protocol);
  const who = USER_CATEGORY_LABELS[d.userCategory] ?? null;
  switch (row.event_type) {
    case 'enviada_para_analise':
      return row.reenvio === 'true' ? 'Reenviada para análise' : 'Enviada para análise';
    case 'status_alterado':
      return STATUS_LABELS[row.to_status] ? `Status: ${STATUS_LABELS[row.to_status]}` : 'Andamento atualizado';
    case 'dossie_gerado':
      return `Dossiê da Demanda gerado${/^\d+$/.test(row.dossier_version ?? '') ? ` (versão ${row.dossier_version})` : ''}`;
    case 'acompanhamento_institucional_aberto':
      return `${org} recebeu a demanda`;
    case 'status_institucional_alterado': {
      const label = INSTITUTIONAL_STATUS_LABELS[d.institutionalStatus];
      return label ? `${org}: ${label}` : `${org} atualizou o acompanhamento`;
    }
    case 'resposta_institucional': {
      const label = RESPONSE_TYPE_LABELS[d.responseType];
      return label ? `Resposta institucional de ${org}: ${label}` : `Resposta institucional de ${org}`;
    }
    case 'apoio_institucional_oferecido':
      return `${org} ofereceu apoio`;
    case 'demanda_encaminhada':
      return `${org} encaminhou a demanda`;
    case 'interesse_registrado':
      return `${who ?? 'Um apoiador'} demonstrou interesse`;
    case 'conexao_aceita':
      return who ? `Conexão aceita pelo Agente (${who})` : 'Conexão aceita pelo Agente';
    case 'apoio_declarado':
      return 'Apoio registrado';
    case 'processo_formalizado': {
      const party = str(d.organizationName) ?? PARTY_KIND_LABELS[d.partyKind] ?? null;
      return `Conexão formalizada${protocol ? ` — processo ${protocol}` : ''}${party ? ` (${party})` : ''}`;
    }
    case 'processo_status_alterado':
      return `Processo${protocol ? ` ${protocol}` : ''}: ${PROCESS_STATUS_LABELS[d.status] ?? 'status atualizado'}`;
    default:
      return FIXED_LABELS[row.event_type] ?? 'Atualização registrada';
  }
}

const toIso = (v) => (v instanceof Date ? v.toISOString() : v ?? null);

/** Linhas de HISTORY_SQL → itens do retrato (versão integral). */
function historySnapshot(rows) {
  return (rows ?? []).map((row) => ({
    at: toIso(row.created_at),
    type: row.event_type,
    label: historyLabel(row),
    protocol: str(row.protocol),
    isPublic: row.is_public === true,
    actorType: row.actor_type ?? null,
    note: str(row.note),
  }));
}

/** Versão pública: só eventos públicos, sem ator e sem nota. */
function redactHistory(history) {
  return history
    .filter((h) => h.isPublic)
    .map(({ at, type, label, protocol }) => ({ at, type, label, protocol }));
}

/** "22/09/2026 — 14h35" (horário de Brasília), como no exemplo do §12. */
function formatHistoryWhen(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '—';
  const p = Object.fromEntries(new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} — ${p.hour}h${p.minute}`;
}

module.exports = {
  HISTORY_SQL,
  ACTOR_LABELS,
  historyLabel,
  historySnapshot,
  redactHistory,
  formatHistoryWhen,
};
