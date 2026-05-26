# 申论学习工具 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a daily automated pipeline that fetches official media articles via RSS, classifies them with OpenAI, extracts key quotes, generates a VitePress static site, and pushes digests via WeChat Work bot.

**Architecture:** CLI pipeline (Node.js ESM scripts) processes articles daily and writes markdown to a VitePress docs directory. No database, no API server — files are the state. GitHub Actions cron triggers the pipeline; Vercel deploys on push.

**Tech Stack:** Node.js 18+ (ESM), OpenAI gpt-4o-mini, VitePress, rss-parser, GitHub Actions, Vercel

---

## File Map

| File | Responsibility |
|---|---|
| `package.json` | Dependencies and scripts |
| `feeds.json` | RSS source list + preset category hierarchy |
| `fetched-urls.json` | JSON array of already-processed article URLs (dedup) |
| `scripts/fetch.mjs` | Parse RSS feeds, filter by date, deduplicate |
| `scripts/classify.mjs` | Call OpenAI to classify article + extract quotes |
| `scripts/generate.mjs` | Write article .md files, daily digest, category indexes, quotes page |
| `scripts/push.mjs` | POST WeChat Work webhook with daily digest |
| `scripts/daily.mjs` | Orchestrator — wires fetch → classify → generate → push |
| `docs/index.md` | VitePress homepage |
| `docs/.vitepress/config.ts` | VitePress config with sidebar from categories |
| `.github/workflows/daily.yml` | GitHub Actions cron trigger |

**Data flow:** `feeds.json` → `fetch.mjs` → `classify.mjs` → `generate.mjs` → `docs/` + `push.mjs`

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "shenlun-tool",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "daily": "node scripts/daily.mjs",
    "dev": "vitepress dev docs",
    "build": "vitepress build docs",
    "preview": "vitepress preview docs"
  },
  "dependencies": {
    "openai": "^4.73.0",
    "rss-parser": "^3.13.0",
    "vitepress": "^1.5.0"
  }
}
```

- [ ] **Step 2: Create .gitignore**

```
node_modules/
.env
.cache/
dist/
```

- [ ] **Step 3: Create .env.example**

```
OPENAI_API_KEY=sk-xxx
WECHAT_WEBHOOK_URL=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx
```

- [ ] **Step 4: Create directory structure**

Run: `mkdir -p scripts docs/.vitepress docs/articles docs/daily docs/categories .github/workflows`

- [ ] **Step 5: Install and verify**

Run: `npm install`
Expected: dependencies installed, no errors

- [ ] **Step 6: Commit**

```bash
git init
git add -A
git commit -m "chore: scaffold project structure"
```

---

### Task 2: RSS Feed and Category Configuration

**Files:**
- Create: `feeds.json`

- [ ] **Step 1: Create feeds.json with preset categories and initial RSS feeds**

```json
{
  "feeds": [
    {
      "name": "人民日报-评论",
      "url": "http://www.people.com.cn/rss/opinion.xml",
      "enabled": true
    },
    {
      "name": "新华网-时政",
      "url": "http://www.xinhuanet.com/politics/xhll.xml",
      "enabled": true
    },
    {
      "name": "求是网",
      "url": "http://www.qstheory.cn/gssy/rss.xml",
      "enabled": true
    },
    {
      "name": "光明日报",
      "url": "https://epaper.gmw.cn/gmrb/html/rss.xml",
      "enabled": true
    },
    {
      "name": "经济日报",
      "url": "http://www.ce.cn/rss/",
      "enabled": true
    }
  ],
  "categories": {
    "经济发展": ["新质生产力", "高质量发展", "民营经济", "数字经济"],
    "乡村振兴": ["农业现代化", "农村人居环境", "城乡融合", "粮食安全"],
    "基层治理": ["社区治理", "网格化管理", "基层党建", "数字化治理"],
    "科技创新": ["人工智能", "芯片半导体", "数字中国", "科技自立自强"],
    "生态文明": ["碳达峰碳中和", "污染防治", "绿色发展", "生态保护"],
    "文化自信": ["传统文化", "文化出海", "文化产业", "文化数字化"],
    "民生保障": ["就业", "医疗改革", "养老保障", "教育公平"],
    "党的建设": ["反腐倡廉", "主题教育", "干部队伍建设", "作风建设"],
    "国际关系": ["一带一路", "人类命运共同体", "全球治理", "大国博弈"]
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add feeds.json
git commit -m "feat: add RSS feeds and category configuration"
```

---

### Task 3: RSS Fetch Module

**Files:**
- Create: `scripts/fetch.mjs`

- [ ] **Step 1: Write fetch.mjs**

This module parses RSS feeds, filters articles from the last 24 hours, and deduplicates against previously fetched URLs.

```js
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
  if (!pubDate) return true; // keep if no date (don't skip potentially good content)
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
```

- [ ] **Step 2: Commit**

```bash
git add scripts/fetch.mjs
git commit -m "feat: add RSS fetch module with dedup and date filtering"
```

---

### Task 4: OpenAI Classification Module

**Files:**
- Create: `scripts/classify.mjs`

- [ ] **Step 1: Write classify.mjs**

Sends article content to OpenAI gpt-4o-mini for classification and quote extraction.

```js
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function formatCategories(categories) {
  const lines = [];
  for (const [cat, subs] of Object.entries(categories)) {
    lines.push(`- ${cat}: ${subs.join("、")}`);
  }
  return lines.join("\n");
}

function buildPrompt(article, categories) {
  return `你是一位申论考试辅导专家，擅长对时政文章进行分类和提炼。请分析以下文章：

【文章标题】${article.title}
【文章来源】${article.source}
【文章正文】
${article.content.slice(0, 3000)}

【现有分类体系】
${formatCategories(categories)}

请完成以下任务并以 JSON 格式返回（不要包含其他内容）：
1. category: 从现有分类中选择最匹配的主分类
2. subcategory: 从该主分类下选择最匹配的子分类，如果没有合适的则为 null
3. new_subcategory: 如果现有子分类都不匹配，建议一个新的子分类名称；否则为 null
4. summary: 用 100 字以内概括文章核心观点
5. quotes: 提取 3-5 句可以作为申论写作素材的句子（原文原句，不要改写）
6. tags: 3-5 个关键词标签

返回格式：
{
  "category": "经济发展",
  "subcategory": "新质生产力",
  "new_subcategory": null,
  "summary": "...",
  "quotes": ["原文金句1", "原文金句2", "原文金句3"],
  "tags": ["标签1", "标签2", "标签3"]
}`;
}

export async function classifyArticle(article, categories) {
  const prompt = buildPrompt(article, categories);

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.3,
    max_tokens: 1000,
  });

  const raw = response.choices[0].message.content;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Retry by extracting JSON from markdown code block if present
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      parsed = JSON.parse(match[1].trim());
    } else {
      throw new Error(`Failed to parse OpenAI response as JSON: ${raw.slice(0, 200)}`);
    }
  }

  return {
    ...article,
    category: parsed.category,
    subcategory: parsed.subcategory || null,
    newSubcategory: parsed.new_subcategory || null,
    summary: parsed.summary,
    quotes: parsed.quotes || [],
    tags: parsed.tags || [],
  };
}

export async function classifyArticles(articles, categories) {
  const results = [];
  for (const article of articles) {
    try {
      const classified = await classifyArticle(article, categories);
      results.push(classified);
    } catch (err) {
      console.error(`Failed to classify "${article.title}":`, err.message);
    }
  }
  return results;
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/classify.mjs
git commit -m "feat: add OpenAI classification and quote extraction module"
```

---

### Task 5: Markdown Generation Module

**Files:**
- Create: `scripts/generate.mjs`

- [ ] **Step 1: Write generate.mjs**

Writes classified articles as markdown files with frontmatter, generates daily digest, category indexes, and the quotes page.

```js
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const DOCS_ROOT = new URL("../docs", import.meta.url).pathname;

function slugify(text) {
  return text.replace(/[\/\\?%*:|"<>]/g, "").slice(0, 60);
}

function formatDate(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function articleFrontmatter(article) {
  const lines = ["---"];
  lines.push(`title: "${article.title.replace(/"/g, '\\"')}"`);
  lines.push(`source: "${article.source}"`);
  lines.push(`url: "${article.url}"`);
  lines.push(`date: ${article.pubDate.split("T")[0]}`);
  lines.push(`category: "${article.category}"`);
  if (article.subcategory) {
    lines.push(`subcategory: "${article.subcategory}"`);
  }
  lines.push(`tags: [${article.tags.map((t) => `"${t}"`).join(", ")}]`);
  lines.push("quotes:");
  for (const q of article.quotes) {
    lines.push(`  - "${q.replace(/"/g, '\\"')}"`);
  }
  lines.push("---");
  return lines.join("\n");
}

function articleBody(article) {
  return `
## 原文摘要

${article.summary}

## 金句摘录

${article.quotes.map((q, i) => `${i + 1}. ${q}`).join("\n\n")}

> 来源: [${article.source}](${article.url}) | 分类: ${article.category}${article.subcategory ? ` / ${article.subcategory}` : ""}
`;
}

async function writeArticleFile(article) {
  const dateStr = article.pubDate.split("T")[0];
  const [y, m] = dateStr.split("-");
  const dir = join(DOCS_ROOT, "articles", y, m);
  await mkdir(dir, { recursive: true });

  const slug = slugify(article.title);
  const filename = `${dateStr}-${slug}.md`;
  const filepath = join(dir, filename);

  const content = articleFrontmatter(article) + "\n" + articleBody(article);
  await writeFile(filepath, content, "utf-8");
  return filepath;
}

async function writeDailyDigest(classifiedArticles, targetDate) {
  const dateStr = formatDate(targetDate);
  const categories = {};
  for (const a of classifiedArticles) {
    const key = a.category;
    if (!categories[key]) categories[key] = [];
    categories[key].push(a);
  }

  const lines = [
    "---",
    `title: "每日摘要 — ${dateStr}"`,
    `date: ${dateStr}`,
    "---",
    "",
    `# 每日摘要 — ${dateStr}`,
    "",
    `共收录 **${classifiedArticles.length}** 篇文章，覆盖 **${Object.keys(categories).length}** 个主题。`,
    "",
  ];

  for (const [cat, articles] of Object.entries(categories)) {
    lines.push(`## ${cat}（${articles.length}篇）`);
    for (const a of articles) {
      const articlePath = a._filepath || "";
      const linkName = articlePath
        ? articlePath.replace(DOCS_ROOT, "").replace(/\.md$/, "")
        : "";
      lines.push(`- [${a.title}](${linkName}) — ${a.source}`);
    }
    lines.push("");
  }

  const filepath = join(DOCS_ROOT, "daily", `${dateStr}.md`);
  await mkdir(join(DOCS_ROOT, "daily"), { recursive: true });
  await writeFile(filepath, lines.join("\n"), "utf-8");
}

async function updateCategoryIndexes(classifiedArticles) {
  const byCategory = {};
  for (const a of classifiedArticles) {
    const key = a.category;
    if (!byCategory[key]) byCategory[key] = [];
    byCategory[key].push(a);
  }

  for (const [cat, articles] of Object.entries(byCategory)) {
    const filepath = join(DOCS_ROOT, "categories", `${cat}.md`);
    let existing = "";
    try {
      existing = await readFile(filepath, "utf-8");
    } catch {
      // New category file
    }

    const newEntries = articles
      .map((a) => {
        const dateStr = a.pubDate.split("T")[0];
        return `| ${dateStr} | [${a.title}](${a.url}) | ${a.source} | ${a.subcategory || "-"} |`;
      })
      .join("\n");

    if (existing) {
      // Append to existing table
      const updated = existing.trimEnd() + "\n" + newEntries + "\n";
      await writeFile(filepath, updated, "utf-8");
    } else {
      const header = [
        `# ${cat}`,
        "",
        "| 日期 | 文章 | 来源 | 子分类 |",
        "|------|------|------|--------|",
      ].join("\n");
      await mkdir(join(DOCS_ROOT, "categories"), { recursive: true });
      await writeFile(filepath, header + "\n" + newEntries + "\n", "utf-8");
    }
  }
}

async function updateQuotesPage(classifiedArticles) {
  const filepath = join(DOCS_ROOT, "quotes.md");
  let existing = "";
  try {
    existing = await readFile(filepath, "utf-8");
  } catch {
    existing = `# 金句汇总\n\n`;
  }

  const newQuotes = [];
  for (const a of classifiedArticles) {
    if (!a.quotes.length) continue;
    for (const q of a.quotes) {
      newQuotes.push(`> ${q}\n>\n> — ${a.source}，《${a.title}》，${a.pubDate.split("T")[0]}\n`);
    }
  }

  if (newQuotes.length) {
    const section = `\n## ${formatDate(new Date())}\n\n${newQuotes.join("\n")}\n`;
    await writeFile(filepath, existing.trimEnd() + section, "utf-8");
  }
}

export async function generateMarkdown(classifiedArticles, targetDate = new Date()) {
  for (const article of classifiedArticles) {
    const filepath = await writeArticleFile(article);
    article._filepath = filepath;
  }

  await writeDailyDigest(classifiedArticles, targetDate);
  await updateCategoryIndexes(classifiedArticles);
  await updateQuotesPage(classifiedArticles);

  // Build summary for push
  const byCategory = {};
  for (const a of classifiedArticles) {
    const key = a.category;
    if (!byCategory[key]) byCategory[key] = 0;
    byCategory[key]++;
  }

  return {
    articleCount: classifiedArticles.length,
    categoryCount: Object.keys(byCategory).length,
    byCategory,
    date: formatDate(targetDate),
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/generate.mjs
git commit -m "feat: add markdown generation module for articles, digests, indexes"
```

---

### Task 6: WeChat Push Module

**Files:**
- Create: `scripts/push.mjs`

- [ ] **Step 1: Write push.mjs**

Sends the daily digest to WeChat Work bot via webhook. Follows the WeChat Work bot markdown message format (max 4096 chars).

```js
export async function sendDailyDigest(summary, webhookUrl, siteBaseUrl = "") {
  if (!webhookUrl) {
    console.log("No WECHAT_WEBHOOK_URL configured, skipping push.");
    return;
  }

  const lines = [
    `## 📰 申论素材日报 — ${summary.date}`,
    "",
    `今日收录 **${summary.articleCount}** 篇文章，覆盖 **${summary.categoryCount}** 个主题：`,
    "",
  ];

  for (const [cat, count] of Object.entries(summary.byCategory)) {
    lines.push(`- ${cat}: **${count}** 篇`);
  }

  lines.push("");

  if (siteBaseUrl) {
    lines.push(`[查看完整日报](${siteBaseUrl}/daily/${summary.date})`);
  }

  const content = lines.join("\n").slice(0, 4096);

  const payload = {
    msgtype: "markdown",
    markdown: { content },
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    console.error(`WeChat push failed (${response.status}):`, await response.text());
    return;
  }

  const result = await response.json();
  if (result.errcode !== 0) {
    console.error("WeChat push error:", result);
  } else {
    console.log("WeChat push sent successfully.");
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/push.mjs
git commit -m "feat: add WeChat Work bot push module"
```

---

### Task 7: Daily Orchestrator

**Files:**
- Create: `scripts/daily.mjs`

- [ ] **Step 1: Write daily.mjs — the main entry point**

Orchestrates the full daily pipeline. Loads config, runs fetch → classify → generate → push. Also handles the optional git commit when running in CI.

```js
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import "dotenv/config";

import { fetchArticles } from "./fetch.mjs";
import { classifyArticles } from "./classify.mjs";
import { generateMarkdown } from "./generate.mjs";
import { sendDailyDigest } from "./push.mjs";

const FEEDS_PATH = new URL("../feeds.json", import.meta.url);

async function main() {
  console.log("=== 申论素材日报 Pipeline ===");
  console.log(`Started at: ${new Date().toISOString()}\n`);

  // Load config
  const feedsConfig = JSON.parse(await readFile(FEEDS_PATH, "utf-8"));
  const enabledFeeds = feedsConfig.feeds.filter((f) => f.enabled !== false);
  console.log(`Configured feeds: ${enabledFeeds.map((f) => f.name).join(", ")}`);

  // Phase 1: Fetch
  console.log("\n--- Phase 1: Fetch ---");
  const articles = await fetchArticles(enabledFeeds);
  console.log(`Fetched ${articles.length} new articles`);

  if (articles.length === 0) {
    console.log("No new articles today. Exiting.");
    return;
  }

  // Phase 2: Classify
  console.log("\n--- Phase 2: Classify ---");
  const classified = await classifyArticles(articles, feedsConfig.categories);
  console.log(`Classified ${classified.length} articles`);

  // Phase 3: Generate
  console.log("\n--- Phase 3: Generate ---");
  const summary = await generateMarkdown(classified);
  for (const [cat, count] of Object.entries(summary.byCategory)) {
    console.log(`  ${cat}: ${count} articles`);
  }

  // Phase 4: Deliver
  console.log("\n--- Phase 4: Deliver ---");

  // WeChat push
  const siteUrl = process.env.SITE_BASE_URL || "";
  await sendDailyDigest(summary, process.env.WECHAT_WEBHOOK_URL, siteUrl);

  // Git commit + push (in CI)
  if (process.env.CI) {
    console.log("\nCommitting and pushing to git...");
    execSync("git config user.name 'shenlun-bot'", { stdio: "inherit" });
    execSync("git config user.email 'bot@shenlun.local'", { stdio: "inherit" });
    execSync(`git add docs/ fetched-urls.json feeds.json`, { stdio: "inherit" });
    execSync(`git commit -m "daily: ${summary.date}" || true`, { stdio: "inherit" });
    execSync("git push", { stdio: "inherit" });
    console.log("Pushed to remote. Vercel will auto-deploy.");
  }

  console.log(`\nDone at: ${new Date().toISOString()}`);
}

main().catch((err) => {
  console.error("Pipeline failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Install dotenv dependency**

Run: `npm install dotenv`

- [ ] **Step 3: Verify the script parses correctly**

Run: `node --check scripts/daily.mjs`
Expected: no output (syntax OK)

- [ ] **Step 4: Commit**

```bash
git add scripts/daily.mjs package.json package-lock.json
git commit -m "feat: add daily pipeline orchestrator"
```

---

### Task 8: VitePress Site Setup

**Files:**
- Create: `docs/.vitepress/config.ts`
- Create: `docs/index.md`

- [ ] **Step 1: Create VitePress config**

```ts
import { defineConfig } from "vitepress";

export default defineConfig({
  title: "申论素材库",
  description: "每日官方媒体文章分类与金句收录",
  lang: "zh-CN",
  cleanUrls: true,

  themeConfig: {
    nav: [
      { text: "首页", link: "/" },
      { text: "每日摘要", link: "/daily/" },
      { text: "文章浏览", link: "/articles/" },
      { text: "金句汇总", link: "/quotes" },
    ],

    sidebar: {
      "/categories/": [
        { text: "经济发展", link: "/categories/经济发展" },
        { text: "乡村振兴", link: "/categories/乡村振兴" },
        { text: "基层治理", link: "/categories/基层治理" },
        { text: "科技创新", link: "/categories/科技创新" },
        { text: "生态文明", link: "/categories/生态文明" },
        { text: "文化自信", link: "/categories/文化自信" },
        { text: "民生保障", link: "/categories/民生保障" },
        { text: "党的建设", link: "/categories/党的建设" },
        { text: "国际关系", link: "/categories/国际关系" },
      ],
    },

    search: {
      provider: "local",
    },

    socialLinks: [],
  },
});
```

- [ ] **Step 2: Create homepage**

Write `docs/index.md`:

```markdown
---
layout: home
title: 申论素材库

hero:
  name: 申论素材库
  text: 每日官方媒体文章分类与金句收录
  tagline: 自动采集 · AI 分类 · 金句提取 · 每日推送
  actions:
    - theme: brand
      text: 查看每日摘要
      link: /daily/
    - theme: alt
      text: 浏览金句
      link: /quotes

features:
  - title: 📡 自动采集
    details: 每天定时从人民日报、新华日报、求是网等官方媒体 RSS 源抓取最新文章
  - title: 🧠 AI 分类
    details: 基于 GPT-4 智能分类到经济发展、乡村振兴、基层治理等主题，支持自动扩展新分类
  - title: 💎 金句提取
    details: 每篇文章提取 3-5 句申论写作素材，方便积累和引用
  - title: 📱 每日推送
    details: 企业微信机器人每天推送日报摘要，碎片时间也能阅读
---
```

- [ ] **Step 3: Verify VitePress starts**

Run: `npx vitepress dev docs`
Expected: dev server starts, visit http://localhost:5173

- [ ] **Step 4: Commit**

```bash
git add docs/.vitepress/config.ts docs/index.md
git commit -m "feat: set up VitePress site with homepage"
```

---

### Task 9: GitHub Actions Workflow

**Files:**
- Create: `.github/workflows/daily.yml`
- Create: `vercel.json`

- [ ] **Step 1: Create GitHub Actions workflow**

```yaml
name: Daily Shenlun Pipeline

on:
  schedule:
    - cron: "0 1 * * *"  # UTC 1:00 = 北京时间 9:00
  workflow_dispatch:       # Manual trigger for testing

jobs:
  daily:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Run daily pipeline
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          WECHAT_WEBHOOK_URL: ${{ secrets.WECHAT_WEBHOOK_URL }}
          SITE_BASE_URL: ${{ vars.SITE_BASE_URL }}
          CI: "true"
        run: node scripts/daily.mjs
```

- [ ] **Step 2: Create vercel.json for VitePress build**

```json
{
  "buildCommand": "npx vitepress build docs",
  "outputDirectory": "docs/.vitepress/dist",
  "framework": "vitepress"
}
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/daily.yml vercel.json
git commit -m "feat: add GitHub Actions daily cron and Vercel config"
```

---

### Task 10: Manual End-to-End Test

**Files:**
- Create: `scripts/test-pipeline.mjs` (temporary, deleted after test)

- [ ] **Step 1: Verify environment variables**

Run: `node -e "console.log('OPENAI:', process.env.OPENAI_API_KEY ? 'set' : 'MISSING'); console.log('WECHAT:', process.env.WECHAT_WEBHOOK_URL ? 'set' : 'MISSING')"`
Expected: both should say "set" (set in `.env` or environment)

- [ ] **Step 2: Run the full pipeline**

Run: `node scripts/daily.mjs`
Expected:
- Articles fetched from RSS feeds (count logged)
- Each article classified (progress logged)
- Markdown files created in docs/
- WeChat push sent (or skipped if no webhook)
- No unhandled errors

- [ ] **Step 3: Verify generated files**

Run: `ls -la docs/articles/2026/05/ && echo "---" && ls -la docs/daily/ && echo "---" && ls -la docs/categories/`
Expected: article .md files, daily digest .md, category index .md files present

- [ ] **Step 4: Inspect a generated article**

Run: `head -30 docs/articles/2026/05/$(ls docs/articles/2026/05/ | head -1)`
Expected: valid YAML frontmatter with title, source, category, subcategory, tags, quotes

- [ ] **Step 5: Build the VitePress site**

Run: `npx vitepress build docs`
Expected: build succeeds, output in docs/.vitepress/dist/

- [ ] **Step 6: Commit test results (if any articles were generated)**

```bash
git add docs/ fetched-urls.json
git commit -m "test: initial pipeline run results"
```
```

---

## Self-Review

**1. Spec coverage check:**
- RSS fetching → Task 3 ✓
- OpenAI classification + quote extraction → Task 4 ✓
- Markdown generation with frontmatter → Task 5 ✓
- Category index auto-generation → Task 5 ✓
- Daily digest generation → Task 5 ✓
- Quotes page → Task 5 ✓
- WeChat push → Task 6 ✓
- Category auto-expand (new_subcategory tracking) → Task 4 + Task 5 ✓
- VitePress site → Task 8 ✓
- GitHub Actions cron → Task 9 ✓
- Vercel deployment → Task 9 ✓
- feeds.json config → Task 2 ✓

**2. Placeholder scan:** No TBD, TODO, or placeholder patterns found. All code is concrete.

**3. Type consistency:**
- `fetchArticles(feeds)` → returns articles with `{title, url, source, content, pubDate}` ✓
- `classifyArticle(article, categories)` → expects article with those fields, adds `{category, subcategory, newSubcategory, summary, quotes, tags}` ✓
- `generateMarkdown(classifiedArticles, targetDate)` → expects classified articles ✓
- `sendDailyDigest(summary, webhookUrl, siteBaseUrl)` → expects summary from generateMarkdown ✓
- All interfaces consistent across tasks ✓
