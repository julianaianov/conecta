import { pathToFileURL } from "node:url";

const CANONICAL_HOST = "dmconecta.org";
const STABLE_PUBLIC_PATHS = [
  "/",
  "/feed",
  "/mapa",
  "/ranking",
  "/conexoes",
  "/politica-de-privacidade",
  "/seguranca-infantil",
];
const PRIVATE_PATH_PATTERN = /\/admin|\/meus-apoios|\/conexoes\/nova|\/apoiar/;

function decodeEntities(value) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function textContent(value) {
  return decodeEntities(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function tagAttribute(tag, name) {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return match?.[1] ?? null;
}

function firstTagText(html, tagName) {
  const match = html.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)</${tagName}>`, "i"));
  return match ? textContent(match[1]) : "";
}

function canonicalHref(html) {
  const link = html.match(/<link\b[^>]*\brel\s*=\s*["']canonical["'][^>]*>/i);
  return link ? tagAttribute(link[0], "href") : null;
}

export function inspectHtml(html) {
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html;
  const visibleBody = body
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ");
  const robots = html.match(/<meta\b[^>]*\bname\s*=\s*["']robots["'][^>]*>/i)?.[0] ?? "";
  const content = tagAttribute(robots, "content") ?? "";

  return {
    title: firstTagText(html, "title"),
    h1: firstTagText(visibleBody, "h1"),
    canonical: canonicalHref(html),
    noindex: /\bnoindex\b/i.test(content),
    bodyText: textContent(visibleBody),
  };
}

export async function auditPublicPage(baseUrl, pathname) {
  const url = new URL(pathname, baseUrl);
  const response = await fetch(url, { redirect: "manual" });
  const html = await response.text();
  return {
    path: pathname,
    status: response.status,
    location: response.headers.get("location"),
    ...inspectHtml(html),
  };
}

function assertPublicPage(result) {
  if (result.status < 200 || result.status >= 300) throw new Error(`${result.path}: expected 2xx, got ${result.status}`);
  if (result.location?.includes("/login")) throw new Error(`${result.path}: redirected to login`);
  if (result.noindex) throw new Error(`${result.path}: contains noindex`);
  if (!result.title || !result.h1 || !result.canonical || !result.bodyText) {
    throw new Error(`${result.path}: missing title, h1, canonical or visible body text`);
  }
  if (new URL(result.canonical).hostname !== CANONICAL_HOST) {
    throw new Error(`${result.path}: canonical host is ${new URL(result.canonical).hostname}`);
  }
}

async function auditSite(baseUrl) {
  const paths = [...STABLE_PUBLIC_PATHS];
  if (process.env.SEO_AUDIT_POST_ID) paths.push(`/post/${encodeURIComponent(process.env.SEO_AUDIT_POST_ID)}`);
  if (process.env.SEO_AUDIT_PROFILE_ID) paths.push(`/perfil/${encodeURIComponent(process.env.SEO_AUDIT_PROFILE_ID)}`);

  for (const pathname of paths) assertPublicPage(await auditPublicPage(baseUrl, pathname));

  const robotsResponse = await fetch(new URL("/robots.txt", baseUrl));
  const robotsText = await robotsResponse.text();
  if (!robotsResponse.ok || !/sitemap:\s*https:\/\/dmconecta\.org\/sitemap\.xml/i.test(robotsText)) {
    throw new Error("/robots.txt: missing canonical sitemap");
  }

  const sitemapResponse = await fetch(new URL("/sitemap.xml", baseUrl));
  const sitemapText = await sitemapResponse.text();
  if (!sitemapResponse.ok || !/<urlset\b/i.test(sitemapText) || PRIVATE_PATH_PATTERN.test(sitemapText)) {
    throw new Error("/sitemap.xml: invalid XML or private path present");
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const baseUrl = process.env.SEO_AUDIT_BASE_URL ?? "http://127.0.0.1:3000";
  auditSite(baseUrl)
    .then(() => console.log(`SEO audit passed for ${baseUrl}`))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
