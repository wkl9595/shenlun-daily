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
