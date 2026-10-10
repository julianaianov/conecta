// Edição do perfil pelo titular (W36). Os dados abaixo existem só neste teste.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  PROFILE_EDIT_PATH,
  PROFILE_FIELDS,
  PROFILE_FIELD_GROUPS,
  PROFILE_GUIDES,
  PROFILE_PATH,
  PROFILE_VISIBILITY_LABELS,
  avatarPreviewUrl,
  emptyProfileForm,
  firstProfileErrorKey,
  formFromProfile,
  inputFromProfileForm,
  isProfileFormDirty,
  profileErrorMessage,
  profileFieldErrors,
  validateProfileForm,
} from "./profile-edit.ts";
import { ROLES } from "./types.ts";
import { isIndexablePath } from "./access.ts";

const require = createRequire(import.meta.url);
const server = require("../../../services/user-service/src/profile-edit.js");
const root = new URL("../../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const own = (over = {}) => ({
  userId: "11111111-1111-4111-8111-111111111111", name: "Ana Souza", role: "agent", profileType: "ong",
  bio: null, status: null, city: null, neighborhood: null, website: null, avatarUrl: null, coverUrl: null,
  phone: null, state: null, ...over,
});

test("campos, ordem e limites iguais aos do user-service", () => {
  assert.deepEqual(PROFILE_FIELDS.map((f) => f.key), Object.keys(server.PROFILE_FIELDS));
  for (const field of PROFILE_FIELDS) {
    const spec = server.PROFILE_FIELDS[field.key];
    assert.equal(field.max, spec.max, field.key);
    assert.equal(field.label, spec.label, field.key);
    assert.equal(Boolean(field.required), Boolean(spec.required), field.key);
  }
  const grouped = PROFILE_FIELD_GROUPS.flatMap((g) => g.keys);
  assert.deepEqual([...grouped].sort(), PROFILE_FIELDS.map((f) => f.key).sort(), "todo campo está em um bloco, uma vez");
});

test("erros de campo usam as mesmas chaves e mensagens do servidor", () => {
  const cases = [
    {},
    { name: "Ana" },
    { name: "Ana", bio: "x".repeat(501) },
    { name: "Ana", bio: "x".repeat(500), neighborhood: "x".repeat(256), city: "x".repeat(101) },
    { name: "Ana", avatarUrl: "http://exemplo.org/a.jpg" },
    { name: "Ana", avatarUrl: "https://exemplo.org/a.jpg", website: "https://ana.org.br" },
    { name: "Ana", avatarUrl: "https://u:p@exemplo.org/a.jpg" },
    { name: "Ana", avatarUrl: "javascript:alert(1)" },
    { name: "Ana", website: "ana.org" },
    { name: "Ana", state: "ZZ" },
    { name: "Ana", state: "rj" },
    { name: "Ana", phone: "123" },
    { name: "Ana", phone: "(21) 98888-7777" },
    { name: "Ana", phone: "(21) 3333-4444" },
    { name: "Ana", phone: "(21) 3333-44445" },
    { name: "Ana", phone: "219999900001" },
    { name: "Ana", phone: "5521988887777" },
    { name: "Ana", bio: "a\u0000b" },
    { name: "   ", bio: "ok", phone: "", state: "" },
    { name: "", avatarUrl: "x", website: "y", state: "Z", phone: "1" },
  ];
  for (const values of cases) {
    const form = { ...emptyProfileForm(), ...values };
    const client = validateProfileForm(form);
    const remote = server.validateProfileUpdate(inputFromProfileForm(form)).errors;
    assert.deepEqual(client, remote, JSON.stringify(values));
  }
});

test("payload: textos aparados, vazio limpa, telefone sem máscara e UF em maiúsculas", () => {
  const input = inputFromProfileForm({
    name: " Ana Souza ", bio: " Hortas no Centro. ", avatarUrl: " https://exemplo.org/a.jpg ", neighborhood: "Centro",
    city: "Duque de Caxias", state: "rj", phone: "(21) 98888-7777", website: "",
  });
  assert.deepEqual(input, {
    name: "Ana Souza", bio: "Hortas no Centro.", avatarUrl: "https://exemplo.org/a.jpg", neighborhood: "Centro",
    city: "Duque de Caxias", state: "RJ", phone: "21988887777", website: null,
  });
  const cleared = inputFromProfileForm({ ...emptyProfileForm(), name: "Ana" });
  assert.deepEqual(cleared, {
    name: "Ana", bio: null, avatarUrl: null, neighborhood: null, city: null, state: null, phone: null, website: null,
  });
  // O que o cliente manda é o que o servidor grava, sem erro.
  const sent = server.validateProfileUpdate(input);
  assert.deepEqual(sent.errors, {});
  assert.deepEqual(sent.value, {
    name: "Ana Souza", bio: "Hortas no Centro.", avatar_url: "https://exemplo.org/a.jpg", neighborhood: "Centro",
    city: "Duque de Caxias", state: "RJ", phone: "21988887777", website: null,
  });
});

test("formulário a partir do perfil gravado: telefone mascarado, UF só se válida, nulos viram vazio", () => {
  assert.deepEqual(formFromProfile(null), emptyProfileForm());
  const form = formFromProfile(own({
    bio: "Hortas", neighborhood: "Centro", city: "Niterói", state: "rj", phone: "21988887777", website: "https://ana.org.br",
    avatarUrl: "https://exemplo.org/a.jpg",
  }));
  assert.equal(form.phone, "(21) 98888-7777");
  assert.equal(form.state, "RJ");
  assert.equal(form.avatarUrl, "https://exemplo.org/a.jpg");
  assert.equal(formFromProfile(own({ state: "Rio de Janeiro" })).state, "", "valor antigo que não é UF não vira opção inválida");
  assert.equal(formFromProfile(own()).bio, "");
});

test("alteração pendente só aparece quando algum campo muda de fato", () => {
  const saved = formFromProfile(own({ bio: "Hortas", phone: "21988887777" }));
  assert.equal(isProfileFormDirty(saved, saved), false);
  assert.equal(isProfileFormDirty({ ...saved, bio: "  Hortas  " }, saved), false, "espaço nas pontas não conta");
  assert.equal(isProfileFormDirty({ ...saved, bio: "Hortas e oficinas" }, saved), true);
  assert.equal(isProfileFormDirty({ ...saved, phone: "" }, saved), true);
});

test("a foto de prévia só vale com link https", () => {
  assert.equal(avatarPreviewUrl(" https://exemplo.org/a.jpg "), "https://exemplo.org/a.jpg");
  for (const value of ["", "http://exemplo.org/a.jpg", "javascript:alert(1)", "https://", "exemplo.org/a.jpg"]) {
    assert.equal(avatarPreviewUrl(value), null, value);
  }
});

test("erros do servidor por campo e mensagens de falha", () => {
  assert.deepEqual(profileFieldErrors({ phone: "Telefone: x", role: "ignorado" }), { phone: "Telefone: x" });
  assert.deepEqual(profileFieldErrors(undefined), {});
  assert.equal(firstProfileErrorKey({ website: "x", name: "y" }), "name", "foco no primeiro campo na ordem do formulário");
  assert.equal(firstProfileErrorKey({}), null);
  assert.match(profileErrorMessage(new Error("timeout")), /Sem conexão/);
  assert.match(profileErrorMessage(Object.assign(new Error("Token inválido"), { status: 401 })), /sessão expirou/);
  assert.equal(profileErrorMessage(Object.assign(new Error("Perfil inválido"), { status: 422 })), "Perfil inválido");
  assert.match(profileErrorMessage("x"), /Não foi possível salvar/);
});

test("as cinco categorias têm texto de apoio e a visibilidade de cada campo está dita", () => {
  assert.deepEqual(Object.keys(PROFILE_GUIDES).sort(), [...ROLES].sort());
  for (const role of ROLES) {
    const guide = PROFILE_GUIDES[role];
    assert.ok(guide.intro && guide.nameHint && guide.bioHint, role);
    assert.doesNotMatch(JSON.stringify(guide), /\bredes?\b|recado|curt(ir|idas?)\b|mural/i, role);
  }
  assert.equal(PROFILE_GUIDES.agent.related.href, "/cadastro-institucional");
  assert.equal(PROFILE_GUIDES.government.related.href, "/cadastro-institucional");
  // LGPD: telefone e estado são privados; o resto aparece no perfil público.
  const visibility = Object.fromEntries(PROFILE_FIELDS.map((f) => [f.key, f.visibility]));
  assert.deepEqual(visibility, {
    name: "publico", bio: "publico", avatarUrl: "publico", neighborhood: "publico", city: "publico",
    state: "privado", phone: "privado", website: "publico",
  });
  assert.match(PROFILE_VISIBILITY_LABELS.privado, /Não aparece no perfil público/);
});

test("a tela fica em /perfil, privada e fora do índice, e o perfil leva até ela", () => {
  assert.equal(PROFILE_PATH, "/perfil");
  assert.equal(PROFILE_EDIT_PATH, "/perfil/editar");
  assert.equal(isIndexablePath("/perfil/editar"), false);
  assert.equal(isIndexablePath("/perfil/11111111-1111-4111-8111-111111111111"), true, "perfil público segue indexável");

  const page = read("src/app/(app)/perfil/editar/page.tsx");
  assert.match(page, /path: "\/perfil\/editar"/);
  assert.match(page, /indexable: false/);
  assert.match(page, /<ProfileEditClient \/>/);

  const robots = read("src/app/robots.ts");
  assert.match(robots, /"\/perfil\/editar"/);
  assert.doesNotMatch(robots, /"\/perfil",/, "o prefixo /perfil continua liberado para os perfis públicos");

  const view = read("src/components/app/ProfileView.tsx");
  assert.match(view, /PROFILE_EDIT_PATH/);
  assert.match(view, /isOwn && \(\s*<div[^>]*>[\s\S]*?Editar perfil/, "só o titular vê o atalho");
});

test("o cliente chama GET e POST /api/users/me e a tela usa os campos e erros por campo", () => {
  const api = read("src/lib/app/api.ts");
  assert.match(api, /async getMyProfile\(\)/);
  assert.match(api, /request<RawPost>\("\/api\/users\/me"\)/);
  assert.match(api, /async updateProfile\(input: ProfileUpdateInput\)/);
  assert.match(api, /request<RawPost>\("\/api\/users\/me", \{ method: "POST", body: JSON\.stringify\(input\) \}\)/);

  const screen = read("src/components/app/ProfileEditClient.tsx");
  for (const call of ["api.getMyProfile()", "api.updateProfile(", "validateProfileForm(", "profileFieldErrors("]) {
    assert.ok(screen.includes(call), call);
  }
  assert.match(screen, /AuthPrompt action="editar seu perfil" returnTo="\/perfil\/editar"/);
  assert.match(screen, /aria-label="Editar perfil"/);
  // Linguagem de plataforma territorial, como as demais telas do perfil.
  assert.doesNotMatch(screen, /rede\s+social|redes\s+sociais|facebook|orkut|\brecados?\b|mural|\bcurtidas?\b|\bcurtir\b/i);
});

test("o cadastro continua sem telefone e o inventário de privacidade separa o contato do perfil", () => {
  const register = read("src/components/RegisterDialog.tsx");
  assert.doesNotMatch(register, /phone|Celular|type="tel"/i);

  const privacy = read("src/lib/app/privacy.ts");
  assert.match(privacy, /group: "Perfil: contato",\s*fields: \["telefone", "estado"\][\s\S]*?visibility: "privado"/);
  assert.doesNotMatch(privacy, /fields: \["nome", "bio", "foto e capa", "situação", "bairro", "cidade", "estado", "telefone"/);
});
