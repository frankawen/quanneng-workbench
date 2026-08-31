-- 词语积累数据表
-- 用途：前端用户自定义收藏想记的词语，支持手动添加、拍照识别、按分类查看
--       每日一读的名句卡片可一键「＋ 收藏」到这里
-- 在 Supabase 控制台 SQL Editor 全选执行即可
-- （https://supabase.com/dashboard/project/wentfvkdfecrfelgmdix/sql/new）
create table if not exists public.wordbank (
  id          uuid primary key default gen_random_uuid(),
  word        text not null,                                   -- 词语
  meaning     text default '',                                 -- 释义 / 备注
  category    text default '未分类',                           -- 词语分类（成语/诗词/名言/英语/专业术语/其他…）
  source      text default '',                                 -- 来源（出处 / 作者）
  created_at  timestamptz default now()                        -- 写入时间
);

-- 索引：按写入时间倒序取最新；按分类筛选
create index if not exists wordbank_created_idx on public.wordbank (created_at desc);
create index if not exists wordbank_cat_idx on public.wordbank (category);

-- 前端使用 publishable (anon) key 直连 REST，需放开匿名读写删
alter table public.wordbank enable row level security;

drop policy if exists "wordbank anon all" on public.wordbank;
create policy "wordbank anon all"
  on public.wordbank for all
  using (true) with check (true);
