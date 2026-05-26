import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
});

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

  const response = await client.chat.completions.create({
    model: "deepseek-chat",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.3,
    max_tokens: 1000,
  });

  const raw = response.choices[0].message.content;
  if (!raw) {
    throw new Error("DeepSeek returned null content (possible content filter trigger)");
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Retry by extracting JSON from markdown code block if present
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try {
        parsed = JSON.parse(match[1].trim());
      } catch {
        throw new Error(`Failed to parse JSON from markdown block: ${match[1].trim().slice(0, 200)}`);
      }
    } else {
      throw new Error(`Failed to parse response as JSON: ${raw.slice(0, 200)}`);
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
