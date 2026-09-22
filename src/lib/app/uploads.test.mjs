import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  UPLOAD_PURPOSES,
  acceptAttribute,
  acceptedExtensions,
  checkUploadFile,
  contentTypeFor,
  formatBytes,
  parseUploadRef,
  resolveMediaUrl,
} from "./uploads.ts";

// O módulo dos serviços só carrega express e o SDK da AWS quando cria rotas
// e armazenamento; as tabelas de finalidades podem ser lidas aqui.
const require = createRequire(import.meta.url);
const service = require("../../../services/post-service/src/uploads.js");
const ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

test("finalidades, tipos e limites iguais aos do serviço", () => {
  assert.deepEqual(Object.keys(UPLOAD_PURPOSES), Object.keys(service.PURPOSES));
  for (const [purpose, rule] of Object.entries(UPLOAD_PURPOSES)) {
    assert.deepEqual(rule.types, service.PURPOSES[purpose].types, purpose);
    assert.equal(rule.maxBytes, service.PURPOSES[purpose].maxBytes, purpose);
    assert.equal(rule.service, service.PURPOSES[purpose].target === "institution" ? "users" : "posts", purpose);
  }
});

test("accept completo (MIME + extensões) para o seletor do Android", () => {
  const photo = acceptAttribute("demand_photo").split(",");
  for (const value of ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", ".jpg", ".jpeg", ".heic"]) {
    assert.ok(photo.includes(value), value);
  }
  const docs = acceptAttribute("institution_proof").split(",");
  assert.ok(docs.includes("application/pdf") && docs.includes(".docx") && docs.includes(".ods"));
  assert.deepEqual(acceptedExtensions("demand_document"), ["PDF", "DOCX", "XLSX", "ODT", "ODS", "JPG", "PNG"]);
  assert.deepEqual(acceptedExtensions("demand_evidence_video"), ["MP4", "MOV"]);
});

test("tipo pelo navegador ou pela extensão; o servidor confere de novo", () => {
  assert.equal(contentTypeFor("demand_photo", { name: "IMG_0001.HEIC", type: "" }), "image/heic");
  assert.equal(contentTypeFor("demand_photo", { name: "foto.jpg", type: "image/jpg" }), "image/jpeg");
  assert.equal(contentTypeFor("demand_evidence_video", { name: "depois.MOV", type: "video/quicktime" }), "video/quicktime");
  assert.equal(contentTypeFor("institution_proof", { name: "ata.pdf", type: "application/pdf" }), "application/pdf");
  assert.equal(contentTypeFor("institution_proof", { name: "ata.exe", type: "application/x-msdownload" }), null);
  // Tipo e extensão em conflito: vale a extensão aceita.
  assert.equal(contentTypeFor("demand_document", { name: "planilha.xlsx", type: "application/octet-stream" }),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
});

test("checkUploadFile: tamanho e tipo antes de pedir o envio", () => {
  assert.deepEqual(checkUploadFile("demand_photo", { name: "a.png", type: "image/png", size: 1000 }), { ok: true, contentType: "image/png" });
  const big = checkUploadFile("demand_photo", { name: "a.png", type: "image/png", size: 16 * 1024 * 1024 });
  assert.equal(big.ok, false);
  assert.match(big.error, /15 MB/);
  assert.equal(checkUploadFile("demand_photo", { name: "a.gif", type: "image/gif", size: 10 }).ok, false);
  assert.equal(checkUploadFile("demand_photo", { name: "a.png", type: "image/png", size: 0 }).ok, false);
  assert.equal(checkUploadFile("demand_evidence_video", { name: "v.mp4", type: "video/mp4", size: 400 * 1024 * 1024 }).ok, true);
  assert.equal(formatBytes(1536), "2 KB");
  assert.equal(formatBytes(25 * 1024 * 1024), "25 MB");
});

test("referências e endereços de mídia", () => {
  assert.equal(parseUploadRef(`upload:${ID}`), ID);
  assert.equal(parseUploadRef(ID), ID);
  assert.equal(parseUploadRef("https://exemplo.org/a.pdf"), null);
  assert.equal(parseUploadRef(null), null);
  for (const ref of [`upload:${ID}`, ID.toUpperCase(), "upload:x"]) {
    assert.equal(parseUploadRef(ref), service.parseUploadRef(ref), ref);
  }
  assert.equal(resolveMediaUrl(`/api/posts/uploads/${ID}/content`, ""), `/api/posts/uploads/${ID}/content`);
  assert.equal(resolveMediaUrl(`/api/posts/uploads/${ID}/content`, "http://localhost:8080"), `http://localhost:8080/api/posts/uploads/${ID}/content`);
  assert.equal(resolveMediaUrl("/images/horta.jpeg", "http://localhost:8080"), "/images/horta.jpeg");
  assert.equal(resolveMediaUrl("https://cdn.exemplo.org/a.png", "http://localhost:8080"), "https://cdn.exemplo.org/a.png");
});
