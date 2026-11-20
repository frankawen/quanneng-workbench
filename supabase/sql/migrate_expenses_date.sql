-- ============================================================
-- 迁移 expenses.date 从 TEXT 到 DATE 类型
-- 执行前请备份数据！
-- ============================================================

-- 1. 先检查现有数据格式
SELECT DISTINCT date, pg_typeof(date) FROM expenses LIMIT 20;

-- 2. 创建临时列（新类型）
ALTER TABLE expenses ADD COLUMN date_new DATE;

-- 3. 数据迁移：TEXT (YYYY-MM-DD) -> DATE
-- 假设所有数据都是标准 ISO 格式 YYYY-MM-DD
UPDATE expenses
SET date_new = date::DATE
WHERE date ~ '^\d{4}-\d{2}-\d{2}$';

-- 4. 检查迁移结果（应为 0 行）
SELECT * FROM expenses WHERE date_new IS NULL AND date IS NOT NULL;

-- 5. 删除旧列、重命名新列
ALTER TABLE expenses DROP COLUMN date;
ALTER TABLE expenses RENAME COLUMN date_new TO date;

-- 6. 重建索引
DROP INDEX IF EXISTS idx_expenses_date;
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);

-- 7. 验证
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'expenses' AND column_name = 'date';

-- 应显示: date | date