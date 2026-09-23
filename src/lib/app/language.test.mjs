import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(import.meta.dirname, "../../..");

const productFiles = [
  "src/app/layout.tsx",
  "src/components/Footer.tsx",
  "src/components/Hero.tsx",
  "src/components/ImpactGallery.tsx",
  "src/components/Community.tsx",
  "src/components/CTABanner.tsx",
  "src/components/Stakeholders.tsx",
  "src/components/Steps.tsx",
  "src/components/app/AppShell.tsx",
  "src/components/app/AuthShowcase.tsx",
  "src/components/app/LocationPicker.tsx",
  "src/components/app/map/SmartMapClient.tsx",
  "src/components/app/map/SmartMapView.tsx",
  "src/components/app/map/MapLegend.tsx",
  "src/components/app/ProfileView.tsx",
  "src/components/app/PostCard.tsx",
  "src/components/app/public/PublicPostCard.tsx",
  "src/components/app/public/PostDetailClient.tsx",
  "src/components/app/signal/SignalCardLayout.tsx",
  "src/components/app/SearchButton.tsx",
  "src/app/(app)/admin/page.tsx",
  "src/app/(app)/conexoes/page.tsx",
  "src/app/(app)/conexoes/nova/page.tsx",
  "src/app/(app)/criar/page.tsx",
  "src/app/(app)/feed/page.tsx",
  "src/app/(app)/mapa/page.tsx",
  "src/app/(app)/mapa/[territorio]/page.tsx",
  "src/app/(app)/meus-apoios/page.tsx",
  "src/app/(app)/post/[id]/apoiar/page.tsx",
  "src/app/(app)/post/[id]/page.tsx",
  "src/app/(app)/ranking/page.tsx",
];

const forbiddenProductLanguage = [
  /rede\s+social/i,
  /redes\s+sociais/i,
  /facebook/i,
  /orkut/i,
  /\bamigos\s*\(/i,
  /\brecados?\s*\(/i,
  /deixe um recado/i,
  /mural/i,
  /\bcurtidas?\b/i,
  /\bcurtir\b/i,
];

test("a interface usa linguagem de plataforma territorial", () => {
  const findings = [];

  for (const relativePath of productFiles) {
    const filePath = path.join(root, relativePath);
    const source = fs.readFileSync(filePath, "utf8");
    for (const pattern of forbiddenProductLanguage) {
      if (pattern.test(source)) findings.push(`${relativePath}: ${pattern}`);
    }
  }

  assert.deepEqual(findings, []);
});

test("a navegação usa o vocabulário territorial do produto", () => {
  const source = fs.readFileSync(path.join(root, "src/components/app/AppShell.tsx"), "utf8");

  for (const label of ["O pulso", "Território", "Conexões", "Meu sinal", "Impacto"]) {
    assert.match(source, new RegExp(`label: "${label}"`));
  }
});

// Card de sinal ("Sinal do bairro", design/identidade-visual-sinal-do-bairro.md):
// a reação continua existindo (slide 22 da Apresentação exige engajamento),
// mas o card não volta ao molde de rede social.
const signalCardFiles = [
  "src/components/app/PostCard.tsx",
  "src/components/app/public/PublicPostCard.tsx",
  "src/components/app/signal/SignalCardLayout.tsx",
];
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("o card de sinal não usa hashtag, contador de visualizações nem ícone de reação", () => {
  const findings = [];
  for (const relativePath of [...signalCardFiles, "src/components/app/public/PostDetailClient.tsx"]) {
    const source = read(relativePath);
    // hashtag: `#${tag}` em template ou `#{tag}` em JSX
    if (/#\$\{/.test(source)) findings.push(`${relativePath}: #\${`);
    if (/>\s*#\{/.test(source)) findings.push(`${relativePath}: #{ em JSX`);
    // coração, curtida ou polegar como ícone
    if (/name=\{?["'`][^"'`]*(heart|like|thumb)/i.test(source)) findings.push(`${relativePath}: ícone de reação`);
    if (/\b(Heart|ThumbsUp|ThumbUp|Like)Icon\b/.test(source)) findings.push(`${relativePath}: componente de ícone de reação`);
  }
  for (const relativePath of signalCardFiles) {
    const source = read(relativePath);
    if (/viewsCount|visualiza/i.test(source)) findings.push(`${relativePath}: contador de visualizações`);
    // balão de conversa como contador de comentários
    if (/name=["']comment["']/.test(source)) findings.push(`${relativePath}: balão de comentário`);
  }
  assert.deepEqual(findings, []);
});

test("o Icon do app não oferece coração, curtida nem polegar", () => {
  const source = read("src/components/app/Icon.tsx");
  assert.doesNotMatch(source, /^\s*["']?(heart|like|thumb\w*)["']?\s*:/im);
});

test("o card de sinal organiza a leitura pelo próximo passo e deixa a reação discreta", () => {
  const layout = read("src/components/app/signal/SignalCardLayout.tsx");
  const card = read("src/components/app/PostCard.tsx");
  assert.match(layout, /Próximo passo/);
  assert.match(layout, /territoryLabel\(post\)/);
  assert.match(layout, /themeLabels\(post\.tags\)/);
  // a reação é um controle secundário, com estado acessível, no rodapé
  assert.match(card, /aria-pressed=\{marked\}/);
  assert.match(card, /nextStepFor\(post,/);
  assert.doesNotMatch(card, /sinais de apoio/);
});
