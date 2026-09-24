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
  // A Arquitetura de Perfis §3.2 lista "Curtir/apoiar": o cadastro mostra o texto da fonte
  // (ROLE_PERMISSION_LABELS em types.ts); nas telas do produto a ação é a marcação de apoio.
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

  for (const label of ["O pulso", "Território", "Conexões", "Meu sinal", "Impacto", "Agenda"]) {
    assert.match(source, new RegExp(`label: "${label}"`));
  }
});

test("Agenda e Impacto ficam a um toque da barra inferior no mobile", () => {
  const source = fs.readFileSync(path.join(root, "src/components/app/AppShell.tsx"), "utf8");

  // A barra inferior continua com os quatro rótulos próprios + o FAB.
  const bottomItems = source.match(/<BottomItem item=\{NAV\[\d\]\}/g) ?? [];
  assert.equal(bottomItems.length, 4);

  // O menu da conta (logado) e o do visitante levam à Agenda e ao Impacto.
  const menu = source.slice(source.indexOf('role="menu"'));
  const [logged, visitor] = menu.split(") : (");
  for (const block of [logged, visitor]) {
    assert.match(block, /label="Agenda" onClick=\{\(\) => go\("\/eventos"\)\}/);
    assert.match(block, /label="Impacto" onClick=\{\(\) => go\("\/ranking"\)\}/);
  }

  // Acessibilidade do menu: aria, papel de menu e fechamento com Esc.
  assert.match(source, /aria-haspopup="menu"/);
  assert.match(source, /aria-expanded=\{menuOpen\}/);
  assert.match(source, /role="menu"/);
  assert.match(source, /event\.key !== "Escape"/);
});

test("no desktop, um trilho lateral leva os rótulos do produto e o registro de sinal", () => {
  const source = fs.readFileSync(path.join(root, "src/components/app/AppShell.tsx"), "utf8");

  // O trilho existe só a partir de lg e é fixo à esquerda.
  const railStart = source.indexOf('aria-label="Trilho lateral"');
  assert.ok(railStart > 0, "trilho lateral ausente");
  const railEnd = source.indexOf("</aside>", railStart);
  const rail = source.slice(railStart, railEnd);
  assert.match(source.slice(source.lastIndexOf("<aside", railStart), railStart + 200), /fixed inset-y-0 left-0[^"]*hidden[^"]*lg:flex/);

  // Um único <nav> com rótulo no trilho, percorrendo NAV (os seis rótulos) e os atalhos por perfil.
  assert.equal((rail.match(/<nav /g) ?? []).length, 1);
  assert.match(rail, /<nav aria-label="Navegação principal"/);
  assert.match(rail, /NAV\.map\(/);
  assert.match(rail, /profileNav\.map\(/);
  assert.match(source, /isAgent \? \[AGENT_NAV\]/);
  assert.match(source, /isGovernment \? \[GOVERNMENT_NAV\]/);
  assert.match(source, /isAdmin \? \[ADMIN_NAV\]/);
  for (const label of ["Minhas demandas", "Atuação institucional", "Painel"]) {
    assert.match(source, new RegExp(`label: "${label}"`));
  }

  // Registrar sinal em destaque, conta e tema no pé do trilho.
  assert.match(rail, /href="\/criar"[\s\S]*Registrar sinal/);
  assert.match(rail, /accountMenu\("rail"\)/);
  assert.match(rail, /<ThemeToggle \/>/);

  // Item ativo anunciado ao leitor de tela.
  assert.match(source, /aria-current=\{active \? "page" : undefined\}/);

  // O conteúdo desloca pela largura do trilho e a barra inferior segue só no mobile.
  assert.match(source, /lg:pl-\[5\.5rem\] xl:pl-60/);
  assert.match(source, /<nav\s+aria-label="Navegação principal"\s+className="nav-blur fixed inset-x-0 bottom-0[^"]*lg:hidden/);
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

test("o perfil é de atuação territorial, sem estrutura de rede social", () => {
  const profileFiles = [
    "src/components/app/ProfileView.tsx",
    "src/components/app/MyProfileClient.tsx",
    "src/components/app/public/ProfileClient.tsx",
    "src/app/(app)/perfil/page.tsx",
    "src/app/(app)/perfil/[id]/page.tsx",
  ];
  const findings = [];
  for (const relativePath of profileFiles) {
    const source = fs.readFileSync(path.join(root, relativePath), "utf8");
    // Mural de terceiros e depoimentos não voltam ao perfil.
    for (const pattern of [/scrap/i, /testimonial/i, /\brecados?\b/i, /depoimentos?/i, /Adicionar referência/, /Referências de atuação/, /Atualizações do perfil/]) {
      if (pattern.test(source)) findings.push(`${relativePath}: ${pattern}`);
    }
    // Nada de grade de avatares de contatos ou de comunidades, nem contador disfarçado.
    for (const pattern of [/friendsOf/, /friendCount/, /\.communities\(\)/, /colaborações registradas/, /Pessoas e organizações \(/, /Frentes de atuação \(/, /grid-cols-4/, /coverUrl/]) {
      if (pattern.test(source)) findings.push(`${relativePath}: ${pattern}`);
    }
  }
  assert.deepEqual(findings, []);

  const view = fs.readFileSync(path.join(root, "src/components/app/ProfileView.tsx"), "utf8");
  // A frase de status não aparece em destaque entre aspas.
  assert.doesNotMatch(view, /profile\.status/);
  // O perfil é montado com a atuação real: demandas, sinais, apoios, selos e ações.
  assert.match(view, /api\.profileActivity\(userId\)/);
  assert.match(view, /<ImpactBadges/);
  assert.match(view, /Solicitar conexão/);
  assert.match(view, /<ReportButton targetKind="perfil"/);

  // O cliente não mantém métodos de mural nem de depoimento.
  const api = fs.readFileSync(path.join(root, "src/lib/app/api.ts"), "utf8");
  assert.doesNotMatch(api, /scrapsFor|addScrap|testimonialsFor|addTestimonial|friendsOf/);
});
