// Vínculo a organizações e permissões delegadas (T29): o espelho do frontend
// precisa ser igual ao domínio do user-service e ao papel efetivo do post-service.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  DELEGATED_PERMISSIONS, DELEGATED_PERMISSION_LABELS, LEVEL_PERMISSIONS, MEMBERSHIP_STATUSES, MEMBERSHIP_STATUS_LABELS,
  MEMBERSHIP_TRANSITIONS, MEMBER_LEVELS, MEMBER_LEVEL_LABELS, PUBLIC_ACTING_LEVELS,
  delegatedRole, effectiveRole, managesTeam, membershipErrorMessage, permissionsFor,
} from "./organization.ts";

const require = createRequire(import.meta.url);
const M = require("../../../services/user-service/src/organization-members.js");
const D = require("../../../services/post-service/src/delegation.js");

test("níveis, permissões, estados e transições iguais ao user-service", () => {
  assert.deepEqual(MEMBER_LEVELS, M.LEVELS);
  assert.deepEqual(MEMBER_LEVEL_LABELS, M.LEVEL_LABELS);
  assert.deepEqual(DELEGATED_PERMISSIONS, M.PERMISSIONS);
  assert.deepEqual(DELEGATED_PERMISSION_LABELS, M.PERMISSION_LABELS);
  assert.deepEqual(LEVEL_PERMISSIONS, M.LEVEL_PERMISSIONS);
  assert.deepEqual(MEMBERSHIP_STATUSES, M.STATUSES);
  assert.deepEqual(MEMBERSHIP_STATUS_LABELS, M.STATUS_LABELS);
  assert.deepEqual(MEMBERSHIP_TRANSITIONS, M.TRANSITIONS);
  assert.deepEqual(PUBLIC_ACTING_LEVELS, M.PUBLIC_ACTING_LEVELS);
  assert.deepEqual(permissionsFor("colaborador"), M.permissionsFor("colaborador"));
});

test("papel efetivo igual ao post-service", () => {
  const member = { role: "member", profileType: "morador" };
  const cases = [
    { kind: "agente_transformacao", status: "validada", canActInstitutionally: true, requiredKind: null, delegation: { memberId: "m", level: "publicador", permissions: LEVEL_PERMISSIONS.publicador, organizationName: "X" } },
    { kind: "poder_publico", status: "validada", canActInstitutionally: true, requiredKind: null, delegation: { memberId: "m", level: "gestor", permissions: LEVEL_PERMISSIONS.gestor, organizationName: "X" } },
    { kind: "agente_transformacao", status: "validada", canActInstitutionally: true, requiredKind: null, delegation: { memberId: "m", level: "colaborador", permissions: LEVEL_PERMISSIONS.colaborador, organizationName: "X" } },
    { kind: null, status: null, canActInstitutionally: false, requiredKind: null, delegation: null },
  ];
  for (const access of cases) {
    assert.equal(delegatedRole(access), D.delegatedRole(access));
    assert.equal(effectiveRole(member, access), D.effectiveRole(member, access));
  }
  assert.equal(effectiveRole(member, cases[0]), "agent");
  assert.equal(effectiveRole(member, cases[1]), "government");
  assert.equal(effectiveRole(member, cases[2]), "member");
  assert.equal(effectiveRole({ role: "agent", profileType: "ong" }, cases[1]), "agent");
  assert.equal(effectiveRole(null, cases[0]), null);
});

test("quem gere a equipe: titular do cadastro ou gestor por vínculo", () => {
  assert.equal(managesTeam({ kind: "agente_transformacao", status: "pendente", canActInstitutionally: false, requiredKind: "agente_transformacao", delegation: null }), true);
  assert.equal(managesTeam({ kind: "agente_transformacao", status: "validada", canActInstitutionally: true, requiredKind: null, delegation: { memberId: "m", level: "gestor", permissions: LEVEL_PERMISSIONS.gestor, organizationName: "X" } }), true);
  assert.equal(managesTeam({ kind: "agente_transformacao", status: "validada", canActInstitutionally: true, requiredKind: null, delegation: { memberId: "m", level: "publicador", permissions: LEVEL_PERMISSIONS.publicador, organizationName: "X" } }), false);
  assert.equal(managesTeam({ kind: null, status: null, canActInstitutionally: false, requiredKind: null }), false);
  const err = Object.assign(new Error("x"), { code: "member_already_linked" });
  assert.equal(membershipErrorMessage(err), "Esta conta já atua em nome de outra instituição.");
});
