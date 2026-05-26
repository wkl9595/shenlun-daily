import Parser from "rss-parser";
import { readFile, writeFile } from "node:fs/promises";

const parser = new Parser();
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

function isWithinLast24Hours(pubDate) {
  if (!pubDate) return true; // keep if no date
  const now = Date.now();
  const ms = new Date(pubDate).getTime();
  return now - ms < 24 * 60 * 60 * 1000;
}

export async function fetchArticles(feeds) {
  const fetchedUrls = await loadFetchedUrls();
  const newUrls = new Set();
  const articles = [];

  for (const feed of feeds) {
    if (feed.enabled === false) continue;
    try {
      const parsed = await parser.parseURL(feed.url);
      for (const item of parsed.items) {
        const url = item.link || item.guid;
        if (!url) continue;
        if (fetchedUrls.has(url)) continue;
        if (!isWithinLast24Hours(item.pubDate)) continue;

        const content = item.contentSnippet || item.content || item.summary || "";
        articles.push({
          title: item.title?.trim() || "",
          url,
          source: feed.name,
          content: content.replace(/\s+/g, " ").trim(),
          pubDate: item.pubDate || new Date().toISOString(),
        });
        newUrls.add(url);
      }
    } catch (err) {
      console.error(`Failed to fetch ${feed.name} (${feed.url}):`, err.message);
    }
  }

  // Save updated URL set
  const allUrls = new Set([...fetchedUrls, ...newUrls]);
  await saveFetchedUrls(allUrls);

  return articles;
}
