-- 修复 daily_read 表的写入权限
-- 背景：create_daily_read.sql 只建了 "public read" 策略，导致：
--   - 用 service key（GitHub Actions）写入正常（service key 绕过 RLS）
--   - 用 anon/publishable key 写入被拒：42501 new row violates row-level security policy
-- 本脚本补齐 anon 的 INSERT/UPDATE/DELETE，与 news/quotes/comments 等表保持一致。

-- 允许匿名写入（爬虫 upsert）
drop policy if exists "daily_read anon insert" on public.daily_read;
create policy "daily_read anon insert"
  on public.daily_read for insert
  to anon, authenticated
  with check (true);

-- 允许匿名更新（爬虫 upsert 冲突时更新）
drop policy if exists "daily_read anon update" on public.daily_read;
create policy "daily_read anon update"
  on public.daily_read for update
  to anon, authenticated
  using (true)
  with check (true);

-- 允许匿名删除（爬虫清理旧数据）
drop policy if exists "daily_read anon delete" on public.daily_read;
create policy "daily_read anon delete"
  on public.daily_read for delete
  to anon, authenticated
  using (true);

-- 验证：应看到 read / insert / update / delete 四条策略
-- select policyname, cmd from pg_policies where tablename = 'daily_read';
