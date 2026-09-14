-- ============================================================
-- supabase/sql/fix_unique_constraints.sql
-- 清理存量重复行 + 给来源数据表加唯一约束
--
-- 背景（2026-09-14 排查）：
--   crawl Edge Function 的 existingSet 在「读取去重集合」这一步请求失败时，
--   旧实现会静默返回空集 → 判定「全部数据都是新增」→ 每枪 cron 重复写入同一批数据。
--   实测后果：shijing 181 行里只有 30 个唯一 title（重复率 83%，最多重复 7 次），
--            news 也曾重复 218 条、quotes 重复 2834 条。
--
--   应用层已修（读取失败改为抛错中止本轮，不再静默去重失效）。
--   本文件再加一道**数据库层保险**：加唯一约束后，即使应用层将来又出问题，
--   配合 PostgREST 的 resolution=ignore-duplicates 也不会产生重复行。
--
-- 时间换算：本文件不涉及调度，调度见 setup_crawler_cron.sql / add_cron_sspai_0830.sql
-- 使用：Supabase 控制台 → SQL Editor → 全选执行；或 CLI：
--       supabase db query "$(cat supabase/sql/fix_unique_constraints.sql)" --linked
-- 幂等：可安全重复执行。
-- ============================================================

-- ---------- 1) 清理 shijing 存量重复（同 title 保留正文最长的一条）----------
delete from shijing
 where id not in (
   select distinct on (title) id
     from shijing
    order by title, length(coalesce(content, '')) desc, crawled_at asc
 );

-- ---------- 2) 清理 news 存量重复（同 url 保留最早抓取的一条）----------
delete from news
 where url is not null and url <> ''
   and id not in (
     select distinct on (url) id
       from news
      where url is not null and url <> ''
      order by url, crawled_at asc
   );

-- 空字符串 url 归一为 null（PostgreSQL 唯一约束允许多个 null，但不允许重复空串）
update news set url = null where url = '';

-- ---------- 3) 清理 quotes 存量重复（同 quote 保留释义最全的一条）----------
delete from quotes
 where id not in (
   select distinct on (quote) id
     from quotes
    order by quote,
             (coalesce(length(translation), 0)
            + coalesce(length(annotation), 0)
            + coalesce(length(analysis), 0)) desc,
             crawled_at asc
 );

-- ---------- 4) 加唯一约束（幂等：先删后加）----------
alter table shijing drop constraint if exists shijing_title_key;
alter table shijing add  constraint shijing_title_key unique (title);

alter table news drop constraint if exists news_url_key;
alter table news add  constraint news_url_key unique (url);

alter table quotes drop constraint if exists quotes_quote_key;
alter table quotes add  constraint quotes_quote_key unique (quote);

-- ---------- 5) 验证：三张表 rows 应等于 uniq ----------
-- select 'shijing' t, count(*) rows, count(distinct title) uniq from shijing
-- union all select 'news', count(*), count(distinct url) from news
-- union all select 'quotes', count(*), count(distinct quote) from quotes;
