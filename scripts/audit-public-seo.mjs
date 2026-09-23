export function inspectHtml(html) {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : null;

  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const h1 = h1Match ? h1Match[1].replace(/<[^>]+>/g, "").trim() : null;

  const canonicalMatch =
    html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) ||
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
  const canonical = canonicalMatch ? canonicalMatch[1] : null;

  const robotsMatch =
    html.match(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']robots["']/i);
  const robots = robotsMatch ? robotsMatch[1] : "";
  const noindex = robots.toLowerCase().includes("noindex");

  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const rawBody = bodyMatch ? bodyMatch[1] : html;
  const bodyText = rawBody
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { title, h1, canonical, noindex, bodyText };
}

export async function auditPublicPage(baseUrl, path) {
  const url = new URL(path, baseUrl).toString();
  const res = await fetch(url, { redirect: "manual" });
  const status = res.status;
  const location = res.headers.get("location");
  let title = null;
  let h1 = null;
  let canonical = null;
  let noindex = false;
  let bodyText = "";

  if (status === 200) {
    const html = await res.text();
    const inspected = inspectHtml(html);
    title = inspected.title;
    h1 = inspected.h1;
    canonical = inspected.canonical;
    noindex = inspected.noindex;
    bodyText = inspected.bodyText;
  }

  return { path, status, location, title, h1, canonical, noindex, bodyText };
}

export async function runAudit(baseUrl = process.env.SEO_AUDIT_BASE_URL || "http://127.0.0.1:3000") {
  const postId = process.env.SEO_AUDIT_POST_ID;
  const profileId = process.env.SEO_AUDIT_PROFILE_ID;

  const publicRoutes = [
    "/",
    "/feed",
    "/mapa",
    "/ranking",
    "/conexoes",
    "/politica-de-privacidade",
    "/seguranca-infantil",
  ];

  if (postId) {
    publicRoutes.push(`/post/${postId}`);
  }
  if (profileId) {
    publicRoutes.push(`/perfil/${profileId}`);
  }

  let failed = false;

  console.log(`Auditing public SEO surfaces at ${baseUrl}...`);

  for (const path of publicRoutes) {
    const audit = await auditPublicPage(baseUrl, path);
    if (audit.status !== 200) {
      console.error(`❌ [${path}] Expected 200, got ${audit.status} (location: ${audit.location})`);
      failed = true;
      continue;
    }
    if (audit.noindex) {
      console.error(`❌ [${path}] Route has noindex meta tag`);
      failed = true;
      continue;
    }
    if (!audit.title) {
      console.error(`❌ [${path}] Missing <title>`);
      failed = true;
      continue;
    }
    if (!audit.canonical) {
      console.error(`❌ [${path}] Missing canonical link`);
      failed = true;
      continue;
    }
    if (!audit.h1) {
      console.error(`❌ [${path}] Missing <h1> element`);
      failed = true;
      continue;
    }
    if (!audit.bodyText || audit.bodyText.length < 10) {
      console.error(`❌ [${path}] Empty or insufficient body text`);
      failed = true;
      continue;
    }
    console.log(`✓ [${path}] 200 OK | Title: "${audit.title}" | H1: "${audit.h1}" | Canonical: ${audit.canonical}`);
  }

  // Check /robots.txt
  const robotsRes = await fetch(new URL("/robots.txt", baseUrl).toString());
  if (robotsRes.status !== 200) {
    console.error(`❌ [/robots.txt] Expected 200, got ${robotsRes.status}`);
    failed = true;
  } else {
    const robotsTxt = await robotsRes.text();
    if (!robotsTxt.includes("https://dmconecta.org/sitemap.xml")) {
      console.error(`❌ [/robots.txt] Missing canonical sitemap reference`);
      failed = true;
    } else {
      console.log(`✓ [/robots.txt] 200 OK | Sitemap referenced correctly`);
    }
  }

  // Check /sitemap.xml
  const sitemapRes = await fetch(new URL("/sitemap.xml", baseUrl).toString());
  if (sitemapRes.status !== 200) {
    console.error(`❌ [/sitemap.xml] Expected 200, got ${sitemapRes.status}`);
    failed = true;
  } else {
    const sitemapXml = await sitemapRes.text();
    if (!sitemapXml.includes("https://dmconecta.org/feed")) {
      console.error(`❌ [/sitemap.xml] Missing /feed in sitemap`);
      failed = true;
    }
    if (/\/admin|\/meus-apoios|\/conexoes\/nova|\/apoiar/.test(sitemapXml)) {
      console.error(`❌ [/sitemap.xml] Private paths detected in sitemap`);
      failed = true;
    } else {
      console.log(`✓ [/sitemap.xml] 200 OK | Valid sitemap with no private routes`);
    }
  }

  if (failed) {
    console.error("\nSEO Audit failed.");
    process.exit(1);
  }
  console.log("\nAll public SEO surfaces verified successfully!");
}

if (process.argv[1] && process.argv[1].endsWith("audit-public-seo.mjs")) {
  runAudit().catch((err) => {
    console.error("Audit error:", err);
    process.exit(1);
  });
}
