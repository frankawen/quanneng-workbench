-- ============================================================
-- supabase/sql/add_cron_sspai_0830.sql
-- 派早报「多枪」补抓任务（北京时间 7:00 ~ 10:30，每 30 分钟一枪）
--
-- 背景：派早报（少数派日更栏目）发布时间不固定，实测分布在 BJT 06:38 ~ 09:00+。
--       原先只挂 8:30 单枪（30 0 * * *），一旦「那一枪正好早报还没发」或
--       「tag 页请求被 CDN 缓存/限流」就整天看不到当日早报（9/14 实测：
--       cron 记录 status=succeeded、pg_net 返回 200，但 tag 页当时还没刷出当日早报）。
--       改为覆盖式多枪后，只要早报在 10:30 前发布，当天上午必定入库。
--
-- 时间换算：北京时间 = UTC + 8
--   `0,30 23,0,1,2 * * *` → UTC 23:00/23:30/00:00/00:30/01:00/01:30/02:00/02:30
--                          → 北京 07:00/07:30/08:00/08:30/09:00/09:30/10:00/10:30
--
-- 说明：?feeds=sspai 会同时带出「少数派 + 派早报」两个源（见 FEED_ALIASES）。
--       6/12/17 点档仍会顺带抓派早报作兜底，这里只是把上午的窗口打密。
--       多枪不会产生重复：写入端按 url 去重 + 表上有 url 唯一约束。
--
-- 使用：Supabase 控制台 → SQL Editor → 全选执行本文件。
-- 幂等：开头先 unschedule 同名任务，可安全重复执行。
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 卸载旧任务（含单枪时代的同名任务）
select cron.unschedule('crawler_sspai_830')
  where exists (select 1 from cron.job where jobname = 'crawler_sspai_830');
select cron.unschedule('crawler_paizaobao_am')
  where exists (select 1 from cron.job where jobname = 'crawler_paizaobao_am');

-- 上午多枪：BJT 7:00 ~ 10:30 每 30 分钟补抓一次「少数派 + 派早报」
select cron.schedule(
  'crawler_paizaobao_am',
  '0,30 23,0,1,2 * * *',
  $$ select net.http_post(
      url:='https://wentfvkdfecrfelgmdix.supabase.co/functions/v1/crawler?feeds=sspai',
      headers:='{"x-cron-secret":"mycron2026secret88","Content-Type":"application/json"}'::jsonb,
      body:='{}'::jsonb
    ); $$
);

-- ---------- 验证：应看到 crawler_paizaobao_am 一行 ----------
-- select jobname, schedule, active from cron.job order by jobname;
