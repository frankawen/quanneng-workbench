-- 每日一读（学习强国公众号）数据表
-- 用途：爬虫每日自动抓「学习强国」公众号的「每日一读」文章，只存标题+简介+链接（不存全文）
-- 在 Supabase 控制台 SQL Editor 全选执行即可（https://supabase.com/dashboard/project/wentfvkdfecrfelgmdix/sql/new）
create table if not exists public.daily_read (
  id          uuid primary key default gen_random_uuid(),
  date        text not null,                                   -- 抓取日期（北京时间 YYYY-MM-DD）
  title       text not null,                                   -- 文章标题
  summary     text default '',                                 -- 内容简介（正文首段，截断 90 字）
  url         text not null,                                   -- 微信原文链接（点击跳转）
  source      text default '学习强国',                         -- 来源公众号
  crawled_at  timestamptz default now()                        -- 写入时间
);

-- 索引：按日期倒序取最新
create index if not exists daily_read_date_idx on public.daily_read (date desc);

-- 开放匿名读权限（前端公开只读，与现有 news/shijing/quotes/comments 一致）
alter table public.daily_read enable row level security;
drop policy if exists "daily_read public read" on public.daily_read;
create policy "daily_read public read"
  on public.daily_read for select
  using (true);
