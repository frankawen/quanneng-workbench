# 全能工作台
# 集成式生活工作台，支持在线数据同步

## 功能模块

- 📊 **今日概览** - 收支统计、习惯打卡、体重跟踪、待买清单
- 💰 **记账理财** - 收支记录、预算管理、消费分析
- ❤️ **习惯健康** - 习惯打卡、30天热力图
- 🏃 **减脂健身** - 体重记录、BMI计算、周计划
- 🛒 **待买清单** - 商品管理、拍照识图
- 📚 **每日一读** - 新闻、诗经、名句、人民日报评论

## 技术栈

- 前端: React + TypeScript + Tailwind CSS
- 数据库: Supabase
- 部署: GitHub Pages
- 爬虫: Python (httpx + parsel)

## 环境配置

复制 `.env.example` 为 `.env` 并填入你的 Supabase 和 Agnes AI 配置：

```bash
cp .env.example .env
```

## 开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

## 部署

1. 推送代码到 GitHub main 分支
2. GitHub Actions 自动构建并部署到 Pages

## 爬虫

```bash
cd crawlers
pip install httpx parsel
python crawler.py --type all
```
