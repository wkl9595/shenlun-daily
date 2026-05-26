import * as cheerio from "cheerio";
import { readFile, writeFile } from "node:fs/promises";

const FETCHED_URLS_PATH = new URL("../fetched-urls.json", import.meta.url);

async function loadFetchedUrls() {
  try {
    const raw = await readFile(FETCHED_URLS_PATH, "utf-8");
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

async function saveFetchedUrls(urls) {
  await writeFile(FETCHED_URLS_PATH, JSON.stringify([...urls], null, 2));
}

function isWithinLast24Hours(dateStr) {
  if (!dateStr) return true;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return true;
  return Date.now() - d.getTime() < 24 * 60 * 60 * 1000;
}

function extractDateFromUrl(url) {
  const m = url.match(/\/(\d{4})\/(\d{4})/);
  if (m) return `${m[1]}-${m[2].slice(0, 2)}-${m[2].slice(2, 4)}`;
  return null;
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; ShenlunBot/1.0)" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  return cheerio.load(html);
}

// --- Site-specific scrapers ---

async function scrapePeopleOpinion($) {
  const articles = [];
  const seen = new Set();
  $("a[href*='/n1/']").each((_, el) => {
    const $a = $(el);
    let href = $a.attr("href");
    if (!href || seen.has(href)) return;
    const title = ($a.attr("title") || $a.text()).trim();
    if (!title || title.length < 5) return;
    const dateStr = extractDateFromUrl(href);
    if (!dateStr) return;
    if (!href.startsWith("http")) {
      href = "http://opinion.people.com.cn" + href;
    }
    seen.add(href);
    articles.push({ title, url: href, pubDate: dateStr });
  });
  return articles;
}

async function scrapePeoplePolitics($) {
  const articles = [];
  const seen = new Set();
  $("a[href*='/n1/']").each((_, el) => {
    const $a = $(el);
    let href = $a.attr("href");
    if (!href || seen.has(href)) return;
    const title = ($a.attr("title") || $a.text()).trim();
    if (!title || title.length < 5) return;
    const dateStr = extractDateFromUrl(href);
    if (!dateStr) return;
    if (!href.startsWith("http")) {
      href = "http://politics.people.com.cn" + href;
    }
    seen.add(href);
    articles.push({ title, url: href, pubDate: dateStr });
  });
  return articles;
}

async function scrapeXinhuaPolitics($) {
  const articles = [];
  const seen = new Set();
  $("a[href]").each((_, el) => {
    const $a = $(el);
    let href = $a.attr("href");
    if (!href || seen.has(href)) return;
    const dateStr = extractDateFromUrl(href);
    if (!dateStr) return;
    const title = ($a.text() || $a.attr("title")).trim();
    if (!title || title.length < 5) return;
    if (href.startsWith("//")) href = "https:" + href;
    if (!href.startsWith("http")) {
      href = "https://www.news.cn" + (href.startsWith("/") ? "" : "/") + href;
    }
    seen.add(href);
    articles.push({ title, url: href, pubDate: dateStr });
  });
  return articles;
}

async function scrapeQstheory($) {
  const articles = [];
  const seen = new Set();
  $("a[href*='/']").each((_, el) => {
    const $a = $(el);
    let href = $a.attr("href");
    if (!href || seen.has(href)) return;
    const dateStr = extractDateFromUrl(href);
    if (!dateStr) return;
    const title = ($a.attr("title") || $a.text()).trim();
    if (!title || title.length < 5) return;
    if (!href.startsWith("http")) {
      href = "http://www.qstheory.cn" + (href.startsWith("/") ? "" : "/") + href;
    }
    seen.add(href);
    articles.push({ title, url: href, pubDate: dateStr });
  });
  return articles;
}

// Map hostname patterns to scrapers
const SCRAPERS = [
  { pattern: /opinion\.people/, fn: scrapePeopleOpinion },
  { pattern: /politics\.people/, fn: scrapePeoplePolitics },
  { pattern: /people\.com\.cn/, fn: scrapePeoplePolitics },
  { pattern: /news\.cn|news\.xinhuanet|xinhuanet\.com/, fn: scrapeXinhuaPolitics },
  { pattern: /qstheory/, fn: scrapeQstheory },
];

function getScraper(url) {
  for (const s of SCRAPERS) {
    if (s.pattern.test(url)) return s.fn;
  }
  return null;
}

// --- Article content extraction ---

async function fetchArticleContent(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ShenlunBot/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    // Try common content selectors for Chinese news sites
    const selectors = [
      "#rwb_zw", ".text_show", ".box_con", ".article-content",
      ".content", "#article-content", ".post_content", ".art_context",
      "article", ".article", "[class*=content]", "[class*=article]",
    ];
    for (const sel of selectors) {
      const text = $(sel).text().trim();
      if (text && text.length > 200) return text.replace(/\s+/g, " ").trim();
    }

    // Fallback: grab all <p> tags
    const paras = $("p").map((_, el) => $(el).text().trim()).get()
      .filter(t => t.length > 20);
    if (paras.length) return paras.join("\n").replace(/\s+/g, " ").trim();

    return "";
  } catch {
    return "";
  }
}

// --- Main export ---

export async function fetchArticles(feeds) {
  const fetchedUrls = await loadFetchedUrls();
  const newUrls = new Set();
  const articles = [];

  for (const feed of feeds) {
    if (feed.enabled === false) continue;
    const scraper = getScraper(feed.url);
    if (!scraper) {
      console.error(`No scraper for ${feed.name} (${feed.url})`);
      continue;
    }

    try {
      console.log(`  Scraping ${feed.name}...`);
      const $ = await fetchHtml(feed.url);
      const found = await scraper($);

      let added = 0;
      for (const a of found) {
        if (fetchedUrls.has(a.url)) continue;
        if (newUrls.has(a.url)) continue;
        if (!isWithinLast24Hours(a.pubDate)) continue;

        // Fetch full article content
        const content = await fetchArticleContent(a.url);
        if (!content) continue;

        articles.push({
          title: a.title,
          url: a.url,
          source: feed.name,
          content,
          pubDate: a.pubDate,
        });
        newUrls.add(a.url);
        added++;
      }
      console.log(`  ${feed.name}: ${added} new articles`);
    } catch (err) {
      console.error(`Failed to fetch ${feed.name}:`, err.message);
    }
  }

  const allUrls = new Set([...fetchedUrls, ...newUrls]);
  await saveFetchedUrls(allUrls);

  return articles;
}
