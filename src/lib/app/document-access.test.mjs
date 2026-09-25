// Nível de visibilidade dos documentos (T-05-18): espelho igual ao post-service.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  DEFAULT_DOCUMENT_ACCESS_LEVEL,
  DEMAND_ACCESS_ROLE_LABELS,
  DOCUMENT_ACCESS_LEVELS,
  DOCUMENT_ACCESS_LEVEL_HINTS,
  DOCUMENT_ACCESS_LEVEL_LABELS,
  documentAccessErrorMessage,
} from "./document-access.ts";

const require = createRequire(import.meta.url);
const server = require("../../../services/post-service/src/access/documents");
const party = require("../../../services/post-service/src/access/process-party");

test("níveis e padrão iguais aos do post-service e da migração 043", async () => {
  assert.deepEqual(DOCUMENT_ACCESS_LEVELS, server.ACCESS_LEVELS);
  assert.equal(DEFAULT_DOCUMENT_ACCESS_LEVEL, server.DEFAULT_ACCESS_LEVEL);
  const fs = await import("node:fs");
  const sql = fs.readFileSync(new URL("../../../services/post-service/migrations/043-institutional-visibility.sql", import.meta.url), "utf8");
  assert.match(sql, /ENUM \('publico', 'institucional', 'restrito'\)/);
  for (const level of DOCUMENT_ACCESS_LEVELS) {
    assert.ok(DOCUMENT_ACCESS_LEVEL_LABELS[level] && DOCUMENT_ACCESS_LEVEL_HINTS[level]);
  }
  assert.match(DOCUMENT_ACCESS_LEVEL_HINTS.institucional, /envolvidos no processo/);
});

test("papéis de acesso cobrem os do servidor", () => {
  for (const role of [...party.MANAGING_ROLES, "parte", "orgao", "interessado"]) assert.ok(DEMAND_ACCESS_ROLE_LABELS[role], role);
});

test("mensagens de falha ao abrir", () => {
  assert.match(documentAccessErrorMessage(503), /armazenamento/);
  assert.match(documentAccessErrorMessage(404, "dossier_not_available"), /ainda não foi gerado/);
  assert.match(documentAccessErrorMessage(404), /sem acesso/);
});
