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
  const menu = source.slice(source.indexOf('id="app-account-menu"'));
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
