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
