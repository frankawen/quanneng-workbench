-- ============================================================
-- supabase/sql/teardown_crawl_cron.sql
-- 卸载本套定时任务（在 Supabase 控制台 → SQL Editor 执行）。
-- 仅移除 pg_cron 调度，不删除 Edge Function 本身。
-- ============================================================

select cron.unschedule('crawl_shijing_quotes');
select cron.unschedule('crawl_news_comments_6');
select cron.unschedule('crawl_news_comments_12');
select cron.unschedule('crawl_news_comments_17');
