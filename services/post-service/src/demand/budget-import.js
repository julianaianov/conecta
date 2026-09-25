// Importação da planilha do orçamento (Modelo de Conexão §04: "O sistema pode
// receber uma planilha detalhada"; T-05-09).
//
// Formato aceito: CSV em UTF-8 (com ou sem BOM), separador `;` (o padrão do
// Excel e do LibreOffice em português; `,` e tabulação também são
// reconhecidos pelo cabeçalho), campos entre aspas quando precisarem,
// decimal com vírgula e milhar com ponto ("1.250,50"). A primeira linha é o
// cabeçalho, com as colunas do §04:
//
//   item;descricao;quantidade;unidade;valor_unitario;fornecedor
//
// `descricao`, `quantidade`, `unidade` e `valor_unitario` são obrigatórias;
// `item`, `fornecedor` (ou `fornecedor_ou_referencia`, `referencia`) e
// `registro_audiovisual` (sim/não) são opcionais. O valor total é sempre
// calculado (quantidade × valor unitário, finance.js); uma coluna de total na
// planilha é ignorada.
//
// XLSX não é lido: exige escolher e aprovar uma biblioteca de parsing (ver o
// relatório da T-05-09). O portal oferece o modelo CSV para baixar.
//
// Módulo puro: devolve os itens já no formato de `validateDemand` ou os erros
// por linha. Nada é gravado aqui.

const { validateDemand, MAX_ITEMS } = require('./validation');
const { MAX_BUDGET_CENTS } = require('./finance');

const IMPORT_MODES = ['acrescentar', 'substituir'];
const MAX_IMPORT_BYTES = 512 * 1024;

// Cabeçalho normalizado (minúsculas, sem acento, `_` no lugar de espaço) → campo.
const HEADER_ALIASES = {
  item: 'item',
  descricao: 'description',
  descricao_do_item: 'description',
  quantidade: 'quantity',
  qtd: 'quantity',
  qtde: 'quantity',
  unidade: 'unit',
  unid: 'unit',
  valor_unitario: 'unitPrice',
  valor_unit: 'unitPrice',
  preco_unitario: 'unitPrice',
  fornecedor: 'supplierReference',
  fornecedor_ou_referencia: 'supplierReference',
  referencia: 'supplierReference',
  registro_audiovisual: 'isAudiovisualRecord',
  valor_total: null,
  total: null,
};

const REQUIRED_COLUMNS = ['description', 'quantity', 'unit', 'unitPrice'];

const COLUMN_LABELS = {
  item: 'item',
  description: 'descricao',
  quantity: 'quantidade',
  unit: 'unidade',
  unitPrice: 'valor_unitario',
  supplierReference: 'fornecedor',
  isAudiovisualRecord: 'registro_audiovisual',
};

/** Cabeçalho do modelo para baixar (o portal usa o mesmo texto). */
const TEMPLATE_HEADER = 'item;descricao;quantidade;unidade;valor_unitario;fornecedor';

function normalizeHeader(value) {
  return value
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/** Separador pelo cabeçalho: `;` quando houver, senão tabulação, senão `,`. */
function detectDelimiter(headerLine) {
  if (headerLine.includes(';')) return ';';
  if (headerLine.includes('\t')) return '\t';
  return ',';
}

/**
 * Linhas do CSV (RFC 4180: aspas duplas, aspas escapadas por repetição,
 * quebra de linha dentro de aspas). Devolve `[{ line, cells }]`, com o número
 * da linha no arquivo, sem as linhas em branco.
 */
function parseCsvRows(text, delimiter) {
  const rows = [];
  let cells = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let startLine = 1;
  const push = () => {
    cells.push(cell);
    cell = '';
  };
  const end = () => {
    push();
    if (cells.some((c) => c.trim() !== '')) rows.push({ line: startLine, cells });
    cells = [];
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        if (ch === '\n') line += 1;
        cell += ch;
      }
    } else if (ch === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
    } else if (ch === delimiter) {
      push();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      end();
      line += 1;
      startLine = line;
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || cells.length) end();
  return rows;
}

/** "1.250,50" | "1250,5" | "1250.50" | "R$ 10.000" → centavos; null se inválido. */
function parseMoneyBr(value) {
  let raw = String(value ?? '').replace(/R\$/gi, '').replace(/[\s ]/g, '');
  if (!raw) return null;
  if (raw.includes(',')) raw = raw.replace(/\./g, '').replace(',', '.');
  else if (!/^\d+\.\d{1,2}$/.test(raw)) raw = raw.replace(/\./g, '');
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents <= MAX_BUDGET_CENTS ? cents : null;
}

/** "2,5" → "2.5"; "1.000" (milhar) → "1000"; "1.000,5" → "1000.5". */
function normalizeQuantity(value) {
  const raw = String(value ?? '').replace(/[\s ]/g, '');
  if (raw.includes(',')) return raw.replace(/\./g, '').replace(',', '.');
  if (/^\d{1,3}(\.\d{3})+$/.test(raw)) return raw.replace(/\./g, '');
  return raw;
}

function parseYesNo(value) {
  const v = normalizeHeader(String(value ?? ''));
  if (!v) return { ok: true, value: false };
  if (['sim', 's', 'x', 'true', '1', 'yes'].includes(v)) return { ok: true, value: true };
  if (['nao', 'n', 'false', '0', 'no'].includes(v)) return { ok: true, value: false };
  return { ok: false };
}

/**
 * Lê a planilha. `existingCount`: itens que ficam na demanda (0 ao
 * substituir), para o teto de MAX_ITEMS itens por demanda.
 * Devolve `{ items, errors, rowErrors }`: `errors` são do arquivo (campo →
 * mensagem) e `rowErrors`, `[{ line, fields }]` com as colunas do CSV.
 */
function parseBudgetCsv(input, { existingCount = 0 } = {}) {
  const errors = {};
  const rowErrors = [];
  if (typeof input !== 'string' || input.trim() === '') {
    return { items: [], errors: { file: 'Envie a planilha em CSV (a primeira linha é o cabeçalho)' }, rowErrors };
  }
  if (Buffer.byteLength(input, 'utf8') > MAX_IMPORT_BYTES) {
    return { items: [], errors: { file: 'Planilha acima de 512 KB' }, rowErrors };
  }
  const text = input.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0];
  const delimiter = detectDelimiter(firstLine);
  const rows = parseCsvRows(text, delimiter);
  const [header, ...data] = rows;

  const columns = header.cells.map((name) => {
    const key = normalizeHeader(name);
    return Object.prototype.hasOwnProperty.call(HEADER_ALIASES, key) ? HEADER_ALIASES[key] : undefined;
  });
  const unknown = header.cells.filter((_, i) => columns[i] === undefined).map((c) => c.trim()).filter(Boolean);
  const missing = REQUIRED_COLUMNS.filter((c) => !columns.includes(c));
  if (missing.length) {
    errors.header = `Cabeçalho sem as colunas obrigatórias: ${missing.map((c) => COLUMN_LABELS[c]).join(', ')}. `
      + `Use o modelo: ${TEMPLATE_HEADER}`;
    return { items: [], errors, rowErrors };
  }
  if (unknown.length) {
    errors.header = `Colunas fora do modelo: ${unknown.join(', ')}. Use o modelo: ${TEMPLATE_HEADER}`;
    return { items: [], errors, rowErrors };
  }
  if (!data.length) return { items: [], errors: { file: 'A planilha não tem itens abaixo do cabeçalho' }, rowErrors };
  if (existingCount + data.length > MAX_ITEMS) {
    errors.file = `No máximo ${MAX_ITEMS} itens por demanda: a planilha tem ${data.length} linhas`
      + (existingCount ? ` e a demanda já tem ${existingCount} itens` : '');
    return { items: [], errors, rowErrors };
  }

  const items = [];
  for (const row of data) {
    const raw = {};
    columns.forEach((field, i) => {
      if (field) raw[field] = (row.cells[i] ?? '').trim();
    });
    const fields = {};
    const unitPriceCents = parseMoneyBr(raw.unitPrice);
    if (unitPriceCents === null) fields.valor_unitario = 'Valor unitário inválido (ex.: 1.250,50)';
    const audiovisual = parseYesNo(raw.isAudiovisualRecord);
    if (!audiovisual.ok) fields.registro_audiovisual = 'Use sim ou não';
    const candidate = {
      item: raw.item || null,
      description: raw.description || null,
      supplierReference: raw.supplierReference || null,
      quantity: normalizeQuantity(raw.quantity),
      unit: raw.unit || null,
      unitPriceCents: unitPriceCents ?? 0,
      isAudiovisualRecord: audiovisual.ok ? audiovisual.value : false,
    };
    const { value, errors: itemErrors } = validateDemand({ budgetItems: [candidate] });
    for (const [key, message] of Object.entries(itemErrors)) {
      const field = key.replace(/^budgetItems\[0\]\./, '');
      if (field === 'unitPriceCents' && fields.valor_unitario) continue;
      fields[COLUMN_LABELS[field === 'unitPriceCents' ? 'unitPrice' : field] ?? field] = message;
    }
    if (Object.keys(fields).length) rowErrors.push({ line: row.line, fields });
    else items.push({ ...value.budgetItems[0], scheduleItemId: null });
  }
  if (rowErrors.length) {
    errors.rows = `${rowErrors.length} linha${rowErrors.length > 1 ? 's' : ''} com erro: nada foi importado`;
  }
  return { items: rowErrors.length ? [] : items, errors, rowErrors };
}

module.exports = {
  parseBudgetCsv,
  parseCsvRows,
  parseMoneyBr,
  normalizeQuantity,
  IMPORT_MODES,
  MAX_IMPORT_BYTES,
  TEMPLATE_HEADER,
};
