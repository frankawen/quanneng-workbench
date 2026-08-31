# 全能工作台

集成式生活工作台，单文件前端 + Supabase 数据同步，部署在 GitHub Pages 固定链接：

**https://frankawen.github.io/quanneng-workbench/**

## 功能模块

| 模块 | 说明 | 数据表 |
| --- | --- | --- |
| 📊 今日概览 | 收支统计、习惯打卡、体重跟踪 | 汇总读取 |
| 💰 记账理财 | 收支记录、预算管理、消费分析 | `expenses` `budgets` |
| ❤️ 习惯健康 | 习惯打卡、30 天热力图 | `habits` `habit_records` |
| 🏃 减脂健身 | 体重记录、BMI 计算、周计划 | `body_records` `workout_plans` |
| 🛒 待买清单 | 商品管理、拍照识图 | `wishlist` |
| 📝 词语积累 | 自定义/拍照录词、分类查看、名句一键收藏 | `wordbank` |
| 📚 每日一读 | 新闻、诗经、名句、人民日报评论、学习强国 | `news` `shijing` `quotes` `comments` `daily_read` |

> 手机端为同一份响应式文件，底部「其他」页合并展示 健身 + 待买 + 词语积累。

## 技术栈

- **前端**：单文件 `public/index.html`（原生 JS + CSS，无构建步骤）
- **数据库**：Supabase（PostgREST + RLS，前端用 publishable key 直连）
- **部署**：GitHub Pages，源分支 `gh-pages`
- **爬虫**：Supabase Edge Function `supabase/functions/crawler/index.ts`（Deno 原生）
- **调度**：Supabase `pg_cron`（北京时间 5 / 6 / 12 / 17 点）

## 架构要点

```
pg_cron ──HTTP(x-cron-secret)──▶ Edge Function crawler ──▶ Supabase 表
                                                              │
                                          public/index.html ──┘（publishable key 直读）
```

- 调度与抓取**全在云端**，本机无需开机，也不依赖 GitHub Actions / PAT。
- GitHub Pages 服务的是 `gh-pages` 分支**根目录**的 `index.html`。

## 部署（重要）

改动 `public/index.html` 后，**必须同步 `gh-pages` 分支**，否则线上仍是旧版：

```bash
# 1. 提交到 main
git add public/index.html && git commit -m "..." && git push origin main

# 2. 同步 gh-pages（两份 index.html 都要更新）
git fetch origin gh-pages
git checkout -B gh-pages origin/gh-pages
git checkout main -- public/
cp public/index.html index.html
git add index.html public/ && git commit -m "sync(gh-pages)"
git push origin gh-pages
git checkout main
```

> ⚠️ 只推 `main` 不同步 `gh-pages`，是历史上「线上反复回退到旧版」的唯一根因。

## 数据库

建表 SQL 放在 `supabase/sql/`，在 Supabase 控制台 → SQL Editor 全选执行：

| 文件 | 用途 |
| --- | --- |
| `create_daily_read.sql` | 每日一读表 + RLS |
| `create_wordbank.sql` | 词语积累表 + RLS |
| `fix_daily_read_policy.sql` | 修正每日一读的 anon 策略 |
| `setup_crawler_cron.sql` | 创建 4 个 pg_cron 定时任务 |
| `teardown_crawl_cron.sql` | 卸载定时任务 |

> 前端用 publishable key 直连，**任何新表都必须配置 anon 的 RLS 策略**，否则读写报 401/403。

## 环境变量

**Supabase Secrets**（Edge Function 运行时，控制台 → Edge Functions → Secrets）：

| 名称 | 说明 |
| --- | --- |
| `CRON_SECRET` | pg_cron 调用鉴权，需与 `setup_crawler_cron.sql` 中的 `x-cron-secret` 一致 |
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | 爬虫写库凭据 |
| `WXPUB_APP_ID` / `WXPUB_SECURE_KEY` | 学习强国公众号抓取凭据；**未配置则每日一读自动跳过**，其它数据源不受影响 |

**本地补数据**（应急绕过云端）：

```bash
# crawlers/crawler.py 为备份版爬虫，需 httpx
pip install httpx parsel
python crawlers/crawler.py
```

前端所需的 Supabase / Agnes 配置已写在 `public/index.html` 顶部的 `CFG` 中。

## 开发

无构建步骤，直接改 `public/index.html`，浏览器打开即可预览（需本地静态服务器以避免跨域限制）：

```bash
python -m http.server 8000 --directory public
# 打开 http://localhost:8000
```

改版时记得递增 `BUILD_VERSION`，便于确认浏览器加载的是最新版。
