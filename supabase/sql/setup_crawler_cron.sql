-- ============================================================
-- supabase/sql/setup_crawler_cron.sql
-- 把调度从「crawl-scheduler（转 GitHub Actions）」切到「crawler（原生抓取）」
--
-- 旧链路（已废弃，依赖 GitHub PAT，PAT 过期即静默停更）：
--   pg_cron → crawl-scheduler → workflow_dispatch → GitHub Actions → crawler.py
-- 新链路（无 GitHub、无 PAT 依赖）：
--   pg_cron → Edge Function crawler → 抓取 + 直接写库
--
-- 时间换算：北京时间 = UTC + 8
--   5 点  = UTC 21:00-21:30  → 诗经 + 名句 + 每日一读
--   6 点  = UTC 22:00-22:30  → 新闻 + 评论（+ 诗经/名句/每日一读顺带补抓）
--   12 点 = UTC 04:00-04:30  → 同上
--   17 点 = UTC 09:00-09:30  → 同上
--
-- 使用：Supabase 控制台 → SQL Editor → 全选执行本文件。
-- 本文件开头会先 unschedule 旧任务，可安全重复执行（幂等）。
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------- 1) 卸载旧任务（指向 crawl-scheduler 的那一批）----------
select cron.unschedule('crawl_shijing_quotes')    where exists (select 1 from cron.job where jobname = 'crawl_shijing_quotes');
select cron.unschedule('crawl_news_comments_6')   where exists (select 1 from cron.job where jobname = 'crawl_news_comments_6');
select cron.unschedule('crawl_news_comments_12')  where exists (select 1 from cron.job where jobname = 'crawl_news_comments_12');
select cron.unschedule('crawl_news_comments_17')  where exists (select 1 from cron.job where jobname = 'crawl_news_comments_17');

-- ---------- 2) 建立新任务（指向原生 crawler）----------
-- 注意：headers 里的 x-cron-secret 必须与 Supabase Secrets 中的 CRON_SECRET 一致。
-- 当前值：mycron2026secret88（如需修改，两边同步改）

-- 5 点档：诗经 + 名句 + 每日一读
select cron.schedule(
  'crawler_5',
  '0,10,20,30 21 * * *',
  $$ select net.http_post(
      url:='https://wentfvkdfecrfelgmdix.supabase.co/functions/v1/crawler',
      headers:='{"x-cron-secret":"mycron2026secret88","Content-Type":"application/json"}'::jsonb,
      body:='{}'::jsonb
    ); $$
);

-- 6 点档：新闻 + 评论
select cron.schedule(
  'crawler_6',
  '0,10,20,30 22 * * *',
  $$ select net.http_post(
      url:='https://wentfvkdfecrfelgmdix.supabase.co/functions/v1/crawler',
      headers:='{"x-cron-secret":"mycron2026secret88","Content-Type":"application/json"}'::jsonb,
      body:='{}'::jsonb
    ); $$
);

-- 12 点档：新闻 + 评论
select cron.schedule(
  'crawler_12',
  '0,10,20,30 4 * * *',
  $$ select net.http_post(
      url:='https://wentfvkdfecrfelgmdix.supabase.co/functions/v1/crawler',
      headers:='{"x-cron-secret":"mycron2026secret88","Content-Type":"application/json"}'::jsonb,
      body:='{}'::jsonb
    ); $$
);

-- 17 点档：新闻 + 评论
select cron.schedule(
  'crawler_17',
  '0,10,20,30 9 * * *',
  $$ select net.http_post(
      url:='https://wentfvkdfecrfelgmdix.supabase.co/functions/v1/crawler',
      headers:='{"x-cron-secret":"mycron2026secret88","Content-Type":"application/json"}'::jsonb,
      body:='{}'::jsonb
    ); $$
);

-- ---------- 3) 验证：应返回 4 行（crawler_5 / crawler_6 / crawler_12 / crawler_17）----------
-- select jobname, schedule, active from cron.job order by jobname;
