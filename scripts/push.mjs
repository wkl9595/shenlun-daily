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
