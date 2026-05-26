export async function sendDailyDigest(summary, webhookUrl, siteBaseUrl = "") {
  if (!webhookUrl) {
    console.log("No WECHAT_WEBHOOK_URL configured, skipping push.");
    return;
  }

  const lines = [
    `## 申论素材日报 — ${summary.date}`,
    "",
    `今日收录 **${summary.articleCount}** 篇文章，覆盖 **${summary.categoryCount}** 个主题：`,
    "",
  ];

  for (const [cat, count] of Object.entries(summary.byCategory)) {
    lines.push(`- ${cat}: **${count}** 篇`);
  }

  lines.push("");

  if (siteBaseUrl) {
    const linkLine = `[查看完整日报](${siteBaseUrl}/daily/${summary.date})`;
    lines.push(linkLine);
  }

  // Truncate safely: cut at last complete line to avoid breaking markdown
  let content = lines.join("\n");
  if (content.length > 4096) {
    content = content.slice(0, 4096);
    const lastNewline = content.lastIndexOf("\n");
    if (lastNewline > 0) {
      content = content.slice(0, lastNewline);
    }
    content += "\n\n...(内容已截断)";
  }

  const payload = {
    msgtype: "markdown",
    markdown: { content },
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`WeChat push failed (HTTP ${response.status})`);
      return;
    }

    const result = await response.json();
    if (result.errcode !== 0) {
      console.error("WeChat push error:", result.errmsg || result.errcode);
    } else {
      console.log("WeChat push sent successfully.");
    }
  } catch (err) {
    console.error("WeChat push failed:", err.message);
  }
}
