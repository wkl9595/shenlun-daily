# 申论学习工具 — 设计文档

## 概述

每天自动从官方媒体（人民日报、新华日报等）RSS 源抓取前一日文章，通过 OpenAI 自动分类并提取金句，生成静态站点，通过企业微信机器人推送每日摘要。

## 设计目标

- **零数据库**：Markdown + frontmatter 即存储，Git 记录变更
- **零 API 服务器**：VitePress SSG 构建静态站点，无运行时
- **定时全自动**：Cron/CI 定时触发，无需人工介入
- **与 archquery 的差异**：不用 PostgreSQL/Prisma/RAG/API routes；采用静态文件 + CLI pipeline + 文档站模式

## 架构

```
RSS Feeds → CLI Script (daily.mjs) → OpenAI (classify + extract)
                ↓
         Markdown files (content/)
                ↓
       Git push → Vercel deploy → Static site
                ↓
         WeChat Webhook → 每日推送
```

### Pipeline 四阶段

1. **Fetch** — 读取 RSS feeds，对比 `fetched-urls.json` 去重，获取前24小时文章
2. **Classify** — 调 OpenAI gpt-4o-mini，匹配预设分类、提取金句，返回结构化 JSON
3. **Generate** — 将分类结果写入 `content/articles/` 按日期组织的 markdown 文件，更新分类索引
4. **Deliver** — Git commit + push → Vercel 自动部署；同时 POST 企业微信 Webhook 推送摘要

## 技术栈

| 层 | 方案 | 理由 |
|---|---|---|
| 运行时 | Node.js (ESM) | RSS 解析、文件操作、HTTP 请求一条龙 |
| AI | OpenAI gpt-4o-mini | 低成本（~$0.01/天），分类+提取质量高 |
| 静态站点 | VitePress | 文档站风格、内置搜索、frontmatter 原生支持 |
| 部署 | Vercel (免费) | push 自动部署、自定义域名 |
| 定时触发 | GitHub Actions cron | 免费、可靠、无需维护服务器 |

## 目录结构

```
shenlun-tool/
├── content/                    # 所有内容（Git 仓库即数据）
│   ├── articles/
│   │   └── 2026/05/
│   │       ├── 2026-05-25-新质生产力赋能高质量发展.md
│   │       └── ...
│   ├── daily/
│   │   └── 2026-05-26.md      # 每日摘要（26号汇总25号的文章）
│   ├── categories/
│   │   ├── 经济发展.md         # 分类索引页（自动生成）
│   │   └── ...
│   └── quotes.md              # 金句汇总页
├── scripts/
│   ├── fetch.mjs              # RSS 抓取 + 去重
│   ├── classify.mjs           # OpenAI 分类 + 金句提取
│   ├── generate.mjs           # 生成 markdown 文件
│   ├── push.mjs               # 推送企业微信
│   └── daily.mjs              # 一日流程编排（入口）
├── site/
│   ├── .vitepress/
│   │   └── config.ts          # VitePress 配置（侧边栏、导航）
│   └── index.md               # 首页
├── feeds.json                 # RSS 源列表 + 预设分类体系
├── fetched-urls.json          # 已抓取 URL 去重记录
└── package.json
```

## 内容模型

### 文章 Markdown 格式

```markdown
---
title: "以新质生产力赋能高质量发展"
source: "人民日报"
url: "https://www.rmrb.com.cn/..."
date: 2026-05-25
category: "经济发展"
subcategory: "新质生产力"
tags: ["新质生产力", "高质量发展", "科技创新"]
quotes:
  - "新质生产力是推动高质量发展的内在要求和重要着力点。"
  - "科技创新能够催生新产业、新模式、新动能。"
---

## 原文摘要
...文章正文或摘要...
```

### 与 VitePress 的集成

- VitePress 读取 `content/` 目录下的 markdown 文件
- frontmatter 中的 `category`、`tags`、`date` 用于侧边栏导航和筛选
- `quotes` 数组可在页面中以高亮卡片形式展示
- 分类索引页自动聚合 `category` 相同的文章

## 分类体系

### 预设分类（在 feeds.json 中维护）

```
经济发展 → 新质生产力, 高质量发展, 民营经济
乡村振兴 → 农业现代化, 农村人居环境, 城乡融合
基层治理 → 社区治理, 网格化管理, 基层党建
科技创新 → 人工智能, 芯片半导体, 数字中国
生态文明 → 碳达峰碳中和, 污染防治, 绿色发展
文化自信 → 传统文化, 文化出海, 文化产业
民生保障 → 就业, 医疗, 养老, 教育
党的建设 → 反腐倡廉, 主题教育, 干部队伍建设
国际关系 → 一带一路, 人类命运共同体, 全球治理
```

### 自动扩展规则

1. AI 分类优先匹配预设分类及子分类
2. 无法匹配时，AI 建议新的子分类名称
3. 新子分类下积累 ≥3 篇文章后，自动加入 feeds.json
4. 分类变更随代码 commit 进入版本管理

### OpenAI Prompt 输出格式

```json
{
  "category": "经济发展",
  "subcategory": "新质生产力",
  "new_subcategory": null,
  "summary": "本文阐述了新质生产力对高质量发展的推动作用...",
  "quotes": ["...", "..."],
  "tags": ["新质生产力", "科技创新", "产业升级"]
}
```

## 企业微信推送

### 推送内容

- 每日 9:00 发送（GitHub Actions cron: `0 1 * * *` UTC）
- 格式：Markdown 消息卡片
- 内容：今日收录文章数、按分类的条目数、今日精选金句 3 条
- 附带每日摘要页面链接

### 配置

- `WECHAT_WEBHOOK_URL` 环境变量（GitHub Actions Secret）
- 消息格式遵循企业微信机器人 Markdown 消息规范

## 定时触发方案

### GitHub Actions

```yaml
on:
  schedule:
    - cron: "0 1 * * *"  # UTC 1:00 = 北京时间 9:00
```

### 执行流程

1. Checkout repo
2. `npm ci`
3. `node scripts/daily.mjs`
4. `git commit -m "daily: $(date +%Y-%m-%d)"` + `git push`
5. Vercel 自动部署（webhook on push）

## 站点设计

### 导航结构

```
首页
├── 每日摘要（按日期倒序）
├── 文章浏览
│   ├── 按分类浏览
│   │   ├── 经济发展
│   │   ├── 乡村振兴
│   │   └── ...
│   └── 按日期浏览
├── 金句汇��
└── 搜索（VitePress 内置全文搜索）
```

### 页面布局

- 左侧：分类侧边栏（VitePress sidebar）
- 右侧：文章内容
- 首页：最近7天摘要 + 热门金句 + 分类入口
- 文章页：frontmatter 数据自动渲染为元信息卡片

## SSE 源配置

feeds.json 结构：

```json
{
  "feeds": [
    {
      "name": "人民日报",
      "url": "https://www.people.com.cn/rss/...",
      "enabled": true
    },
    {
      "name": "新华日报",
      "url": "https://www.xinhuanet.com/rss/...",
      "enabled": true
    }
  ],
  "categories": {
    "经济发展": ["新质生产力", "高质量发展", "民营经济"],
    "乡村振兴": ["农业现代化", "农村人居环境", "城乡融合"],
    "...": ["..."]
  }
}
```

## 边界与限制

- **不做**：全文翻译、语音播报、用户账户系统、评论功能
- **文章全文存储**：仅存储 AI 摘要，不存储完整原文（版权考虑）；RSS 原文链接指向源站
- **RSS 源稳定性**：如果某个 RSS 源失效，需要在 feeds.json 中手动更新
- **搜索范围**：VitePress 内置搜索上限约 2000 篇文章，超出后需考虑 Algolia 等方案
