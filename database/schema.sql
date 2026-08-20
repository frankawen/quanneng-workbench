-- ============================================================
-- 全能工作台数据库 Schema
-- 在 Supabase Dashboard → SQL Editor 中执行
-- ============================================================

-- 1. expenses（记账）
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,           -- 支出/收入
  amount DECIMAL(10,2) NOT NULL,
  category TEXT NOT NULL,       -- 餐饮/交通/购物等
  date TEXT NOT NULL,           -- YYYY-MM-DD
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. budgets（预算）
CREATE TABLE IF NOT EXISTS budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month TEXT NOT NULL,          -- YYYY-MM
  amount DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. habits（习惯）
CREATE TABLE IF NOT EXISTS habits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL,           -- check/count/value
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. habit_records（习惯打卡记录）
CREATE TABLE IF NOT EXISTS habit_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id UUID REFERENCES habits(id) ON DELETE CASCADE,
  date TEXT NOT NULL,           -- YYYY-MM-DD
  checked BOOLEAN DEFAULT false,
  count INTEGER DEFAULT 0,
  value DECIMAL(10,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. body_records（体重记录）
CREATE TABLE IF NOT EXISTS body_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date TEXT NOT NULL,
  weight DECIMAL(5,2) NOT NULL,
  body_fat DECIMAL(5,2),
  height DECIMAL(5,2),
  bmi DECIMAL(5,2),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. workout_plans（周计划）
CREATE TABLE IF NOT EXISTS workout_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week TEXT NOT NULL,           -- YYYY-Www
  day INTEGER NOT NULL,         -- 1-7
  exercise TEXT NOT NULL,
  sets INTEGER,
  reps INTEGER,
  duration INTEGER,             -- 分钟
  calories_burned DECIMAL(8,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. wishlist（待买清单）
CREATE TABLE IF NOT EXISTS wishlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price DECIMAL(10,2),
  priority TEXT NOT NULL DEFAULT '中',  -- 高/中/低
  category TEXT,
  note TEXT,
  purchased BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. news（新闻）
CREATE TABLE IF NOT EXISTS news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  source TEXT,
  url TEXT,
  date TEXT,
  category TEXT,
  crawled_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. shijing（诗经）
CREATE TABLE IF NOT EXISTS shijing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  section TEXT,                 -- 国风/小雅/大雅/颂
  content TEXT NOT NULL,
  url TEXT,
  crawled_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. quotes（名句）
CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote TEXT NOT NULL,
  author TEXT,
  source TEXT,
  crawled_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. comments（评论）
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  subtitle TEXT,
  author TEXT,
  date TEXT,
  type TEXT,                    -- 人民时评/纵深/评论
  url TEXT,
  crawled_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Row Level Security (RLS) 策略
-- ============================================================
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE body_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE news ENABLE ROW LEVEL SECURITY;
ALTER TABLE shijing ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- 公开读取（任何人可查）
CREATE POLICY "public_read" ON * FOR SELECT USING (true);

-- 允许写入（需要认证，但匿名登录也可）
CREATE POLICY "allow_insert" ON * FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_update" ON * FOR UPDATE USING (true);
CREATE POLICY "allow_delete" ON * FOR DELETE USING (true);

-- ============================================================
-- 索引优化
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_type ON expenses(type);
CREATE INDEX IF NOT EXISTS idx_habit_records_date ON habit_records(date);
CREATE INDEX IF NOT EXISTS idx_habit_records_habit ON habit_records(habit_id);
CREATE INDEX IF NOT EXISTS idx_body_records_date ON body_records(date);
CREATE INDEX IF NOT EXISTS idx_wishlist_purchased ON wishlist(purchased);
CREATE INDEX IF NOT EXISTS idx_news_crawled ON news(crawled_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_crawled ON quotes(crawled_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_crawled ON comments(crawled_at DESC);

-- ============================================================
-- 示例数据（可选，首次使用时删除）
-- ============================================================
-- INSERT INTO expenses (type, amount, category, date, note) VALUES
--   ('支出', 35.5, '餐饮', '2025-08-20', '午餐'),
--   ('收入', 8000, '工资', '2025-08-01', '工资');
-- INSERT INTO habits (name, type) VALUES ('早起', 'check'), ('喝水', 'count');
-- INSERT INTO body_records (date, weight, height, bmi) VALUES ('2025-08-20', 70.5, 175, 23.0);
