// Módulos específicos (T-05-08): o espelho do portal precisa ser igual ao do
// post-service (services/post-service/src/demand/modules.js).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  DEMAND_MODULES,
  DEMAND_MODULE_LABELS,
  MODULE_BY_CATEGORY,
  MODULE_DOCUMENT_TYPES,
  MODULE_FIELDS,
  MODULE_INDICATORS,
  MODULE_MILESTONES,
  documentTypesFor,
  moduleDetailLines,
  moduleDetailsFormFrom,
  moduleDetailsInput,
  moduleOf,
  scheduleMilestonesFor,
} from "./demand-modules.ts";
import { DEMAND_CATEGORIES, DOCUMENT_TYPES, RECORD_MILESTONES } from "./demand.ts";

const require = createRequire(import.meta.url);
const server = require("../../../services/post-service/src/demand/modules.js");
const constants = require("../../../services/post-service/src/demand/constants.js");

test("módulos iguais aos do post-service", () => {
  assert.deepEqual(DEMAND_MODULES, server.MODULES);
  assert.deepEqual(DEMAND_MODULE_LABELS, server.MODULE_LABELS);
  assert.deepEqual(MODULE_BY_CATEGORY, server.MODULE_BY_CATEGORY);
  assert.deepEqual(MODULE_DOCUMENT_TYPES, server.MODULE_DOCUMENT_TYPES);
  assert.deepEqual(MODULE_INDICATORS, server.MODULE_INDICATORS);
  assert.deepEqual(MODULE_MILESTONES, server.MODULE_MILESTONES);
  assert.deepEqual(MODULE_FIELDS, server.MODULE_FIELDS);
  assert.deepEqual(DOCUMENT_TYPES, constants.DOCUMENT_TYPES);
  assert.deepEqual(RECORD_MILESTONES, constants.RECORD_MILESTONES);
});

test("cada uma das 12 categorias tem módulo; o módulo é derivado", () => {
  assert.deepEqual(Object.keys(MODULE_BY_CATEGORY).sort(), [...DEMAND_CATEGORIES].sort());
  assert.equal(moduleOf("recuperacao_ambiental"), "ambiental");
  assert.equal(moduleOf(""), null);
});

test("documentos do módulo primeiro; marcos do ambiental no cronograma", () => {
  const obra = documentTypesFor("obra_ou_melhoria_de_infraestrutura", DOCUMENT_TYPES);
  assert.equal(obra[0], "documentos_institucionais");
  assert.ok(obra.slice(0, 12).includes("art_rrt"));
  assert.equal(new Set(obra).size, DOCUMENT_TYPES.length);
  assert.deepEqual(documentTypesFor("problema_urbano", DOCUMENT_TYPES), DOCUMENT_TYPES);
  assert.ok(scheduleMilestonesFor("recuperacao_ambiental").includes("diagnostico"));
  assert.ok(!scheduleMilestonesFor("projeto_social").includes("diagnostico"));
});

test("formulário do módulo: só chaves do módulo, área em número, grupo sem brancos", () => {
  const form = moduleDetailsFormFrom({ area_m2: 1200.5, responsavel_tecnico: { nome: "Ana" } });
  assert.equal(form.area_m2, "1200,5");
  const input = moduleDetailsInput("recuperacao_ambiental", {
    ...form, diagnostico: "  Duna degradada ", equipe: "não é do ambiental",
    responsavel_tecnico: { nome: "Ana", registro: " " },
  });
  assert.deepEqual(input, { area_m2: 1200.5, diagnostico: "Duna degradada", responsavel_tecnico: { nome: "Ana" } });
  assert.deepEqual(moduleDetailsInput("apoio_tecnico", form), {});
  assert.deepEqual(moduleDetailsInput("recuperacao_ambiental", { area_m2: "1.500,25" }), { area_m2: 1500.25 });
  const lines = Object.fromEntries(moduleDetailLines("ambiental", input));
  assert.equal(lines["Área (m²)"], "1.200,5 m²");
  assert.equal(lines["Responsável técnico"], "Nome: Ana");
});
