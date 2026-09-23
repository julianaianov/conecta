// Cadastro institucional na interface (T05). Os cadastros abaixo existem só
// neste teste; nenhuma tela usa dados de exemplo.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import {
  INSTITUTION_FORM_PATHS,
  INSTITUTION_STATUS_COLORS,
  INSTITUTION_STATUS_GUIDANCE,
  cnaeSuggestions,
  emptyInstitutionForm,
  formFromInstitution,
  gateStatusFrom,
  inputFromForm,
  institutionCanEdit,
  institutionGateMessage,
  institutionRequirement,
  isInstitutionNotValidated,
  isValidCnpj,
  mapPublicInstitutionRecord,
  maskCep,
  maskCnae,
  maskCnpj,
  maskPhone,
  postRegisterDestination,
  safeWebsite,
  validateInstitutionForm,
} from "./institution.ts";

const require = createRequire(import.meta.url);
const server = require("../../../services/user-service/src/institution.js");
const root = new URL("../../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

function agentForm() {
  return {
    ...emptyInstitutionForm(),
    cnpj: "11.222.333/0001-81",
    legalName: "Associação de Moradores do Bairro Verde",
    tradeName: "AMBV",
    cnaePrimary: "9430-8/00",
    cnaePrimaryDescription: "Atividades de associações de defesa de direitos sociais",
    cnaeSecondary: [{ code: "8800-6/00", description: "" }],
    cep: "20040-020",
    street: "Rua da Assembleia",
    addressNumber: "10",
    district: "Centro",
    municipality: "Rio de Janeiro",
    uf: "RJ",
    institutionalEmail: "contato@ambv.org.br",
    representative: {
      fullName: "Ana Souza", position: "Presidente", institutionalEmail: "ana@ambv.org.br",
      institutionalPhone: "(21) 99999-0000", proofDocumentRef: "", proofDescription: "",
    },
  };
}

function govForm() {
  return {
    ...emptyInstitutionForm(),
    cnpj: "12.ABC.345/01DE-35",
    legalName: "Prefeitura Municipal de Exemplo",
    governmentSphere: "municipal",
    municipality: "Exemplo",
    uf: "SP",
    territory: "Todo o município",
    department: "Secretaria de Meio Ambiente",
    competenceAreas: ["Meio ambiente", "Saneamento"],
    representative: {
      fullName: "Carlos Lima", position: "Secretário", institutionalEmail: "carlos@exemplo.sp.gov.br",
      institutionalPhone: "(11) 3333-4444", proofDocumentRef: "https://exemplo.sp.gov.br/portaria-123", proofDescription: "",
    },
  };
}

test("máscaras de CNPJ (inclusive alfanumérico), CNAE, CEP e telefone", () => {
  assert.equal(maskCnpj("112223"), "11.222.3");
  assert.equal(maskCnpj("11222333000181"), "11.222.333/0001-81");
  assert.equal(maskCnpj("12abc34501de35xyz"), "12.ABC.345/01DE-35");
  assert.equal(maskCnae("94308"), "9430-8");
  assert.equal(maskCnae("9430800"), "9430-8/00");
  assert.equal(maskCep("20040020"), "20040-020");
  assert.equal(maskPhone("21999990000"), "(21) 99999-0000");
  assert.equal(maskPhone("1133334444"), "(11) 3333-4444");
  assert.equal(maskPhone("+55 11 3333-4444"), "(11) 3333-4444");
});

test("validação de CNPJ igual à do user-service", () => {
  for (const value of ["11.222.333/0001-81", "12.ABC.345/01DE-35", "12abc34501de35", "11.222.333/0001-82", "11111111111111", "1122233300018"]) {
    assert.equal(isValidCnpj(value), server.isValidCnpj(value), value);
  }
});

test("formulário completo passa no navegador e no servidor com o mesmo payload", () => {
  for (const [kind, form] of [["agente_transformacao", agentForm()], ["poder_publico", govForm()]]) {
    assert.deepEqual(validateInstitutionForm(kind, form), {}, kind);
    const payload = inputFromForm(kind, form);
    assert.deepEqual(server.validateInstitution(kind, payload).errors, {}, kind);
  }
  const agent = inputFromForm("agente_transformacao", agentForm());
  assert.equal(agent.cnpj, "11222333000181");
  assert.equal(agent.cnaePrimary, "9430800");
  assert.equal(agent.cep, "20040020");
  assert.equal(agent.representative.institutionalPhone, "21999990000");
  assert.equal(agent.governmentSphere, undefined, "Agente não envia esfera");
  const gov = inputFromForm("poder_publico", govForm());
  assert.equal(gov.cep, undefined, "Poder Público não envia endereço");
  assert.deepEqual(gov.competenceAreas, ["Meio ambiente", "Saneamento"]);
});

test("erros de campo usam as mesmas chaves que o servidor devolve em `fields`", () => {
  const cases = [
    ["agente_transformacao", emptyInstitutionForm()],
    ["poder_publico", emptyInstitutionForm()],
    ["agente_transformacao", { ...agentForm(), cnpj: "11.222.333/0001-82", cep: "123", institutionalEmail: "" }],
    ["poder_publico", { ...govForm(), governmentSphere: "estadual", uf: "", competenceAreas: [] }],
  ];
  for (const [kind, form] of cases) {
    const client = Object.keys(validateInstitutionForm(kind, form)).sort();
    const serverKeys = Object.keys(server.validateInstitution(kind, inputFromForm(kind, form)).errors).sort();
    assert.deepEqual(client, serverKeys, `${kind}: ${JSON.stringify(client)} × ${JSON.stringify(serverKeys)}`);
  }
});

test("agente precisa de CNAE, CEP e ao menos um contato institucional", () => {
  const errors = validateInstitutionForm("agente_transformacao", { ...agentForm(), cnaePrimary: "", cep: "", institutionalEmail: "" });
  assert.ok(errors.cnaePrimary);
  assert.ok(errors.cep);
  assert.ok(errors.institutionalContact);
});

test("poder público: município só é obrigatório na esfera municipal", () => {
  assert.ok(validateInstitutionForm("poder_publico", { ...govForm(), municipality: "" }).municipality);
  assert.equal(validateInstitutionForm("poder_publico", { ...govForm(), governmentSphere: "federal", municipality: "", uf: "" }).municipality, undefined);
});

test("cadastro salvo volta ao formulário com máscara", () => {
  const form = formFromInstitution({
    id: "1", kind: "agente_transformacao", cnpj: "11222333000181", legalName: "X", tradeName: null,
    cnaePrimary: "9430800", cnaePrimaryDescription: "d", cnaeSecondary: [{ code: "8800600", description: null }],
    governmentSphere: null, department: null, competenceAreas: [], territory: null, cep: "20040020",
    street: "R", addressNumber: "1", addressComplement: null, district: "C", municipality: "M", municipalityIbgeCode: null,
    uf: "RJ", institutionalEmail: null, institutionalPhone: "2133334444", website: null, status: "devolvida",
    validationNote: "Ajuste", reviewedAt: null, submittedAt: null, createdAt: "", updatedAt: null, events: [],
    representative: { fullName: "A", position: "P", institutionalEmail: "a@b.org", institutionalPhone: "21999990000", proofDocumentRef: null, proofDescription: null },
  });
  assert.equal(form.cnpj, "11.222.333/0001-81");
  assert.equal(form.cnaeSecondary[0].code, "8800-6/00");
  assert.equal(form.cep, "20040-020");
  assert.equal(form.institutionalPhone, "(21) 3333-4444");
  assert.equal(form.representative.institutionalPhone, "(21) 99999-0000");
});

test("sugestões de CNAE vêm da referência, por código ou atividade (sem acento)", () => {
  const reference = server.CNAE_REFERENCE;
  assert.equal(cnaeSuggestions(reference, "9430")[0].code, "9430800");
  assert.ok(cnaeSuggestions(reference, "assistencia social").some((c) => c.code === "8800600"));
  assert.ok(cnaeSuggestions(reference, "").length > 0);
  assert.deepEqual(cnaeSuggestions(reference, "zzzz"), []);
});

test("edição só em pendente, devolvida e revogada; cores da paleta oficial", () => {
  assert.ok(institutionCanEdit(null));
  assert.ok(institutionCanEdit("pendente") && institutionCanEdit("devolvida") && institutionCanEdit("revogada"));
  assert.ok(!institutionCanEdit("em_analise") && !institutionCanEdit("validada"));
  const palette = ["#1B4F72", "#0D2D42", "#2E7BA8", "#5A9BC4", "#D6EAF8", "#F4841A", "#F89B45", "#343A40", "#868E96", "#E53935", "#2E9E5B"];
  for (const [status, color] of Object.entries(INSTITUTION_STATUS_COLORS)) {
    assert.ok(palette.includes(color), status);
    assert.ok(INSTITUTION_STATUS_GUIDANCE[status]);
  }
});

test("onboarding: Agente e Poder Público vão à ficha depois do cadastro", () => {
  assert.equal(postRegisterDestination("agent", "ong"), `${INSTITUTION_FORM_PATHS.agente_transformacao}?boas-vindas=1`);
  assert.equal(postRegisterDestination("agent", "lider_comunitario"), "/cadastro-institucional/agente?boas-vindas=1");
  assert.equal(postRegisterDestination("government", "prefeitura"), "/cadastro-institucional/poder-publico?boas-vindas=1");
  assert.equal(postRegisterDestination("member", "morador"), "/feed");
  assert.equal(postRegisterDestination("partner", "empresa"), "/feed");
});

test("requisito explicado por perfil (decisão 3 para Líder e Representante de Bairro)", () => {
  const leader = institutionRequirement("agent", "lider_comunitario", null);
  assert.equal(leader.blocking, false);
  assert.match(leader.message, /Líder Comunitário/);
  assert.match(leader.message, /CNPJ/);
  assert.match(institutionRequirement("agent", "representante_bairro", null).message, /Representante de Bairro/);
  assert.equal(institutionRequirement("government", "secretaria", "pendente").blocking, true);
  assert.match(institutionRequirement("agent", "ong", null).message, /CNPJ \+ CNAE/);
  assert.equal(institutionRequirement("agent", "ong", "validada"), null);
  assert.equal(institutionRequirement("member", "morador", null), null);
});

test("403 institution_not_validated vira mensagem amigável conforme o estado", () => {
  const err = Object.assign(new Error("x"), { status: 403, code: "institution_not_validated", validationStatus: "em_analise" });
  assert.ok(isInstitutionNotValidated(err));
  assert.ok(!isInstitutionNotValidated(new Error("x")));
  assert.ok(!isInstitutionNotValidated(null));
  assert.equal(gateStatusFrom(err), "em_analise");
  assert.match(institutionGateMessage("comentar", "em_analise"), /em análise/);
  assert.match(institutionGateMessage("apoiar", "devolvida"), /parecer/);
  assert.match(institutionGateMessage("conectar", null), /cadastro institucional validado/);
  for (const action of ["publicar", "editar", "comentar", "apoiar", "conectar"]) {
    assert.doesNotMatch(institutionGateMessage(action, "pendente"), /403|institution_not_validated/);
  }
});

test("perfil público usa só a projeção pública da instituição", () => {
  const inst = mapPublicInstitutionRecord({
    institution_kind: "poder_publico", cnpj: "12ABC34501DE35", legal_name: "Órgão", government_sphere: "municipal",
    competence_areas: ["Saúde"], validation_status: "validada", validation_reviewed_at: "2026-09-20T10:00:00Z",
  });
  assert.equal(inst.kind, "poder_publico");
  assert.deepEqual(inst.competenceAreas, ["Saúde"]);
  assert.equal(inst.validatedAt, "2026-09-20T10:00:00Z");
  assert.equal("institutionalEmail" in inst, false);
  assert.equal("representative" in inst, false);
  assert.equal(safeWebsite("javascript:alert(1)"), null);
  assert.equal(safeWebsite("https://orgao.gov.br"), "https://orgao.gov.br");
});

test("telas do cadastro institucional existem e ficam fora do índice", () => {
  for (const page of ["", "/agente", "/poder-publico"]) {
    assert.ok(existsSync(new URL(`src/app/(app)/cadastro-institucional${page}/page.tsx`, root)), page || "hub");
  }
  assert.match(read("src/app/(app)/cadastro-institucional/layout.tsx"), /index: false/);
  assert.match(read("src/lib/app/access.ts"), /"\/cadastro-institucional"/);
  assert.match(read("src/app/robots.ts"), /"\/cadastro-institucional"/);
});

test("fluxo: rascunho, envio, status com parecer e trilha", () => {
  const page = read("src/components/app/institution/InstitutionPageClient.tsx");
  assert.match(page, /api\.saveMyInstitution/);
  assert.match(page, /api\.submitMyInstitution/);
  assert.match(page, /err\.fields/);
  assert.match(page, /institutionCanEdit/);
  const status = read("src/components/app/institution/InstitutionStatus.tsx");
  assert.match(status, /validationNote/);
  assert.match(status, /institution\.events/);
  assert.match(read("src/app/(auth)/register/page.tsx"), /postRegisterDestination\(role, profileType\)/);
});

test("publicar, comentar, apoiar e conectar tratam o 403 institucional", () => {
  for (const file of [
    "src/app/(app)/criar/page.tsx",
    "src/components/app/public/PostDetailClient.tsx",
    "src/app/(app)/post/[id]/apoiar/page.tsx",
    "src/app/(app)/conexoes/nova/page.tsx",
  ]) {
    const source = read(file);
    assert.match(source, /isInstitutionNotValidated\(err\)/, file);
    assert.match(source, /<InstitutionGateNotice/, file);
  }
  assert.match(read("src/lib/app/api.ts"), /class ApiError/);
});

test("perfil público mostra o selo da instituição validada", () => {
  assert.match(read("src/app/(app)/perfil/[id]/page.tsx"), /getPublicInstitution\(id\)/);
  assert.match(read("src/components/app/public/ProfileClient.tsx"), /institution: initialInstitution/);
  assert.match(read("src/components/app/ProfileView.tsx"), /<PublicInstitutionCard institution=\{institution\}/);
  assert.match(read("src/components/app/ProfileView.tsx"), /api\.getPublicInstitution\(userId\)/);
});

test("componentes institucionais seguem a paleta e não trazem dados fictícios", () => {
  const allowed = new Set(["#1b4f72", "#0d2d42", "#2e7ba8", "#5a9bc4", "#d6eaf8", "#f4841a", "#f89b45", "#343a40", "#868e96", "#e53935", "#2e9e5b", "#fff"]);
  for (const name of ["InstitutionForm", "InstitutionPageClient", "InstitutionStatus", "InstitutionBanner", "PublicInstitutionCard"]) {
    const source = read(`src/components/app/institution/${name}.tsx`);
    for (const hex of source.match(/#[0-9a-fA-F]{3,6}\b/g) ?? []) assert.ok(allowed.has(hex.toLowerCase()), `${name}: ${hex}`);
    assert.doesNotMatch(source, /\b(?:demo|mock|fake|lorem)\b/i, name);
  }
});
