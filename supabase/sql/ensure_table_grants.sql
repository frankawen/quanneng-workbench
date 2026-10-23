-- ============================================================
-- supabase/sql/ensure_table_grants.sql
-- 固化 public 所有表的 Data API 授权（幂等，可反复执行）
--
-- 背景：Supabase 将于 2026-10-30 起，停止对「新建 public 表」自动授予
--       Data API 访问权。现有表不受影响（已验证 14 张表均带完整 acl），
--       但 10/30 之后新建的表必须显式 GRANT，否则 supabase-js / PostgREST
--       / GraphQL 会报 "permission denied"。
--
-- 用途：
--   1) 新建表后，跑一次本文件即可补授权（与现有表授权保持一致：
--      anon / authenticated / service_role 均 grant 全部 CRUD）。
--   2) 若日后 `supabase db reset` 或新建项目从迁移重建，可重跑本文件恢复授权。
--
-- 说明：
--   - 用 DO 块动态遍历当前 public 所有表，自动覆盖新增表，无需手列。
--   - GRANT 幂等：重复执行不会报错，也不会收回已有权限。
--   - 仅授权、不改数据、不动 RLS，非破坏性。
--
-- 使用：Supabase 控制台 → SQL Editor → 全选执行；或
--   supabase db query --linked -f ensure_table_grants.sql
-- ============================================================

do $$
declare
  t text;
begin
  for t in
    select tablename
    from pg_tables
    where schemaname = 'public'
    order by tablename
  loop
    -- 与现有表一致的授权粒度（anon 也带 CRUD，由 RLS 兜底写权限）
    execute format('grant select, insert, update, delete on public.%I to anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

-- ---------- 验证：应看到每张表 anon/authenticated/service_role 均有权 ----------
-- select c.relname as table_name,
--        coalesce(c.relacl::text, '(default: owner only)') as acl
-- from pg_class c
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public' and c.relkind = 'r'
-- order by c.relname;
