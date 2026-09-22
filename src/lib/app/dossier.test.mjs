// Dossiê da Demanda (T10) no frontend: rótulos e caminhos espelhados do
// post-service. Os registros abaixo existem só neste teste.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import {
  DOSSIER_STATUS_LABELS,
  DOSSIER_TITLE,
  DOSSIER_TRIGGER_LABELS,
  canRegenerate,
  dossierVerifyPath,
  formatBytesShort,
  normalizeDossierHash,
  publicDossierDownloadPath,
  shortHash,
  sha256OfFile,
  sortDossiers,
} from "./dossier.ts";
import { timelineEventLabel } from "./demand.ts";

const require = createRequire(import.meta.url);
const content = require("../../../services/post-service/src/dossier/content.js");
const HASH = "a".repeat(64);

test("título, gatilhos e estados iguais aos do post-service e da migração 009", () => {
  assert.equal(DOSSIER_TITLE, content.DOCUMENT_TITLE);
  assert.deepEqual(DOSSIER_TRIGGER_LABELS, content.TRIGGER_LABELS);
  const sql = readFileSync(new URL("../../../services/post-service/migrations/009-demand-dossiers.sql", import.meta.url), "utf8");
  const statuses = /status\s+VARCHAR\(20\) NOT NULL DEFAULT 'pendente'\s+CHECK \(status IN \(([^)]*)\)\)/.exec(sql)[1]
    .split(",").map((v) => v.trim().replace(/'/g, ""));
  assert.deepEqual(Object.keys(DOSSIER_STATUS_LABELS).sort(), statuses.sort());
});

test("hash: normaliza e recusa o que não é SHA-256", () => {
  assert.equal(normalizeDossierHash(` ${HASH.toUpperCase()} `), HASH);
  assert.equal(normalizeDossierHash("abc"), null);
  assert.equal(normalizeDossierHash(null), null);
  assert.equal(shortHash(HASH), "aaaaaaaa…aaaaaaaa");
});

test("caminhos de verificação e de download público", () => {
  assert.equal(dossierVerifyPath(HASH), `/dossie/verificar/${HASH}`);
  assert.equal(publicDossierDownloadPath("d-1"), "/api/posts/demands/d-1/dossie-publico");
  // O caminho impresso no PDF é o mesmo da página.
  assert.equal(content.verifyUrl("https://dmconecta.org", HASH), `https://dmconecta.org${dossierVerifyPath(HASH)}`);
});

test("ordem das versões e regeneração", () => {
  const base = { demandId: "d", number: "DMC-2026-000001", trigger: "envio", statusReason: null, attempts: 1, contentSha256: null, fileSha256: null, sizeBytes: null, fileName: "x.pdf", generatedAt: null, requestedAt: null, verifyPath: null };
  const list = [
    { ...base, id: "1", version: 1, variant: "integral", status: "gerado" },
    { ...base, id: "3", version: 2, variant: "publica", status: "gerado", trigger: "publicacao" },
    { ...base, id: "2", version: 2, variant: "integral", status: "gerado", trigger: "publicacao" },
  ];
  assert.deepEqual(sortDossiers(list).map((d) => d.id), ["2", "3", "1"]);
  assert.equal(canRegenerate(list), false);
  assert.equal(canRegenerate([...list, { ...base, id: "4", version: 3, variant: "integral", status: "falhou" }]), true);
  assert.equal(formatBytesShort(41_265), "40 KB");
  assert.equal(formatBytesShort(3 * 1024 * 1024), "3,0 MB");
});

test("linha do tempo: dossie_gerado tem rótulo próprio", () => {
  assert.equal(timelineEventLabel({ type: "dossie_gerado", toStatus: null }), "Dossiê da Demanda gerado");
  assert.equal(timelineEventLabel({ type: "dossie_gerado", toStatus: null, payload: { version: 3 } }), "Dossiê da Demanda gerado (versão 3)");
});

test("SHA-256 do arquivo no navegador", async () => {
  const hash = await sha256OfFile(new Blob(["abc"]));
  assert.equal(hash, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});
