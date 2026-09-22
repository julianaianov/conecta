// PDF do Documento Oficial da Demanda — Dossiê da Demanda (T10).
//
// pdfkit (JavaScript puro, sem dependência nativa) com as fontes do manual de
// marca embutidas em assets/fonts (DM Sans para texto, Inter para valores;
// licença OFL ao lado dos arquivos), o que garante a acentuação em qualquer
// leitor. Cores e monograma: docs/manual-marca.md e src/lib/app/brand.ts.
//
// `renderDossierPdf(content, { verifyUrl, contentSha256, photo })` → Buffer.
// O conteúdo vem pronto de content.js; aqui só há diagramação.

const path = require('node:path');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const {
  CATEGORY_LABELS, STATUS_LABELS, PRIORITY_LABELS, RESOURCE_TYPE_LABELS,
  DOCUMENT_TYPE_LABELS, TRIGGER_LABELS, DOCUMENT_TITLE,
} = require('./content');
const { DM_MARK_PATH, DM_MARK_VIEWBOX } = require('./brand');

const FONTS_DIR = path.join(__dirname, '../../assets/fonts');
const FONT = {
  regular: path.join(FONTS_DIR, 'DMSans-Regular.ttf'),
  bold: path.join(FONTS_DIR, 'DMSans-Bold.ttf'),
  numeric: path.join(FONTS_DIR, 'Inter-Regular.otf'),
};

// Paleta oficial (docs/manual-marca.md §3).
const COLOR = {
  petroleo: '#1B4F72',
  petroleoDeep: '#0D2D42',
  azulMedio: '#2E7BA8',
  azulPalido: '#D6EAF8',
  laranja: '#F4841A',
  grafite: '#343A40',
  cinza: '#868E96',
  linha: '#D6EAF8',
  branco: '#FFFFFF',
};

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = { left: 48, right: 48, top: 104, bottom: 64 };
const CONTENT_WIDTH = PAGE.width - MARGIN.left - MARGIN.right;

// ── Formatação ──────────────────────────────────────────────────────────────

function formatCents(cents) {
  if (cents === null || cents === undefined) return '—';
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const reais = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}R$ ${reais},${String(abs % 100).padStart(2, '0')}`;
}

function formatDate(iso) {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((p) => [p.type, p.value]));
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute} (horário de Brasília)`;
}

function formatQuantity(q) {
  const n = Number(q);
  if (!Number.isFinite(n)) return String(q ?? '');
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
}

function formatCnpj(value) {
  const c = String(value ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  if (c.length !== 14) return value ?? '—';
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}

function formatCnae(value) {
  const c = String(value ?? '').replace(/[.\-/\s]/g, '');
  if (c.length !== 7) return value ?? '—';
  return `${c.slice(0, 4)}-${c.slice(4, 5)}/${c.slice(5)}`;
}

function formatCep(value) {
  const c = String(value ?? '').replace(/\D/g, '');
  return c.length === 8 ? `${c.slice(0, 5)}-${c.slice(5)}` : value ?? '—';
}

const MILESTONE_SHORT = { antes: 'Antes', acompanhamento: 'Acompanhamento', depois: 'Depois' };

const orDash = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));

// ── Desenho ─────────────────────────────────────────────────────────────────

function drawMonogram(doc, x, y, height, color) {
  const [, , vbWidth, vbHeight] = DM_MARK_VIEWBOX.split(' ').map(Number);
  const scale = height / vbHeight;
  doc.save();
  doc.translate(x, y).scale(scale);
  // Mesmo transform do SVG oficial: translate(-0.077170 180.803284) scale(0.1 -0.1).
  doc.translate(-0.07717, 180.803284).scale(0.1, -0.1);
  doc.path(DM_MARK_PATH).fill(color);
  doc.restore();
  return (vbWidth * scale);
}

function drawQr(doc, text, x, y, size) {
  const modules = QRCode.create(text, { errorCorrectionLevel: 'M' }).modules;
  const quiet = 2;
  const cell = size / (modules.size + quiet * 2);
  doc.save();
  doc.rect(x, y, size, size).fill(COLOR.branco);
  doc.fillColor(COLOR.petroleoDeep);
  for (let r = 0; r < modules.size; r += 1) {
    for (let c = 0; c < modules.size; c += 1) {
      if (modules.get(r, c)) doc.rect(x + (c + quiet) * cell, y + (r + quiet) * cell, cell + 0.1, cell + 0.1);
    }
  }
  doc.fill();
  doc.restore();
}

function header(doc, content) {
  doc.save();
  doc.rect(0, 0, PAGE.width, 72).fill(COLOR.petroleoDeep);
  doc.rect(0, 72, PAGE.width, 3).fill(COLOR.laranja);
  const markWidth = drawMonogram(doc, MARGIN.left, 20, 32, COLOR.branco);
  doc.font('bold').fontSize(18).fillColor(COLOR.branco)
    .text('Conecta', MARGIN.left + markWidth + 8, 27, { lineBreak: false });
  doc.font('bold').fontSize(9).fillColor(COLOR.branco)
    .text('Documento Oficial da Demanda', MARGIN.left, 22, { width: CONTENT_WIDTH, align: 'right' });
  doc.font('regular').fontSize(8.5).fillColor(COLOR.azulPalido)
    .text(`Dossiê ${content.number} · versão ${content.version}${content.variant === 'publica' ? ' · versão pública' : ''}`,
      MARGIN.left, 36, { width: CONTENT_WIDTH, align: 'right' });
  doc.restore();
}

function footer(doc, content, contentSha256, page, total) {
  // Texto abaixo da margem inferior: sem zerar a margem, o pdfkit abriria página nova.
  const bottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  doc.save();
  const y = PAGE.height - 44;
  doc.moveTo(MARGIN.left, y).lineTo(PAGE.width - MARGIN.right, y).lineWidth(0.5).strokeColor(COLOR.linha).stroke();
  doc.font('regular').fontSize(6.3).fillColor(COLOR.cinza)
    .text(`DM Conecta · ${content.number} v${content.version} · SHA-256 do conteúdo: ${contentSha256}`,
      MARGIN.left, y + 6, { width: CONTENT_WIDTH - 50, lineBreak: false });
  doc.fontSize(7).text(`Página ${page} de ${total}`, MARGIN.left, y + 6, { width: CONTENT_WIDTH, align: 'right', lineBreak: false });
  doc.restore();
  doc.page.margins.bottom = bottom;
}

/** Garante `needed` pontos livres na página; senão, quebra. */
function ensureSpace(doc, needed) {
  if (doc.y + needed > PAGE.height - MARGIN.bottom) doc.addPage();
}

function sectionTitle(doc, number, title) {
  ensureSpace(doc, 90);
  doc.moveDown(0.8);
  const y = doc.y;
  doc.rect(MARGIN.left, y + 2, 4, 14).fill(COLOR.laranja);
  doc.font('bold').fontSize(13).fillColor(COLOR.petroleo)
    .text(`${number}. ${title}`, MARGIN.left + 12, y, { width: CONTENT_WIDTH - 12 });
  doc.moveDown(0.4);
}

function subTitle(doc, title) {
  ensureSpace(doc, 75);
  doc.moveDown(0.3);
  doc.font('bold').fontSize(10).fillColor(COLOR.azulMedio).text(title, MARGIN.left, doc.y, { width: CONTENT_WIDTH });
  doc.moveDown(0.2);
}

/** Par rótulo/valor em duas colunas (rótulo 150 pt). */
function field(doc, label, value, { numeric = false } = {}) {
  const labelWidth = 150;
  const valueWidth = CONTENT_WIDTH - labelWidth;
  const val = orDash(value);
  doc.font(numeric ? 'numeric' : 'regular').fontSize(9.5);
  const valueH = doc.heightOfString(val, { width: valueWidth });
  doc.font('bold').fontSize(8.5);
  const h = Math.max(valueH, doc.heightOfString(label, { width: labelWidth - 8 }) + 1, 12);
  ensureSpace(doc, h + 4);
  const y = doc.y;
  doc.font('bold').fontSize(8.5).fillColor(COLOR.cinza).text(label, MARGIN.left, y + 1, { width: labelWidth - 8 });
  doc.font(numeric ? 'numeric' : 'regular').fontSize(9.5).fillColor(COLOR.grafite)
    .text(val, MARGIN.left + labelWidth, y, { width: valueWidth });
  doc.y = Math.max(doc.y, y + h) + 3;
  doc.x = MARGIN.left;
}

function paragraph(doc, value) {
  const val = orDash(value);
  doc.font('regular').fontSize(9.5).fillColor(COLOR.grafite);
  ensureSpace(doc, Math.min(doc.heightOfString(val, { width: CONTENT_WIDTH }), 120) + 4);
  doc.text(val, MARGIN.left, doc.y, { width: CONTENT_WIDTH, align: 'left' });
  doc.moveDown(0.3);
}

function labeledParagraph(doc, label, value) {
  ensureSpace(doc, 34);
  doc.font('bold').fontSize(8.5).fillColor(COLOR.cinza).text(label, MARGIN.left, doc.y, { width: CONTENT_WIDTH });
  paragraph(doc, value);
}

function bulletList(doc, items) {
  if (!items.length) {
    paragraph(doc, 'Nenhum item informado.');
    return;
  }
  for (const item of items) {
    doc.font('regular').fontSize(9.5);
    const h = doc.heightOfString(item, { width: CONTENT_WIDTH - 14 });
    ensureSpace(doc, h + 3);
    const y = doc.y;
    doc.circle(MARGIN.left + 3, y + 5.5, 1.8).fill(COLOR.laranja);
    doc.fillColor(COLOR.grafite).text(item, MARGIN.left + 14, y, { width: CONTENT_WIDTH - 14 });
    doc.y += 2;
  }
  doc.x = MARGIN.left;
}

/**
 * Tabela simples. `columns`: [{ header, width (fração), align, numeric }].
 * Cabeçalho repetido quando a tabela passa de página.
 */
function table(doc, columns, rows) {
  const widths = columns.map((c) => c.width * CONTENT_WIDTH);
  const pad = 4;
  const drawHeader = () => {
    ensureSpace(doc, 40);
    const y = doc.y;
    doc.font('bold').fontSize(8);
    const h = Math.max(...columns.map((c, i) => doc.heightOfString(c.header, { width: widths[i] - pad * 2 }))) + pad * 2;
    doc.rect(MARGIN.left, y, CONTENT_WIDTH, h).fill(COLOR.petroleo);
    let x = MARGIN.left;
    columns.forEach((c, i) => {
      doc.fillColor(COLOR.branco).text(c.header, x + pad, y + pad, { width: widths[i] - pad * 2, align: c.align ?? 'left' });
      x += widths[i];
    });
    doc.y = y + h;
  };
  drawHeader();
  rows.forEach((row, index) => {
    const heights = row.map((cell, i) => {
      doc.font(columns[i].numeric ? 'numeric' : 'regular').fontSize(8.5);
      return doc.heightOfString(orDash(cell), { width: widths[i] - pad * 2 });
    });
    const h = Math.max(...heights, 10) + pad * 2;
    if (doc.y + h > PAGE.height - MARGIN.bottom) {
      doc.addPage();
      drawHeader();
    }
    const y = doc.y;
    if (index % 2 === 1) doc.rect(MARGIN.left, y, CONTENT_WIDTH, h).fill('#F3F8FC');
    let x = MARGIN.left;
    row.forEach((cell, i) => {
      doc.font(columns[i].numeric ? 'numeric' : 'regular').fontSize(8.5).fillColor(COLOR.grafite)
        .text(orDash(cell), x + pad, y + pad, { width: widths[i] - pad * 2, align: columns[i].align ?? 'left' });
      x += widths[i];
    });
    doc.moveTo(MARGIN.left, y + h).lineTo(MARGIN.left + CONTENT_WIDTH, y + h).lineWidth(0.4).strokeColor(COLOR.linha).stroke();
    doc.y = y + h;
  });
  doc.x = MARGIN.left;
  doc.moveDown(0.4);
}

// ── Documento ───────────────────────────────────────────────────────────────

function coverBlock(doc, content, { verifyUrl, contentSha256 }) {
  const { demand } = content;
  doc.font('bold').fontSize(9).fillColor(COLOR.laranja)
    .text(DOCUMENT_TITLE.toUpperCase(), MARGIN.left, MARGIN.top, { width: CONTENT_WIDTH, characterSpacing: 0.4 });
  doc.moveDown(0.3);
  doc.font('bold').fontSize(20).fillColor(COLOR.petroleoDeep)
    .text(orDash(demand.title), { width: CONTENT_WIDTH });
  doc.moveDown(0.2);
  doc.font('regular').fontSize(10).fillColor(COLOR.azulMedio)
    .text(`${CATEGORY_LABELS[demand.category] ?? orDash(demand.category)} · Status: ${STATUS_LABELS[demand.status] ?? orDash(demand.status)}`,
      { width: CONTENT_WIDTH });
  doc.moveDown(0.8);

  // Quadro de identificação do documento com o QR de verificação.
  const boxY = doc.y;
  const qrSize = 96;
  const boxH = 128;
  doc.roundedRect(MARGIN.left, boxY, CONTENT_WIDTH, boxH, 6).fill('#F3F8FC');
  doc.roundedRect(MARGIN.left, boxY, CONTENT_WIDTH, boxH, 6).lineWidth(0.6).strokeColor(COLOR.azulPalido).stroke();
  drawQr(doc, verifyUrl, MARGIN.left + CONTENT_WIDTH - qrSize - 12, boxY + 10, qrSize);
  doc.font('regular').fontSize(6.5).fillColor(COLOR.cinza)
    .text('Verifique a autenticidade', MARGIN.left + CONTENT_WIDTH - qrSize - 12, boxY + 10 + qrSize + 2,
      { width: qrSize, align: 'center' });

  const infoWidth = CONTENT_WIDTH - qrSize - 36;
  const rows = [
    ['Número do dossiê', content.number],
    ['Versão', `${content.version} · ${content.variant === 'publica' ? 'versão pública' : 'versão integral'}`],
    ['Gerado em', formatDateTime(content.issuedAt)],
    ['Motivo da geração', TRIGGER_LABELS[content.trigger] ?? content.trigger],
    ['Enviada para análise em', formatDateTime(demand.submittedAt)],
    ...(demand.publishedAt ? [['Publicada em', formatDateTime(demand.publishedAt)]] : []),
  ];
  let y = boxY + 10;
  for (const [label, value] of rows) {
    doc.font('bold').fontSize(7.5).fillColor(COLOR.cinza).text(label, MARGIN.left + 12, y, { width: 110 });
    doc.font('regular').fontSize(8.5).fillColor(COLOR.grafite).text(value, MARGIN.left + 124, y - 0.5, { width: infoWidth - 112 });
    y += 14;
  }
  doc.font('bold').fontSize(7.5).fillColor(COLOR.cinza).text('SHA-256 do conteúdo', MARGIN.left + 12, y + 2, { width: 110 });
  // Em duas linhas de 32 caracteres, sem quebra no meio de um grupo.
  doc.font('numeric').fontSize(7.5).fillColor(COLOR.petroleoDeep)
    .text(`${contentSha256.slice(0, 32)}\n${contentSha256.slice(32)}`, MARGIN.left + 124, y + 2, { width: infoWidth - 112 });
  doc.y = boxY + boxH + 6;
  doc.x = MARGIN.left;
  doc.font('regular').fontSize(7.5).fillColor(COLOR.cinza)
    .text(`Verificação: ${verifyUrl}`, MARGIN.left, doc.y, { width: CONTENT_WIDTH, link: verifyUrl, underline: false });
}

function photoBlock(doc, content, photo) {
  if (!content.photo) return;
  if (photo?.bytes && photo.embedded) {
    const maxH = 210;
    ensureSpace(doc, maxH + 30);
    doc.moveDown(0.6);
    const y = doc.y;
    try {
      doc.image(photo.bytes, MARGIN.left, y, { fit: [CONTENT_WIDTH, maxH], align: 'center', valign: 'center' });
      doc.y = y + maxH + 4;
      doc.font('regular').fontSize(7.5).fillColor(COLOR.cinza)
        .text('Fotografia da situação, do local ou do projeto enviada pelo Agente de Transformação.',
          MARGIN.left, doc.y, { width: CONTENT_WIDTH, align: 'center' });
      return;
    } catch {
      doc.y = y;
    }
  }
  doc.moveDown(0.6);
  paragraph(doc, 'Fotografia registrada na plataforma (formato sem pré-visualização neste documento). '
    + 'A imagem fica disponível na página da demanda.');
}

function renderBody(doc, content) {
  const { agent, demand, location, budget, schedule, goals, resources, documents, deadlines } = content;
  const inst = agent.institution;
  const isPublic = content.variant === 'publica';
  let n = 0;

  sectionTitle(doc, ++n, 'Identificação do Agente de Transformação');
  if (inst) {
    field(doc, 'Instituição (razão social)', inst.legalName);
    if (inst.tradeName) field(doc, 'Nome fantasia', inst.tradeName);
    field(doc, 'CNPJ', formatCnpj(inst.cnpj), { numeric: true });
    field(doc, 'CNAE principal', inst.cnaePrimary
      ? `${formatCnae(inst.cnaePrimary)}${inst.cnaePrimaryDescription ? ` — ${inst.cnaePrimaryDescription}` : ''}` : null);
    if (inst.cnaeSecondary.length) {
      field(doc, 'CNAEs secundários', inst.cnaeSecondary
        .map((c) => `${formatCnae(c.code)}${c.description ? ` — ${c.description}` : ''}`).join('\n'));
    }
    field(doc, 'Município/UF', [inst.municipality, inst.uf].filter(Boolean).join('/') || null);
    if (inst.territory) field(doc, 'Território de atuação', inst.territory);
    field(doc, 'Situação do cadastro', inst.validationStatus === 'validada' ? 'Validado pela equipe da plataforma' : inst.validationStatus);
  } else {
    paragraph(doc, 'Cadastro institucional validado não localizado no momento da geração.');
  }
  field(doc, 'Conta que publicou', agent.authorName);

  sectionTitle(doc, ++n, 'Demanda');
  field(doc, 'Categoria da demanda', CATEGORY_LABELS[demand.category] ?? demand.category);
  field(doc, 'Nível de prioridade', PRIORITY_LABELS[demand.priority] ?? demand.priority);
  field(doc, 'Execução física', demand.hasPhysicalExecution ? 'Sim (exige registro do antes e do depois)' : 'Não');
  labeledParagraph(doc, 'Descrição', demand.description);
  labeledParagraph(doc, 'Justificativa', demand.justification);
  labeledParagraph(doc, 'Objetivos', demand.objective);

  sectionTitle(doc, ++n, 'Localização e território impactado');
  if (!isPublic) {
    const street = [location.street, location.addressNumber].filter(Boolean).join(', ');
    field(doc, 'Endereço', [street, location.addressComplement].filter(Boolean).join(' — ') || null);
    field(doc, 'CEP', formatCep(location.cep), { numeric: true });
  }
  field(doc, 'Bairro', location.district);
  field(doc, 'Município/UF', [location.municipality, location.uf].filter(Boolean).join('/') || null);
  field(doc, 'Território impactado', location.territory);
  if (!isPublic && location.latitude !== null) {
    field(doc, 'Coordenadas', `${location.latitude}, ${location.longitude}`, { numeric: true });
  }
  if (isPublic) {
    doc.font('regular').fontSize(7.5).fillColor(COLOR.cinza)
      .text('Versão pública: endereço completo, CEP e coordenadas ficam só na versão integral.', { width: CONTENT_WIDTH });
    doc.moveDown(0.3);
  }

  sectionTitle(doc, ++n, 'Público beneficiado');
  field(doc, 'Estimativa de beneficiários', demand.beneficiariesEstimate !== null
    ? `${demand.beneficiariesEstimate.toLocaleString('pt-BR')} pessoas` : null, { numeric: true });
  labeledParagraph(doc, 'Perfil do público', demand.beneficiariesProfile);

  sectionTitle(doc, ++n, 'Orçamento');
  subTitle(doc, 'Orçamento detalhado');
  table(doc, [
    { header: 'Item', width: 0.36 },
    { header: 'Etapa', width: 0.18 },
    { header: 'Qtd.', width: 0.08, align: 'right', numeric: true },
    { header: 'Unid.', width: 0.08 },
    { header: 'Valor unitário', width: 0.15, align: 'right', numeric: true },
    { header: 'Total', width: 0.15, align: 'right', numeric: true },
  ], budget.items.map((i) => [
    `${i.description}${i.isAudiovisualRecord ? '\n(registro fotográfico e audiovisual)' : ''}`,
    i.scheduleStage,
    formatQuantity(i.quantity),
    i.unit,
    formatCents(i.unitPriceCents),
    formatCents(i.totalCents),
  ]));

  subTitle(doc, 'Composição financeira');
  const c = budget.composition;
  table(doc, [
    { header: 'Parcela', width: 0.7 },
    { header: 'Valor', width: 0.3, align: 'right', numeric: true },
  ], [
    ['Orçamento original (execução)', formatCents(c.budgetAmountCents)],
    [`Agente de Transformação (+${(c.agentFeeBps ?? 400) / 100}% sobre o original)`, formatCents(c.agentFeeCents)],
    [`Plataforma DM Conecta (+${(c.platformFeeBps ?? 600) / 100}% sobre o original)`, formatCents(c.platformFeeCents)],
    ['Valor total da demanda', formatCents(c.totalAmountCents)],
  ]);
  doc.font('regular').fontSize(7.5).fillColor(COLOR.cinza)
    .text('Os percentuais são somados ao orçamento original, sem descontar do recurso de execução. '
      + 'A plataforma não processa pagamentos: a composição é informativa.', MARGIN.left, doc.y, { width: CONTENT_WIDTH });
  doc.moveDown(0.3);
  field(doc, 'Previsão de custos de fotografia e filmagem', formatCents(content.audiovisualCents), { numeric: true });

  sectionTitle(doc, ++n, 'Planejamento');
  subTitle(doc, 'Cronograma');
  const withResponsible = !isPublic;
  const cols = withResponsible
    ? [
      { header: 'Etapa', width: 0.16 }, { header: 'Atividades', width: 0.28 },
      { header: 'Início', width: 0.11, numeric: true }, { header: 'Término', width: 0.11, numeric: true },
      { header: 'Responsável', width: 0.15 }, { header: 'Registro foto/vídeo', width: 0.19 },
    ]
    : [
      { header: 'Etapa', width: 0.2 }, { header: 'Atividades', width: 0.37 },
      { header: 'Início', width: 0.12, numeric: true }, { header: 'Término', width: 0.12, numeric: true },
      { header: 'Registro foto/vídeo', width: 0.19 },
    ];
  table(doc, cols, schedule.map((s) => {
    const milestones = s.recordMilestones.map((m) => MILESTONE_SHORT[m] ?? m).join('\n');
    return withResponsible
      ? [s.stage, s.activities, formatDate(s.startsOn), formatDate(s.endsOn), s.responsible, milestones]
      : [s.stage, s.activities, formatDate(s.startsOn), formatDate(s.endsOn), milestones];
  }));
  subTitle(doc, 'Prazos');
  field(doc, 'Início previsto', formatDate(deadlines.startsOn), { numeric: true });
  field(doc, 'Término previsto', formatDate(deadlines.endsOn), { numeric: true });
  field(doc, 'Duração', deadlines.durationDays ? `${deadlines.durationDays} dias em ${deadlines.stages} etapa(s)` : null);

  subTitle(doc, 'Metas e indicadores');
  table(doc, [
    { header: 'Meta', width: 0.26 }, { header: 'Resultado esperado', width: 0.26 },
    { header: 'Indicador', width: 0.24 }, { header: 'Forma de mensuração', width: 0.24 },
  ], goals.map((g) => [g.goal, g.expectedResult, g.indicator, g.measurementMethod]));

  sectionTitle(doc, ++n, 'Recursos');
  subTitle(doc, 'Recursos necessários');
  bulletList(doc, resources.necessary.map((r) => `${RESOURCE_TYPE_LABELS[r.type] ?? r.type}${r.description ? ` — ${r.description}` : ''}`));
  subTitle(doc, 'Contrapartidas');
  bulletList(doc, resources.counterpart.map((r) => `${RESOURCE_TYPE_LABELS[r.type] ?? r.type}${r.description ? ` — ${r.description}` : ''}`));

  sectionTitle(doc, ++n, 'Documentação comprobatória');
  bulletList(doc, documents.map((d) => {
    const parts = [`${DOCUMENT_TYPE_LABELS[d.type] ?? d.type}: ${d.title}`];
    if (d.description) parts.push(d.description);
    if (d.source) parts.push(d.source === 'arquivo' ? 'arquivo enviado à plataforma' : 'link externo informado');
    return parts.join(' — ');
  }));
  if (isPublic) {
    doc.font('regular').fontSize(7.5).fillColor(COLOR.cinza)
      .text('Versão pública: os arquivos ficam com o Agente e com a equipe de análise.', MARGIN.left, doc.y, { width: CONTENT_WIDTH });
  }

  sectionTitle(doc, ++n, 'Autenticidade');
  paragraph(doc, 'Documento gerado automaticamente pela plataforma DM Conecta a partir das informações cadastradas '
    + 'pelo Agente de Transformação. Ele serve de base para análise, apresentação, conexão com parceiros, '
    + 'encaminhamento institucional, execução e acompanhamento da demanda. Cada versão é gravada sem alteração; '
    + 'o SHA-256 do conteúdo, impresso no rodapé de cada página, identifica esta versão na página de verificação.');
}

/**
 * Gera o PDF. `photo`: { bytes, contentType, embedded } (JPEG/PNG) ou null.
 * Resolve com o Buffer do arquivo.
 */
function renderDossierPdf(content, { verifyUrl, contentSha256, photo = null }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: MARGIN,
      bufferPages: true,
      autoFirstPage: false,
      info: {
        Title: `${DOCUMENT_TITLE} — ${content.number} v${content.version}`,
        Author: 'DM Conecta',
        Subject: content.demand.title ?? 'Dossiê da Demanda',
        Keywords: `dossiê, demanda, ${content.number}, sha256:${contentSha256}`,
        Creator: 'DM Conecta — post-service',
        Producer: 'DM Conecta',
        CreationDate: new Date(content.issuedAt),
        ModDate: new Date(content.issuedAt),
      },
      lang: 'pt-BR',
    });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      doc.registerFont('regular', FONT.regular);
      doc.registerFont('bold', FONT.bold);
      doc.registerFont('numeric', FONT.numeric);
      doc.on('pageAdded', () => {
        header(doc, content);
        doc.x = MARGIN.left;
        doc.y = MARGIN.top;
      });
      doc.addPage();
      coverBlock(doc, content, { verifyUrl, contentSha256 });
      photoBlock(doc, content, photo);
      renderBody(doc, content);
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i += 1) {
        doc.switchToPage(i);
        footer(doc, content, contentSha256, i + 1, range.count);
      }
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/** Imagens que o PDF embute (pdfkit lê JPEG e PNG). */
const EMBEDDABLE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png']);

module.exports = {
  renderDossierPdf,
  EMBEDDABLE_IMAGE_TYPES,
  formatCents,
  formatCnpj,
  formatCnae,
  formatDate,
  FONT,
};
