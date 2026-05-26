import { writeFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_ROOT = join(__dirname, "..", "docs");

function esc(val) {
  return String(val).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

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
  lines.push(`title: "${esc(article.title)}"`);
  lines.push(`source: "${esc(article.source)}"`);
  lines.push(`url: "${esc(article.url)}"`);
  lines.push(`date: ${article.pubDate.split("T")[0]}`);
  lines.push(`category: "${esc(article.category)}"`);
  if (article.subcategory) {
    lines.push(`subcategory: "${esc(article.subcategory)}"`);
  }
  lines.push(`tags: [${(article.tags || []).map((t) => `"${esc(t)}"`).join(", ")}]`);
  lines.push("quotes:");
  for (const q of article.quotes || []) {
    lines.push(`  - "${esc(q)}"`);
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

async function updateQuotesPage(classifiedArticles, targetDate) {
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
    const section = `\n## ${formatDate(targetDate)}\n\n${newQuotes.join("\n")}\n`;
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
  await updateQuotesPage(classifiedArticles, targetDate);

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
