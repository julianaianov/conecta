import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

// Apresentação Institucional, slide 25: "apenas dados verificáveis são publicados;
// funcionalidades ainda em desenvolvimento são identificadas como tal".
// A landing não promete app iOS nem deixa links vazios.

const root = path.resolve(import.meta.dirname, "../../..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

/** Componentes renderizados pela landing, lidos dos imports de page.tsx. */
function landingFiles() {
  const page = read("src/components/LandingExperience.tsx");
  const components = [...page.matchAll(/from "@\/components\/(\w+)"/g)].map(
    ([, name]) => `src/components/${name}.tsx`,
  );
  return ["src/app/page.tsx", "src/components/LandingExperience.tsx", "src/lib/constants.ts", ...components];
}

const stripComments = (source) =>
  source.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("a landing renderiza os componentes esperados", () => {
  const files = landingFiles();
  for (const name of ["Hero", "Steps", "CTABanner", "Footer"]) {
    assert.ok(files.includes(`src/components/${name}.tsx`), name);
  }
});

test("a landing não tem link vazio (href=\"#\")", () => {
  const findings = landingFiles().filter((file) => /href\s*[=:]\s*\{?["'`]#["'`]/.test(read(file)));
  assert.deepEqual(findings, []);
});

test("a landing não promete iOS nem App Store sem o marcador de em desenvolvimento", () => {
  const findings = [];
  for (const file of landingFiles()) {
    const source = stripComments(read(file));
    if (/App Store/.test(source)) findings.push(`${file}: App Store`);
    for (const match of source.matchAll(/\biOS\b/g)) {
      const around = source.slice(match.index, match.index + 120);
      if (!/<InDevelopment\b|em desenvolvimento/i.test(around)) findings.push(`${file}: iOS sem marcador`);
    }
  }
  assert.deepEqual(findings, []);
});

test("o rodapé leva à ficha real da Google Play e aos termos de uso", () => {
  const footer = read("src/components/Footer.tsx");
  assert.match(footer, /https:\/\/play\.google\.com\/store\/apps\/details\?id=org\.dmconecta\.app/);
  assert.match(footer, /href: "\/termos-de-uso"/);
  assert.match(footer, /<InDevelopment as="inline" \/>/);
});
