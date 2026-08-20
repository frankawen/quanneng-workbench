-- 全能工作台 Supabase Schema
-- 数据库：NoSQL (Supabase PostgreSQL)

-- 1. 记账理财表
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount DECIMAL(10, 2) NOT NULL,
  type VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense')),
  category VARCHAR(50) NOT NULL,
  description TEXT,
  date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE expenses IS '收支记录';

-- 2. 预算表
CREATE TABLE budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  month VARCHAR(7) NOT NULL, -- '2026-08'
  total DECIMAL(10, 2) NOT NULL,
  category_budgets JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, month)
);

-- 3. 习惯表
CREATE TABLE habits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('checkbox', 'counter', 'value')),
  target INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE habits IS '习惯列表';

-- 4. 习惯打卡记录
CREATE TABLE habit_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id UUID NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  value INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(habit_id, date)
);

COMMENT ON TABLE habit_records IS '习惯打卡记录';

-- 5. 身体数据记录
CREATE TABLE body_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  weight DECIMAL(5, 2) NOT NULL,
  body_fat DECIMAL(5, 2),
  bmi DECIMAL(5, 2),
  notes TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE body_records IS '体重体脂记录';

-- 6. 健身计划
CREATE TABLE workout_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week VARCHAR(10) NOT NULL,
  day INTEGER NOT NULL,
  exercise VARCHAR(200) NOT NULL,
  sets INTEGER,
  reps INTEGER,
  duration INTEGER, -- 分钟
  calories_burned INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE workout_plans IS '周健身计划';

-- 7. 待买清单
CREATE TABLE wishlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  price DECIMAL(10, 2),
  urgency VARCHAR(10) NOT NULL CHECK (urgency IN ('high', 'medium', 'low')),
  purchased BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE wishlist IS '待买清单';

-- 8. 新闻表
CREATE TABLE news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(500) NOT NULL,
  source VARCHAR(100),
  url TEXT NOT NULL,
  date DATE NOT NULL,
  category VARCHAR(50),
  crawled_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE news IS '界面快报';

-- 9. 诗经表
CREATE TABLE shijing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  section VARCHAR(50) NOT NULL, -- 国风/小雅/大雅/颂
  content TEXT NOT NULL,
  translation TEXT,
  notes TEXT,
  appreciation TEXT,
  crawled_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE shijing IS '诗经全文';

-- 10. 名句表
CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote TEXT NOT NULL,
  author VARCHAR(100),
  source VARCHAR(200),
  translation TEXT,
  notes TEXT,
  appreciation TEXT,
  crawled_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE quotes IS '历代名句';

-- 11. 评论表（人民日报05版）
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(500) NOT NULL,
  subtitle VARCHAR(500),
  author VARCHAR(100),
  date DATE NOT NULL,
  content TEXT,
  type VARCHAR(50), -- 人民时评/纵深/现场评论
  url TEXT NOT NULL,
  crawled_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE comments IS '人民日报评论';

-- 创建索引
CREATE INDEX idx_expenses_date ON expenses(date);
CREATE INDEX idx_expenses_type ON expenses(type);
CREATE INDEX idx_habit_records_date ON habit_records(date);
CREATE INDEX idx_body_records_date ON body_records(date);
CREATE INDEX idx_news_date ON news(date);
CREATE INDEX idx_comments_date ON comments(date);
CREATE INDEX idx_quotes_crawled ON quotes(crawled_at DESC);

-- 启用 RLS (Row Level Security)
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

-- 公共读取策略
CREATE POLICY "允许匿名读取" ON expenses FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "允许匿名读取" ON habits FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "允许匿名读取" ON habit_records FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "允许匿名读取" ON body_records FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "允许匿名读取" ON wishlist FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "允许匿名读取" ON news FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "允许匿名读取" ON shijing FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "允许匿名读取" ON quotes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "允许匿名读取" ON comments FOR SELECT TO anon, authenticated USING (true);

-- 写入策略（仅登录用户）
CREATE POLICY "允许登录用户写入" ON expenses FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "允许登录用户写入" ON habits FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "允许登录用户写入" ON habit_records FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "允许登录用户写入" ON body_records FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "允许登录用户写入" ON wishlist FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "允许登录用户写入" ON workout_plans FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "允许登录用户写入" ON budgets FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
