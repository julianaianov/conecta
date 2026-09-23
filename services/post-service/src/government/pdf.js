// PDF dos indicadores do órgão (T22): o mesmo conteúdo do painel e do CSV,
// num relatório imprimível que o órgão leva para fora da plataforma.
//
// pdfkit com as fontes do manual de marca (as mesmas do dossiê da T10). Nada
// de dado pessoal: só números agregados, rótulos e o nome do próprio órgão.
//
// `renderIndicatorsPdf({ report, priority, impact })` → Promise<Buffer>.

const path = require('node:path');
const PDFDocument = require('pdfkit');
const { CATEGORY_LABELS, THEME_LABELS } = require('../demand/constants');
const { INDICATORS } = require('./constants');
const { DM_MARK_PATH, DM_MARK_VIEWBOX } = require('../dossier/brand');

const FONTS_DIR = path.join(__dirname, '../../assets/fonts');
const FONT = {
  regular: path.join(FONTS_DIR, 'DMSans-Regular.ttf'),
  bold: path.join(FONTS_DIR, 'DMSans-Bold.ttf'),
};

const COLOR = {
  petroleo: '#1B4F72',
  petroleoDeep: '#0D2D42',
  azulPalido: '#D6EAF8',
  laranja: '#F4841A',
  grafite: '#343A40',
  cinza: '#868E96',
  branco: '#FFFFFF',
};

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = { left: 48, right: 48, top: 104, bottom: 64 };
const WIDTH = PAGE.width - MARGIN.left - MARGIN.right;

const number = (value) => Number(value ?? 0).toLocaleString('pt-BR');

function formatDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso ?? '');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((p) => [p.type, p.value]));
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute} (horário de Brasília)`;
}

function drawMonogram(doc, x, y, height, color) {
  const [, , vbWidth, vbHeight] = DM_MARK_VIEWBOX.split(' ').map(Number);
  const scale = height / vbHeight;
  doc.save();
  doc.translate(x, y).scale(scale);
  doc.translate(-0.07717, 180.803284).scale(0.1, -0.1);
  doc.path(DM_MARK_PATH).fill(color);
  doc.restore();
  return vbWidth * scale;
}

function header(doc, report) {
  doc.save();
  doc.rect(0, 0, PAGE.width, 72).fill(COLOR.petroleoDeep);
  doc.rect(0, 72, PAGE.width, 3).fill(COLOR.laranja);
  const markWidth = drawMonogram(doc, MARGIN.left, 20, 32, COLOR.branco);
  doc.font('bold').fontSize(18).fillColor(COLOR.branco)
    .text('Conecta', MARGIN.left + markWidth + 8, 27, { lineBreak: false });
  doc.font('bold').fontSize(9).fillColor(COLOR.branco)
    .text('Indicadores do Poder Público', MARGIN.left, 22, { width: WIDTH, align: 'right' });
  doc.font('regular').fontSize(8.5).fillColor(COLOR.azulPalido)
    .text(report.organization?.name ?? '', MARGIN.left, 36, { width: WIDTH, align: 'right' });
  doc.restore();
}

function footer(doc, page) {
  const bottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  doc.save();
  const y = PAGE.height - 44;
  doc.moveTo(MARGIN.left, y).lineTo(PAGE.width - MARGIN.right, y).lineWidth(0.5).strokeColor(COLOR.azulPalido).stroke();
  doc.font('regular').fontSize(6.6).fillColor(COLOR.cinza)
    .text('DM Conecta · indicadores calculados a partir das demandas publicadas; sem dados pessoais.',
      MARGIN.left, y + 6, { width: WIDTH - 50, lineBreak: false });
  doc.fontSize(7).text(`Página ${page}`, MARGIN.left, y + 6, { width: WIDTH, align: 'right', lineBreak: false });
  doc.restore();
  doc.page.margins.bottom = bottom;
}

function ensureSpace(doc, needed) {
  if (doc.y + needed > PAGE.height - MARGIN.bottom) doc.addPage();
}

function sectionTitle(doc, title) {
  ensureSpace(doc, 80);
  doc.moveDown(0.7);
  const y = doc.y;
  doc.rect(MARGIN.left, y + 2, 4, 14).fill(COLOR.laranja);
  doc.font('bold').fontSize(13).fillColor(COLOR.petroleo).text(title, MARGIN.left + 12, y, { width: WIDTH - 12 });
  doc.moveDown(0.4);
}

/** Tabela simples com cabeçalho; `widths` em pontos, somando `WIDTH`. */
function table(doc, headings, rows, widths) {
  ensureSpace(doc, 44);
  let y = doc.y;
  doc.save();
  doc.rect(MARGIN.left, y, WIDTH, 18).fill(COLOR.azulPalido);
  doc.font('bold').fontSize(8.5).fillColor(COLOR.petroleo);
  let x = MARGIN.left + 6;
  headings.forEach((heading, i) => {
    doc.text(String(heading), x, y + 5, { width: widths[i] - 8, lineBreak: false, align: i === 0 ? 'left' : 'right' });
    x += widths[i];
  });
  doc.restore();
  y += 18;
  doc.font('regular').fontSize(8.5).fillColor(COLOR.grafite);
  for (const row of rows) {
    if (y + 16 > PAGE.height - MARGIN.bottom) {
      doc.addPage();
      y = doc.y;
    }
    x = MARGIN.left + 6;
    row.forEach((cell, i) => {
      doc.text(String(cell ?? ''), x, y + 4, { width: widths[i] - 8, lineBreak: false, align: i === 0 ? 'left' : 'right' });
      x += widths[i];
    });
    doc.moveTo(MARGIN.left, y + 16).lineTo(PAGE.width - MARGIN.right, y + 16)
      .lineWidth(0.4).strokeColor(COLOR.azulPalido).stroke();
    y += 16;
  }
  doc.y = y + 6;
}

/** Gera o relatório. `priority` e `impact` são opcionais. */
function renderIndicatorsPdf({ report, priority = null, impact = null }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [PAGE.width, PAGE.height], margins: MARGIN, autoFirstPage: false });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      doc.registerFont('regular', FONT.regular);
      doc.registerFont('bold', FONT.bold);
      let page = 0;
      doc.on('pageAdded', () => {
        page += 1;
        header(doc, report);
        footer(doc, page);
        doc.x = MARGIN.left;
        doc.y = MARGIN.top;
      });
      doc.addPage();

      doc.font('bold').fontSize(16).fillColor(COLOR.petroleo)
        .text('Indicadores e resultados do território', { width: WIDTH });
      doc.moveDown(0.3);
      doc.font('regular').fontSize(9).fillColor(COLOR.grafite).text(
        [
          `Órgão: ${report.organization?.name ?? '—'}${report.organization?.department ? ` — ${report.organization.department}` : ''}`,
          `Recorte: ${report.scopeLabel ?? '—'}`,
          `Período: ${report.period?.label ?? '—'}`,
          `Gerado em: ${formatDateTime(report.generatedAt)}`,
        ].join('\n'),
        { width: WIDTH },
      );

      sectionTitle(doc, 'Os 10 indicadores');
      table(
        doc,
        ['Indicador', 'Valor'],
        INDICATORS.filter((i) => i.kind === 'contagem')
          .map((i) => [i.label, number(report.indicators?.[i.id])]),
        [WIDTH - 110, 110],
      );

      sectionTitle(doc, 'Demandas por território');
      table(
        doc,
        ['Território', 'Total', 'Urgentes', 'Concluídas'],
        (report.byTerritory ?? []).map((t) => [t.label, number(t.total), number(t.urgent), number(t.concluded)]),
        [WIDTH - 210, 70, 70, 70],
      );

      sectionTitle(doc, 'Demandas por categoria');
      table(
        doc,
        ['Categoria', 'Total', 'Urgentes', 'Concluídas'],
        (report.byCategory ?? []).map((c) => [
          CATEGORY_LABELS[c.category] ?? c.category, number(c.total), number(c.urgent), number(c.concluded),
        ]),
        [WIDTH - 210, 70, 70, 70],
      );

      if (priority) {
        sectionTitle(doc, 'Priorização de áreas');
        doc.font('regular').fontSize(8.5).fillColor(COLOR.cinza).text(
          'Ordem sugerida de trabalho do próprio órgão, por urgência, volume e tempo sem resposta institucional. '
          + 'Não é comparação entre órgãos.', { width: WIDTH },
        );
        doc.moveDown(0.3);
        table(
          doc,
          ['Área', 'Demandas', 'Urgentes', 'Sem resposta', 'Maior espera'],
          (priority.territories ?? []).map((a) => [
            a.label, number(a.total), number(a.urgent), number(a.withoutResponse), `${number(a.oldestWaitDays)} d`,
          ]),
          [WIDTH - 260, 65, 65, 75, 55],
        );
        if ((priority.themes ?? []).length) {
          sectionTitle(doc, 'Priorização por eixo temático');
          table(
            doc,
            ['Eixo', 'Demandas', 'Urgentes', 'Sem resposta', 'Maior espera'],
            priority.themes.map((a) => [
              THEME_LABELS[a.label] ?? a.label, number(a.total), number(a.urgent),
              number(a.withoutResponse), `${number(a.oldestWaitDays)} d`,
            ]),
            [WIDTH - 260, 65, 65, 75, 55],
          );
        }
      }

      if (impact) {
        sectionTitle(doc, 'Medição de impacto');
        table(
          doc,
          ['Medida', 'Valor'],
          [
            ['Demandas com atuação do órgão', number(impact.demandsActedOn)],
            ['Demandas concluídas', number(impact.concluded)],
            ['Prestações de contas concluídas', number(impact.accountabilityConcluded)],
            ['Beneficiários alcançados', number(impact.beneficiariesReached)],
            ['Resultados registrados', number(impact.resultsRecorded)],
            ['Metas atingidas', number(impact.goalsAchieved)],
            ['Apoios viabilizados pelo órgão', number(impact.offers)],
            ['Apoios registrados nas demandas', number(impact.supports)],
            ['Ações divulgadas', number(impact.actions)],
            ['Respostas institucionais', number(impact.responses)],
            ['Encaminhamentos enviados', number(impact.forwardings)],
          ],
          [WIDTH - 110, 110],
        );
      }

      sectionTitle(doc, 'Como cada indicador é obtido');
      doc.font('regular').fontSize(8.5).fillColor(COLOR.grafite);
      for (const indicator of INDICATORS) {
        ensureSpace(doc, 24);
        doc.font('bold').text(`${indicator.label}: `, { continued: true });
        doc.font('regular').text(report.sources?.[indicator.id] ?? '', { width: WIDTH });
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { renderIndicatorsPdf };
