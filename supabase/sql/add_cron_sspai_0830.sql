-- ============================================================
-- supabase/sql/add_cron_sspai_0830.sql
-- 新增 8:30（北京时间）单独抓取少数派的 cron 任务
--
-- 背景：派早报每天早上 8 点多发布，原 6 点档抓少数派时早报还没出，
--       要等到 12 点档才入库。8:30 单独补抓一枪，早报上午即可见。
-- 中新网与其它数据源保持原频率不变（6/12/17 点档仍会顺带抓少数派作兜底）。
--
-- 时间换算：北京时间 8:30 = UTC 0:30
--
-- 使用：Supabase 控制台 → SQL Editor → 全选执行本文件。
-- 幂等：开头先 unschedule 同名任务，可安全重复执行。
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 卸载旧的同名任务（如有）
select cron.unschedule('crawler_sspai_830')
  where exists (select 1 from cron.job where jobname = 'crawler_sspai_830');

-- 8:30 档：仅抓少数派（?feeds=sspai，crawler 按 FEED_ALIASES 映射）
select cron.schedule(
  'crawler_sspai_830',
  '30 0 * * *',
  $$ select net.http_post(
      url:='https://wentfvkdfecrfelgmdix.supabase.co/functions/v1/crawler?feeds=sspai',
      headers:='{"x-cron-secret":"mycron2026secret88","Content-Type":"application/json"}'::jsonb,
      body:='{}'::jsonb
    ); $$
);

-- ---------- 验证：应返回 crawler_sspai_830 一行 ----------
-- select jobname, schedule, active from cron.job order by jobname;
