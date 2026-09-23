// O que sai da plataforma para o modelo (T23).
//
// Regra: **nenhum dado pessoal no prompt**. Só o necessário para a sugestão, e
// sempre pelo nome do campo, para o registro de uso (`ai_suggestions.prompt_fields`)
// dizer exatamente o que foi enviado.
//
// Nunca é enviado: nome, avatar, e-mail, telefone, id de conta, CNPJ, CPF,
// endereço fino (logradouro, número, complemento, CEP), coordenada, URL de
// foto, de documento ou de comprovante, nome de representante, conteúdo de
// conexão ou de mensagem entre pessoas, e nada de prestação de contas que não
// seja número agregado.
//
// É enviado, por recurso:
//   organizacao_da_demanda / deteccao_de_urgencia
//     titulo, descricao, objetivo, justificativa, perfil_do_publico,
//     beneficiarios_estimados, bairro, municipio, uf, territorio,
//     tem_execucao_fisica, orcamento_total_reais, recursos_necessarios,
//     categoria_atual, prioridade_atual
//   sugestao_de_editais
//     os mesmos campos de classificação da demanda (sem descrição longa) e a
//     lista pública de editais divulgados pelos órgãos (título, resumo,
//     programa, território, período) — dado já público no feed
//   conexao_com_patrocinadores
//     categoria, territorio, municipio, uf, recursos_necessarios da demanda e,
//     de cada interesse registrado, só `referencia` (um número de 1 a N, que
//     só a plataforma sabe mapear), categoria da conta, tipo de oferta,
//     ofertas e a compatibilidade transparente da T15 (nota, nível e motivos)
//   relatorio_para_governo
//     nome público do órgão, esfera, município/UF, período, e os indicadores
//     agregados da T22 — números, nunca linhas individuais
//
// Além da seleção de campos, todo texto livre passa por `scrubText`, que
// apaga e-mail, telefone, CPF, CNPJ e URL que o autor tenha escrito no meio da
// descrição, e corta o texto num teto de caracteres (custo e prompt previsível).

const MAX_TEXT = 1_500;
const MAX_SHORT_TEXT = 400;
const MAX_LIST = 20;

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
// (11) 99999-9999, 11999999999, +55 11 99999 9999 e variações.
const PHONE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2}\)?[\s.-]?)?\d{4,5}[\s.-]?\d{4}\b/g;
const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const CNPJ = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const URL = /\bhttps?:\/\/\S+/gi;

/** Texto livre sem contato, documento nem link, cortado no teto. */
function scrubText(value, max = MAX_TEXT) {
  if (typeof value !== 'string') return null;
  const clean = value
    .replace(URL, '[link removido]')
    .replace(EMAIL, '[e-mail removido]')
    .replace(CNPJ, '[documento removido]')
    .replace(CPF, '[documento removido]')
    .replace(PHONE, '[telefone removido]')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return null;
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

const reais = (cents) => (Number.isFinite(Number(cents)) ? Math.round(Number(cents)) / 100 : null);

/** Só chaves com valor: o prompt não carrega `null` à toa. */
function compact(object) {
  return Object.fromEntries(Object.entries(object).filter(([, v]) => v !== null && v !== undefined
    && !(Array.isArray(v) && v.length === 0)));
}

/**
 * Retrato da demanda para classificação e urgência.
 * `row` é a linha de `demands`; `resources`, as linhas de `demand_resources`.
 */
function demandContext(row, resources = []) {
  return compact({
    titulo: scrubText(row?.title, MAX_SHORT_TEXT),
    descricao: scrubText(row?.description),
    objetivo: scrubText(row?.objective, MAX_SHORT_TEXT),
    justificativa: scrubText(row?.justification, MAX_SHORT_TEXT),
    perfil_do_publico: scrubText(row?.beneficiaries_profile, MAX_SHORT_TEXT),
    beneficiarios_estimados: Number.isFinite(Number(row?.beneficiaries_estimate))
      ? Number(row.beneficiaries_estimate) : null,
    bairro: scrubText(row?.district, 120),
    municipio: scrubText(row?.municipality, 120),
    uf: typeof row?.uf === 'string' ? row.uf.trim().toUpperCase() : null,
    territorio: scrubText(row?.territory, 255),
    tem_execucao_fisica: row?.has_physical_execution === undefined ? null : Boolean(row.has_physical_execution),
    orcamento_total_reais: reais(row?.total_amount_cents),
    recursos_necessarios: (resources ?? [])
      .filter((r) => r?.kind === 'necessario')
      .map((r) => r.resource_type ?? r.type)
      .filter((type) => typeof type === 'string')
      .slice(0, MAX_LIST),
    categoria_atual: row?.category ?? null,
    prioridade_atual: row?.priority ?? null,
  });
}

/** Retrato curto da demanda para editais e patrocinadores (sem texto longo). */
function demandBrief(row, resources = []) {
  const full = demandContext(row, resources);
  const rest = { ...full };
  delete rest.descricao;
  delete rest.justificativa;
  return compact({ ...rest, resumo: scrubText(row?.description, MAX_SHORT_TEXT) });
}

/** Editais divulgados pelos órgãos (T22): conteúdo já público no feed. */
function editalContext(actions = []) {
  return (actions ?? []).slice(0, MAX_LIST).map((action, index) => compact({
    referencia: index + 1,
    titulo: scrubText(action?.title, MAX_SHORT_TEXT),
    resumo: scrubText(action?.summary, MAX_SHORT_TEXT),
    programa: scrubText(action?.programName, MAX_SHORT_TEXT),
    territorio: scrubText(action?.territory, 255),
    municipio: scrubText(action?.municipality, 120),
    uf: typeof action?.uf === 'string' ? action.uf.trim().toUpperCase() : null,
    inicio: action?.startsOn ?? null,
    termino: action?.endsOn ?? null,
  }));
}

/**
 * Interessados na demanda (T15) sem identidade: `referencia` é a posição na
 * lista que a rota devolveu, e só a plataforma sabe mapear para o interesse.
 */
function interestContext(interests = []) {
  return (interests ?? []).slice(0, MAX_LIST).map((interest, index) => compact({
    referencia: index + 1,
    categoria_da_conta: interest?.accountCategory ?? null,
    tipo_de_interesse: interest?.kind ?? null,
    ofertas: Array.isArray(interest?.offerTypes) ? interest.offerTypes.slice(0, MAX_LIST) : [],
    compatibilidade_nota: Number.isFinite(Number(interest?.compatibilityScore))
      ? Number(interest.compatibilityScore) : null,
    compatibilidade_nivel: interest?.compatibilityLevel ?? null,
    compatibilidade_motivos: Array.isArray(interest?.compatibilityReasons)
      ? interest.compatibilityReasons.slice(0, MAX_LIST).map((r) => scrubText(r, 200)).filter(Boolean)
      : [],
  }));
}

/** Indicadores agregados do órgão (T22) para o relatório. Só números e rótulos. */
function governmentContext(report) {
  const organization = report?.organization ?? {};
  return compact({
    orgao: scrubText(organization.name, MAX_SHORT_TEXT),
    secretaria: scrubText(organization.department, MAX_SHORT_TEXT),
    esfera: organization.governmentSphere ?? null,
    municipio: scrubText(organization.municipality, 120),
    uf: typeof organization.uf === 'string' ? organization.uf.trim().toUpperCase() : null,
    recorte: report?.scopeLabel ?? report?.scope ?? null,
    periodo: compact({ de: report?.period?.from ?? null, ate: report?.period?.to ?? null }),
    indicadores: report?.indicators ?? {},
    por_territorio: Array.isArray(report?.territories) ? report.territories.slice(0, MAX_LIST) : [],
    por_categoria: Array.isArray(report?.categories) ? report.categories.slice(0, MAX_LIST) : [],
  });
}

/** Nomes dos campos enviados, para `ai_suggestions.prompt_fields`. */
function promptFields(context) {
  const names = new Set();
  const walk = (value, prefix) => {
    if (Array.isArray(value)) {
      if (value.length) walk(value[0], `${prefix}[]`);
      return;
    }
    if (value && typeof value === 'object') {
      for (const [key, inner] of Object.entries(value)) walk(inner, prefix ? `${prefix}.${key}` : key);
      return;
    }
    if (prefix) names.add(prefix);
  };
  walk(context, '');
  return [...names].sort();
}

module.exports = {
  MAX_TEXT,
  MAX_SHORT_TEXT,
  scrubText,
  demandContext,
  demandBrief,
  editalContext,
  interestContext,
  governmentContext,
  promptFields,
};
