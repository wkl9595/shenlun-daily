import nodemailer from "nodemailer";

export async function sendDailyDigest(summary, siteBaseUrl = "") {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_TO } = process.env;

  if (!SMTP_USER || !SMTP_PASS) {
    console.log("No SMTP credentials configured, skipping email push.");
    return;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST || "smtp.qq.com",
    port: parseInt(SMTP_PORT || "465"),
    secure: true,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  // Build category breakdown
  let categoryHtml = "";
  for (const [cat, count] of Object.entries(summary.byCategory)) {
    categoryHtml += `<li>${cat}: <strong>${count}</strong> 篇</li>`;
  }

  const linkHtml = siteBaseUrl
    ? `<p style="margin-top:24px;"><a href="${siteBaseUrl}/daily/${summary.date}" style="color:#2563eb;">查看完整日报</a></p>`
    : "";

  const html = `
<div style="max-width:600px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fafafa;padding:32px;border-radius:12px;">
  <h2 style="color:#1e293b;margin:0 0 4px;">申论素材日报 — ${summary.date}</h2>
  <p style="color:#64748b;margin:0 0 24px;">今日收录 <strong>${summary.articleCount}</strong> 篇文章，覆盖 <strong>${summary.categoryCount}</strong> 个主题</p>
  <ul style="color:#334155;padding-left:20px;line-height:1.8;">
    ${categoryHtml}
  </ul>
  ${linkHtml}
</div>`;

  try {
    await transporter.sendMail({
      from: SMTP_USER,
      to: SMTP_TO || SMTP_USER,
      subject: `申论素材日报 — ${summary.date}`,
      html,
    });
    console.log("Email sent successfully.");
  } catch (err) {
    console.error("Email send failed:", err.message);
  }
}
