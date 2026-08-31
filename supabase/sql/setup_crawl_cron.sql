-- ============================================================
-- supabase/sql/setup_crawl_cron.sql
-- 用 Supabase 可靠的 pg_cron 取代 GitHub 不可靠的 schedule（根治整窗丢触发）
-- 由 pg_cron 定时调用 Edge Function crawl-scheduler，
-- 再由它 workflow_dispatch 触发 Python 爬虫（crawlers/crawler.py）。
--
-- 时间换算：北京时间 = UTC + 8
--   5 点(诗经/名句)  = UTC 21:00-21:30
--   6 点(新闻/评论)  = UTC 22:00-22:30
--   12 点(新闻/评论) = UTC 04:00-04:30
--   17 点(新闻/评论) = UTC 09:00-09:30
--
-- 部署前请把下面的 mycron2026secret88 替换为你实际设置的 CRON_SECRET
-- （与 Supabase Functions → Secrets 中配置的一致；若留空不鉴权可删掉 x-cron-secret 头）。
-- 在 Supabase 控制台 → SQL Editor 全选执行本文件即可。
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 5 点档：诗经 + 名句（crawler.py 在 hour==5 只抓这两项）
select cron.schedule(
  'crawl_shijing_quotes',
  '0,10,20,30 21 * * *',
  $$ select net.http_post(
      url:='https://wentfvkdfecrfelgmdix.supabase.co/functions/v1/crawl-scheduler',
      headers:='{"x-cron-secret":"mycron2026secret88","Content-Type":"application/json"}'::jsonb,
      body:='{}'::jsonb
    ); $$
);

-- 6 点档：新闻 + 评论
select cron.schedule(
  'crawl_news_comments_6',
  '0,10,20,30 22 * * *',
  $$ select net.http_post(
      url:='https://wentfvkdfecrfelgmdix.supabase.co/functions/v1/crawl-scheduler',
      headers:='{"x-cron-secret":"mycron2026secret88","Content-Type":"application/json"}'::jsonb,
      body:='{}'::jsonb
    ); $$
);

-- 12 点档：新闻 + 评论
select cron.schedule(
  'crawl_news_comments_12',
  '0,10,20,30 4 * * *',
  $$ select net.http_post(
      url:='https://wentfvkdfecrfelgmdix.supabase.co/functions/v1/crawl-scheduler',
      headers:='{"x-cron-secret":"mycron2026secret88","Content-Type":"application/json"}'::jsonb,
      body:='{}'::jsonb
    ); $$
);

-- 17 点档：新闻 + 评论
select cron.schedule(
  'crawl_news_comments_17',
  '0,10,20,30 9 * * *',
  $$ select net.http_post(
      url:='https://wentfvkdfecrfelgmdix.supabase.co/functions/v1/crawl-scheduler',
      headers:='{"x-cron-secret":"mycron2026secret88","Content-Type":"application/json"}'::jsonb,
      body:='{}'::jsonb
    ); $$
);
