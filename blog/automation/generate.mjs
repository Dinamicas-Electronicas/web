#!/usr/bin/env node
/**
 * Generador del blog automático de Dinámicas Electrónicas.
 *
 * Lee los commits de los repositorios del proyecto, agrupa los cambios
 * relevantes por repositorio y periodo, y publica un resumen en español e
 * inglés con su feed RSS. No tiene dependencias externas.
 *
 * Uso:
 *   node blog/automation/generate.mjs [--days 30] [--local-root DIR] [--dry-run]
 *
 * En GitHub Actions los repositorios se clonan de forma superficial. En local
 * se puede usar --local-root para leer los clones que ya existen en disco.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, "blog/automation/repos.json"), "utf8"));
const BASE_URL = CONFIG.site.baseUrl.replace(/\/$/, "");
const BASE_PATH = new URL(BASE_URL).pathname.replace(/\/$/, "");
const STATE_FILE = path.join(ROOT, "blog/data/posts.json");
const TOKEN = process.env.BLOG_GITHUB_TOKEN || process.env.GITHUB_TOKEN || "";
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date();
const TODAY = isoDate(NOW);

const GROUPS = ["feat", "fix", "perf", "refactor", "docs", "other"];
const KNOWN_TYPES = new Set(["feat", "fix", "perf", "refactor", "docs"]);
const SKIP_TYPES = new Set(["chore", "ci", "build", "test", "style", "revert", "merge", "debug", "wip"]);
const SKIP_SUBJECTS = [
  /^(varios?|cambios?|changes|misc|updates?)$/i,
  /^(muchos|mont[oó]n de) (cambios|cosas)/i,
  /^initial commit$/i,
  /^update print statement/i,
  /^wip\b/i,
  /^debug\b/i,
  /^merge\b/i,
  /^(revert|fixup|squash)\b/i,
];

const TEXT = {
  es: {
    lang: "es",
    locale: "es-ES",
    blogTitle: "Blog y novedades técnicas",
    blogDescription:
      "Resúmenes automáticos de las mejoras publicadas en los repositorios que forman el proyecto de la web.",
    empty: "Todavía no hay entradas. El primer resumen se publicará cuando haya cambios en los repositorios.",
    feedTitle: "Blog de Dinámicas Electrónicas",
    feedDescription: "Novedades técnicas generadas a partir de los repositorios del proyecto.",
    breadcrumbBlog: "Blog",
    eyebrow: (name) => `Novedades de ${name}`,
    title: (name, range) => `${name}: novedades del ${range}`,
    metaDescription: (name, n, from, to) =>
      `Resumen automático de ${n} ${n === 1 ? "cambio" : "cambios"} publicados en ${name} entre el ${from} y el ${to}.`,
    intro: (name, from, to) =>
      `Resumen automático de los cambios publicados en el repositorio de ${name} entre el ${from} y el ${to}. Se genera a partir de los mensajes de commit; el detalle técnico está en el repositorio.`,
    repoLink: "Ver historial completo",
    projectLink: "Ficha del proyecto",
    changes: "cambios",
    more: (n) => `y ${n} ${n === 1 ? "cambio más" : "cambios más"} en el repositorio`,
    note:
      "Este artículo se ha generado automáticamente a partir del historial de Git y no sustituye a las notas de versión del proyecto.",
    originalLanguage: "",
    dates: (from, to) => `Del ${from} al ${to}`,
    groups: {
      feat: "Nuevas funcionalidades",
      fix: "Correcciones",
      perf: "Rendimiento",
      refactor: "Refactorización",
      docs: "Documentación",
      other: "Otros cambios",
    },
    counts: {
      feat: ["nueva funcionalidad", "nuevas funcionalidades"],
      fix: ["corrección", "correcciones"],
      perf: ["mejora de rendimiento", "mejoras de rendimiento"],
      refactor: ["refactorización", "refactorizaciones"],
      docs: ["cambio en documentación", "cambios en documentación"],
      other: ["otro cambio", "otros cambios"],
    },
  },
  en: {
    lang: "en",
    locale: "en-US",
    blogTitle: "Blog and technical news",
    blogDescription:
      "Automatic summaries of the improvements published in the repositories that make up the website project.",
    empty: "No posts yet. The first summary will be published once the repositories receive changes.",
    feedTitle: "Dinámicas Electrónicas Blog",
    feedDescription: "Technical news generated from the project repositories.",
    breadcrumbBlog: "Blog",
    eyebrow: (name) => `${name} updates`,
    title: (name, range) => `${name}: updates for ${range}`,
    metaDescription: (name, n, from, to) =>
      `Automatic summary of ${n} ${n === 1 ? "change" : "changes"} published in ${name} between ${from} and ${to}.`,
    intro: (name, from, to) =>
      `Automatic summary of the changes published in the ${name} repository between ${from} and ${to}. It is generated from commit messages; technical details live in the repository.`,
    repoLink: "View full history",
    projectLink: "Project page",
    changes: "changes",
    more: (n) => `and ${n} more ${n === 1 ? "change" : "changes"} in the repository`,
    note:
      "This article was generated automatically from the Git history and does not replace the project release notes.",
    originalLanguage: "Commit messages are shown as published in the repository.",
    dates: (from, to) => `From ${from} to ${to}`,
    groups: {
      feat: "New features",
      fix: "Fixes",
      perf: "Performance",
      refactor: "Refactoring",
      docs: "Documentation",
      other: "Other changes",
    },
    counts: {
      feat: ["feature", "features"],
      fix: ["fix", "fixes"],
      perf: ["performance improvement", "performance improvements"],
      refactor: ["refactoring", "refactorings"],
      docs: ["documentation change", "documentation changes"],
      other: ["other change", "other changes"],
    },
  },
};

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  console.log(`Generador del blog automático

  --days N          Días iniciales a revisar si todavía no hay estado
  --local-root DIR  Lee los repositorios desde clones locales (DIR/<slug>)
  --dry-run         Muestra lo que se publicaría sin escribir archivos
  --help            Muestra esta ayuda
`);
  process.exit(0);
}

main();

function main() {
  const posts = readState();
  const created = [];
  const clonedDirs = [];

  for (const repo of CONFIG.repos) {
    const previous = posts
      .filter((post) => post.repo === repo.slug)
      .sort((a, b) => new Date(b.to) - new Date(a.to))[0];

    const isSameDay = previous && previous.date === TODAY;
    const since = previous
      ? new Date(new Date(previous.to).getTime() + 1000)
      : new Date(NOW.getTime() - (options.days ?? CONFIG.initialDays) * DAY);

    let commits;
    try {
      commits = collectCommits(repo, since, NOW, clonedDirs);
    } catch (error) {
      throw new Error(`No se pudo leer el historial de ${repo.repo}: ${error.message}`);
    }

    if (commits.length === 0) {
      log(`· ${repo.name}: sin cambios relevantes desde ${isoDate(since)}`);
      continue;
    }

    const limited = commits.slice(0, CONFIG.maxCommitsPerPost);
    const hidden = commits.length - limited.length;

    if (isSameDay) {
      const seen = new Set(previous.commits.map((commit) => commit.sha));
      const fresh = limited.filter((commit) => !seen.has(commit.sha));
      if (fresh.length === 0) {
        log(`· ${repo.name}: los cambios de hoy ya estaban publicados`);
        continue;
      }
      previous.commits = [...fresh, ...previous.commits].slice(0, CONFIG.maxCommitsPerPost);
      previous.to = NOW.toISOString();
      previous.hidden = Math.max(0, commits.length + (previous.hidden || 0) - fresh.length);
      created.push(previous);
      log(`· ${repo.name}: ${fresh.length} ${fresh.length === 1 ? "cambio añadido" : "cambios añadidos"} a la entrada de hoy`);
      continue;
    }

    const post = {
      slug: `${TODAY}-${repo.slug}`,
      repo: repo.slug,
      repoName: repo.name,
      repoUrl: `https://github.com/${repo.repo}`,
      projectPath: repo.projectPath,
      projectPathEn: repo.projectPathEn || repo.projectPath,
      date: TODAY,
      from: isoDate(since),
      to: NOW.toISOString(),
      hidden,
      commits: limited,
    };

    posts.push(post);
    created.push(post);
    log(
      `· ${repo.name}: ${commits.length} ${commits.length === 1 ? "cambio relevante" : "cambios relevantes"} (${isoDate(since)} → ${TODAY})`,
    );
  }

  cleanup(clonedDirs);

  posts.sort((a, b) => new Date(b.to) - new Date(a.to));

  if (created.length === 0) {
    log("Sin novedades nuevas: se regeneran las páginas con el estado actual.");
  }

  if (options.dryRun) {
    for (const post of created) {
      console.log(`\n[${TEXT.es.lang}/${TEXT.en.lang}] ${post.slug}`);
      console.log(`  ${titleFor(post, "es")}`);
      for (const commit of post.commits) {
        console.log(`  - ${commit.sha} [${commit.type}] ${commit.scope ? `(${commit.scope}) ` : ""}${commit.subject}`);
      }
    }
    console.log("\nDry run: no se ha escrito nada.");
    return;
  }

  writeIfChanged(STATE_FILE, `${JSON.stringify(posts, null, 2)}\n`);

  for (const post of posts) {
    for (const lang of ["es", "en"]) {
      const file = path.join(ROOT, lang === "en" ? "en/blog" : "blog", post.slug, "index.html");
      writeIfChanged(file, renderPost(post, lang));
    }
  }

  for (const lang of ["es", "en"]) {
    const file = lang === "es" ? "blog/index.html" : "en/blog/index.html";
    writeIfChanged(path.join(ROOT, file), renderIndex(posts, lang));
    const feedFile = lang === "es" ? "blog/feed.xml" : "en/blog/feed.xml";
    writeIfChanged(path.join(ROOT, feedFile), renderFeed(posts, lang));
  }

  log(`Publicadas ${created.length} ${created.length === 1 ? "entrada nueva" : "entradas nuevas"}.`);
}

/* --------------------------------------------------------------------------
   Git
   -------------------------------------------------------------------------- */

function collectCommits(repo, since, until, clonedDirs) {
  let dir;
  if (options.localRoot) {
    dir = path.join(path.resolve(options.localRoot), repo.slug);
    if (!fs.existsSync(dir)) throw new Error(`no existe el clon local ${dir}`);
  } else {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), `blog-${repo.slug}-`));
    clonedDirs.push(dir);
    cloneRepo(repo, dir, since);
  }

  const format = "--pretty=format:%H%x1f%aI%x1f%s";
  let output;
  try {
    output = execFileSync(
      "git",
      ["-C", dir, "log", `--since=${since.toISOString()}`, `--until=${until.toISOString()}`, "--no-merges", format],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (error) {
    const stderr = String(error.stderr || "");
    if (/does not have any commits|no commits yet|no tiene ningún commit|no tiene commits|ambiguous argument 'HEAD'/i.test(stderr)) {
      return [];
    }
    throw error;
  }

  return output
    .split("\n")
    .map((line) => parseCommit(line, `https://github.com/${repo.repo}`))
    .filter(Boolean)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function cloneRepo(repo, dir, since) {
  const url = remoteUrl(repo);
  const base = ["clone", "--quiet", "--filter=blob:none", "--no-checkout"];
  try {
    execFileSync("git", [...base, `--shallow-since=${since.toISOString()}`, url, dir], {
      stdio: ["ignore", "ignore", "pipe"],
    });
  } catch {
    fs.rmSync(dir, { recursive: true, force: true });
    execFileSync("git", [...base, url, dir], { stdio: ["ignore", "ignore", "pipe"] });
  }
}

function remoteUrl(repo) {
  if (!TOKEN) return `https://github.com/${repo.repo}.git`;
  return `https://x-access-token:${encodeURIComponent(TOKEN)}@github.com/${repo.repo}.git`;
}

function parseCommit(line, repoUrl) {
  if (!line.trim()) return null;
  const [sha, date, ...rest] = line.split("\x1f");
  const rawSubject = rest.join("\x1f").trim();
  if (!sha || !rawSubject || rawSubject.length < 8) return null;
  if (SKIP_SUBJECTS.some((pattern) => pattern.test(rawSubject))) return null;

  let type = "other";
  let scope = null;
  let subject = rawSubject;

  const match = rawSubject.match(/^([a-z]+)(?:\(([^)]+)\))?!?:\s+(.+)$/i);
  if (match) {
    const candidate = match[1].toLowerCase();
    if (SKIP_TYPES.has(candidate)) return null;
    if (KNOWN_TYPES.has(candidate)) {
      type = candidate;
      scope = match[2] || null;
      subject = match[3].trim();
    }
  }

  if (subject.length < 6) return null;

  return {
    sha: sha.slice(0, 7),
    date: date.slice(0, 10),
    type,
    scope,
    subject,
    url: `${repoUrl}/commit/${sha}`,
  };
}

/* --------------------------------------------------------------------------
   Estado
   -------------------------------------------------------------------------- */

function readState() {
  if (!fs.existsSync(STATE_FILE)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    if (!Array.isArray(parsed)) throw new Error("el estado no es una lista");
    return parsed.filter((post) => post && post.slug && Array.isArray(post.commits));
  } catch (error) {
    throw new Error(`Estado del blog inválido en ${STATE_FILE}: ${error.message}`);
  }
}

/* --------------------------------------------------------------------------
   Render
   -------------------------------------------------------------------------- */

function renderPost(post, lang) {
  const shell = shellFor(lang);
  const text = TEXT[lang];
  const url = pageUrl(lang, `/blog/${post.slug}/`);
  const esUrl = pageUrl("es", `/blog/${post.slug}/`);
  const enUrl = pageUrl("en", `/blog/${post.slug}/`);
  const from = fmtLong(post.from, lang);
  const to = fmtLong(post.date, lang);
  const title = titleFor(post, lang);
  const description = text.metaDescription(post.repoName, post.commits.length, from, to);

  const html = applyHead(shell, {
    lang,
    title: `${title} · ${CONFIG.site.name}`,
    description,
    url,
    esUrl,
    enUrl,
    ogType: "article",
    published: post.date,
  });

  const groups = GROUPS.map((type) => ({
    type,
    label: text.groups[type],
    commits: post.commits.filter((commit) => commit.type === type),
  })).filter((group) => group.commits.length > 0);

  const body = [
    `<nav class="container breadcrumbs" aria-label="${lang === "es" ? "Migas de pan" : "Breadcrumb"}">`,
    `<a href="${hrefFor(lang, "/blog/")}">${esc(text.breadcrumbBlog)}</a> <span aria-hidden="true">/</span> <span>${esc(post.repoName)}</span>`,
    `</nav>`,
    `<article class="section">`,
    `<div class="container prose">`,
    `<p class="section__eyebrow">${esc(text.eyebrow(post.repoName))}</p>`,
    `<h1 class="post__title">${esc(title)}</h1>`,
    `<p class="post__meta"><time datetime="${post.date}">${esc(to)}</time> · ${post.commits.length} ${esc(text.changes)} · <a href="${post.repoUrl}" rel="noopener noreferrer" target="_blank">${esc(post.repoName)}</a></p>`,
    `<p>${esc(text.intro(post.repoName, from, to))}</p>`,
    lang === "en" ? `<p class="text-muted">${esc(text.originalLanguage)}</p>` : "",
    ...groups.map(renderGroup),
    post.hidden > 0 ? `<p class="text-muted">${esc(text.more(post.hidden))}</p>` : "",
    `<p class="text-muted">${esc(text.note)}</p>`,
    `<p><a class="btn btn--ghost" href="${hrefFor(lang, projectPathFor(post, lang))}">${esc(text.projectLink)}</a> <a class="btn btn--ghost" href="${post.repoUrl}" rel="noopener noreferrer" target="_blank">${esc(text.repoLink)}</a></p>`,
    `</div>`,
    `</article>`,
  ]
    .filter(Boolean)
    .join(" ");

  return replaceMain(html, body);
}

function renderGroup(group) {
  return [
    `<h2>${esc(group.label)}</h2>`,
    `<ul class="commit-list">`,
    ...group.commits.map(
      (commit) =>
        `<li><a href="${commit.url}" rel="noopener noreferrer" target="_blank"><code>${esc(commit.sha)}</code></a> ${
          commit.scope ? `<span class="commit-scope">${esc(commit.scope)}</span> ` : ""
        }${esc(commit.subject)}</li>`,
    ),
    `</ul>`,
  ].join("");
}

function renderIndex(posts, lang) {
  const text = TEXT[lang];
  const base = shellFor(lang);
  const description =
    lang === "es"
      ? "Resúmenes automáticos de las mejoras publicadas en los repositorios de Expanse, RSS2, ChatLand y Vuigram."
      : "Automatic summaries of the improvements published in the Expanse, RSS2, ChatLand and Vuigram repositories.";

  const html = applyHead(base, {
    lang,
    title: `Blog · ${CONFIG.site.name}`,
    description,
    url: pageUrl(lang, "/blog/"),
    esUrl: pageUrl("es", "/blog/"),
    enUrl: pageUrl("en", "/blog/"),
    ogType: "website",
  });

  const cards = posts.map((post) => {
    const href = hrefFor(lang, `/blog/${post.slug}/`);
    const hidden = post.hidden ? ` · ${post.hidden} ${lang === "es" ? "más" : "more"}` : "";
    return [
      `<li><a class="post-card" href="${href}">`,
      `<p class="post-card__meta"><time datetime="${post.date}">${esc(fmtShort(post.date, lang))}</time> · ${esc(post.repoName)}</p>`,
      `<h2 class="post-card__title">${esc(titleFor(post, lang))}</h2>`,
      `<p class="post-card__summary">${esc(countsLabel(post.commits, lang) + hidden)}</p>`,
      `</a></li>`,
    ].join("");
  });

  const cta =
    lang === "es"
      ? `<section class="section section--tight"> <div class="container cta"> <h2 class="cta__title">¿Te gustaría construir junto a nosotros?</h2> <p class="cta__text">Colaboraciones técnicas, pilotos, consultorías o simplemente una conversación sobre tecnología independiente.</p> <a class="btn btn--primary" href="/web/colaborar/">Ir a la colaboración</a> </div> </section>`
      : `<section class="section section--tight"> <div class="container cta"> <h2 class="cta__title">Want to build together with us?</h2> <p class="cta__text">Technical collaboration, pilots, professional consulting, or simply a conversation about independent technology.</p> <a class="btn btn--primary" href="/web/en/contribute/">Go to collaboration</a> </div> </section>`;

  const body = [
    `<section class="section"> <div class="container">`,
    `<p class="section__eyebrow">Blog</p>`,
    `<h1 class="section__title">${esc(text.blogTitle)}</h1>`,
    `<p class="section__description">${esc(text.blogDescription)}</p>`,
    `</div></section>`,
    `<div class="container">`,
    cards.length > 0
      ? `<ul class="post-grid">${cards.join("")}</ul>`
      : `<p class="text-muted">${esc(text.empty)}</p>`,
    `</div>`,
    `<section class="section section--tight"> <div class="container"> <p class="text-muted">${esc(
      lang === "es"
        ? `Feed RSS disponible en ${hrefFor(lang, "/blog/feed.xml")}.`
        : `RSS feed available at ${hrefFor(lang, "/blog/feed.xml")}.`,
    )}</p> </div></section>`,
    cta,
  ].join(" ");

  return replaceMain(html, body);
}

function renderFeed(posts, lang) {
  const text = TEXT[lang];
  const items = posts.slice(0, 30).map((post) => {
    const url = pageUrl(lang, `/blog/${post.slug}/`);
    const pubDate = new Date(`${post.date}T12:00:00Z`).toUTCString();
    return [
      `<item>`,
      `<title>${escXml(titleFor(post, lang))}</title>`,
      `<link>${escXml(url)}</link>`,
      `<guid isPermaLink="true">${escXml(url)}</guid>`,
      `<pubDate>${pubDate}</pubDate>`,
      `<description>${escXml(countsLabel(post.commits, lang))}</description>`,
      `</item>`,
    ].join("");
  });

  const lastBuild = posts.length > 0 ? new Date(`${posts[0].date}T12:00:00Z`).toUTCString() : new Date().toUTCString();

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${escXml(text.feedTitle)}</title>
<link>${escXml(pageUrl(lang, "/blog/"))}</link>
<description>${escXml(text.feedDescription)}</description>
<language>${lang}</language>
<lastBuildDate>${lastBuild}</lastBuildDate>
<atom:link href="${escXml(pageUrl(lang, "/blog/feed.xml"))}" rel="self" type="application/rss+xml"/>
${items.join("\n")}
</channel>
</rss>
`;
}

/* --------------------------------------------------------------------------
   Shell y cabecera
   -------------------------------------------------------------------------- */

function shellFor(lang) {
  return fs.readFileSync(path.join(ROOT, lang === "en" ? "en/blog/index.html" : "blog/index.html"), "utf8");
}

function replaceMain(html, content) {
  return html.replace(/<main id="main-content">[\s\S]*?<\/main>/, `<main id="main-content"> ${content} </main>`);
}

function applyHead(html, opts) {
  const text = TEXT[opts.lang];
  let out = html.replace(/<html lang="[^"]*"/, `<html lang="${opts.lang}"`);
  out = out.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(opts.title)}</title>`);

  const meta = {
    description: opts.description,
    "og:title": opts.title,
    "og:description": opts.description,
    "og:url": opts.url,
    "og:type": opts.ogType,
    "og:locale": opts.lang === "es" ? "es_ES" : "en_US",
    "twitter:title": opts.title,
    "twitter:description": opts.description,
  };

  out = out.replace(/<meta (name|property)="([^"]+)" content="[^"]*">/g, (match, attribute, key) =>
    Object.prototype.hasOwnProperty.call(meta, key) ? `<meta ${attribute}="${key}" content="${esc(meta[key])}">` : match,
  );

  out = out.replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${esc(opts.url)}">`);
  out = out.replace(
    /<link rel="alternate" hreflang="es" href="[^"]*">/,
    `<link rel="alternate" hreflang="es" href="${esc(opts.esUrl)}">`,
  );
  out = out.replace(
    /<link rel="alternate" hreflang="en" href="[^"]*">/,
    `<link rel="alternate" hreflang="en" href="${esc(opts.enUrl)}">`,
  );
  out = out.replace(
    /<link rel="alternate" hreflang="x-default" href="[^"]*">/,
    `<link rel="alternate" hreflang="x-default" href="${esc(opts.esUrl)}">`,
  );

  out = out.replace(/ <div class="language-switcher">[\s\S]*?<\/div>/, ` ${languageSwitcher(opts.lang, opts.esUrl, opts.enUrl)}`);

  const feedHref = pageUrl(opts.lang, "/blog/feed.xml");
  const feedTag = `<link rel="alternate" type="application/rss+xml" title="${esc(text.feedTitle)}" href="${esc(feedHref)}">`;
  if (out.includes('type="application/rss+xml"')) {
    out = out.replace(/<link rel="alternate" type="application\/rss\+xml"[^>]*>/, feedTag);
  } else {
    out = out.replace("</head>", `${feedTag}</head>`);
  }

  if (opts.published) {
    const tag = `<meta property="article:published_time" content="${opts.published}T12:00:00Z">`;
    if (out.includes('property="article:published_time"')) {
      out = out.replace(/<meta property="article:published_time"[^>]*>/, tag);
    } else {
      out = out.replace("</head>", `${tag}</head>`);
    }
  }

  return out;
}

function languageSwitcher(lang, esUrl, enUrl) {
  const esActive = lang === "es";
  return `<div class="language-switcher"> <a href="${esc(relativeUrl(esUrl))}" class="language-switcher__link${
    esActive ? " is-active" : ""
  }"${esActive ? ' aria-current="true"' : ""} lang="es">
ES
</a> <a href="${esc(relativeUrl(enUrl))}" class="language-switcher__link${!esActive ? " is-active" : ""}"${
    !esActive ? ' aria-current="true"' : ""
  } lang="en">
EN
</a> </div>`;
}

function relativeUrl(url) {
  return url.startsWith(BASE_URL) ? `${BASE_PATH}${url.slice(BASE_URL.length)}` : url;
}

/* --------------------------------------------------------------------------
   Utilidades
   -------------------------------------------------------------------------- */

function projectPathFor(post, lang) {
  if (lang === "es") return post.projectPath;
  return post.projectPathEn || post.projectPath.replace(/^\/proyectos\//, "/projects/");
}

function titleFor(post, lang) {
  return TEXT[lang].title(post.repoName, rangeLabel(post.from, post.date, lang));
}

function countsLabel(commits, lang) {
  const text = TEXT[lang];
  const parts = [];
  for (const type of GROUPS) {
    const count = commits.filter((commit) => commit.type === type).length;
    if (count === 0) continue;
    const [one, many] = text.counts[type];
    parts.push(`${count} ${count === 1 ? one : many}`);
  }
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} ${lang === "es" ? "y" : "and"} ${parts[parts.length - 1]}`;
}

function rangeLabel(from, to, lang) {
  return `${fmtShort(from, lang)} – ${fmtShort(to, lang)}`;
}

function fmtShort(date, lang) {
  return new Intl.DateTimeFormat(TEXT[lang].locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(parseDate(date));
}

function fmtLong(date, lang) {
  return new Intl.DateTimeFormat(TEXT[lang].locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parseDate(date));
}

function parseDate(date) {
  return new Date(`${date}T12:00:00Z`);
}

function isoDate(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function pageUrl(lang, relative) {
  return `${BASE_URL}${lang === "en" ? "/en" : ""}${relative}`;
}

function hrefFor(lang, relative) {
  return `${BASE_PATH}${lang === "en" ? "/en" : ""}${relative}`;
}

function writeIfChanged(file, content) {
  const previous = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  if (previous === content) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  log(`  escrito ${path.relative(ROOT, file)}`);
}

function cleanup(dirs) {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
}

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escXml(value) {
  return esc(value);
}

function log(message) {
  console.log(message);
}

function parseArgs(args) {
  const result = { days: undefined, localRoot: undefined, dryRun: false, help: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--days") result.days = Number(args[++index]);
    else if (argument === "--local-root") result.localRoot = args[++index];
    else if (argument === "--dry-run") result.dryRun = true;
    else if (argument === "--help" || argument === "-h") result.help = true;
    else throw new Error(`Argumento no reconocido: ${argument}`);
  }
  if (result.days !== undefined && (!Number.isFinite(result.days) || result.days <= 0)) {
    throw new Error("--days debe ser un número positivo");
  }
  return result;
}
