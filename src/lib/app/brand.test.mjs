import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import {
  BRAND_LOADING_MAX_MS,
  BRAND_LOADING_MIN_MS,
  DM_MARK_PATH,
  DM_MARK_TRANSFORM,
  DM_MARK_VIEWBOX,
  brandToneColor,
  shouldDismissBrandLoading,
} from "./brand.ts";

const ICON_SOURCE = readFileSync(new URL("../../app/icon.svg", import.meta.url), "utf8");

test("usa o monograma geométrico oficial como um único desenho vetorial", () => {
  assert.equal(DM_MARK_VIEWBOX, "0 0 158.511491 180.779620");
  assert.match(DM_MARK_TRANSFORM, /scale\(0\.1 -0\.1\)/);
  assert.match(DM_MARK_PATH, /^M783 1798/);
  assert.ok(DM_MARK_PATH.includes("M300 910"));
  assert.ok(!DM_MARK_PATH.includes("DM"));
});

test("a abertura sai quando o site termina, fica offline ou atinge o fallback", () => {
  assert.equal(shouldDismissBrandLoading("page-finished"), true);
  assert.equal(shouldDismissBrandLoading("offline"), true);
  assert.equal(shouldDismissBrandLoading("timeout"), true);
  assert.equal(shouldDismissBrandLoading("page-started"), false);
  assert.equal(BRAND_LOADING_MAX_MS, 12000);
  assert.equal(shouldDismissBrandLoading("page-finished", 1000), false);
  assert.equal(shouldDismissBrandLoading("page-finished", BRAND_LOADING_MIN_MS), true);
});

test("o favicon usa a mesma geometria oficial e não o símbolo padrão do Next", () => {
  assert.ok(ICON_SOURCE.includes(DM_MARK_PATH));
  assert.match(ICON_SOURCE, /fill="#000"/);
  assert.doesNotMatch(ICON_SOURCE, /vercel|triangle|chain/i);
  assert.ok(statSync(new URL("../../app/favicon.ico", import.meta.url)).size > 0);
});

test("o wordmark mantém contraste quando a marca está sobre fundo escuro", () => {
  assert.equal(brandToneColor("light"), "#FFFFFF");
  assert.equal(brandToneColor("petroleo"), "#1B4F72");
  assert.equal(brandToneColor("plain"), "inherit");
});
