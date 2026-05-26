import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_PROMPT = `你是一位中国政府文件和申论考试辅导专家，擅长将文章整理成规范的双语学习笔记。

你的输出应包含以下板块（使用 Markdown 格式）：

## 双语金句 Bilingual Quotes
| 中文原文 | English Translation |
|---|---|
| 金句1 | Translation 1 |
| 金句2 | Translation 2 |

## 逻辑梳理 Logic Flow
用中文概括文章的逻辑结构（3-5 个要点），每个要点对应一个英文翻译。

## 单词词组 Keywords
| 中文术语 | English |
|---|---|
| 术语1 | Term 1 |

## 背景知识补充 Background
补充 1-2 条相关背景知识（中文+英文）。

## 申论应试要点 Exam Tips
3-5 条申论应试要点，每条中英双语。

## 小结 In a Nutshell
用中英文各一句话总结全文，适合考前速记。
`;

function buildPrompt(article) {
  return `${SYSTEM_PROMPT}

请根据以下文章生成学习笔记：

标题：${article.title}
来源：${article.source}
分类：${article.category}${article.subcategory ? ` > ${article.subcategory}` : ""}
摘要：${article.summary}
标签：${article.tags?.join("、") || "无"}

原文金句（供参考）：
${article.quotes?.map((q, i) => `${i + 1}. ${q}`).join("\n") || "无"}

正文（前 4000 字）：
${article.content.slice(0, 4000)}`;
}

export async function generateMarkdown(article) {
  const prompt = buildPrompt(article);

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      temperature: 0.3,
      maxOutputTokens: 3000,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("Gemini returned empty response");
  }

  return { ...article, markdown: text };
}

export async function generateMarkdownBatch(articles) {
  const results = [];
  for (const article of articles) {
    try {
      const enriched = await generateMarkdown(article);
      results.push(enriched);
    } catch (err) {
      console.error(`Failed to generate markdown for "${article.title}":`, err.message);
    }
  }
  return results;
}
