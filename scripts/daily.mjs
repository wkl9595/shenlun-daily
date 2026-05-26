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
