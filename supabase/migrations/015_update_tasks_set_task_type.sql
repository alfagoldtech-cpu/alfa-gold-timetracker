-- Оновлення типу задач для існуючих задач
-- Всі існуючі задачі, які були створені Керівником виробництва, мають тип "Планова задача"

-- Спочатку додаємо поле recurrence_type для зберігання типу повторюваності
ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS recurrence_type VARCHAR(50) DEFAULT NULL;

-- Переносимо старі типи повторюваності з task_type в recurrence_type
UPDATE tasks
SET recurrence_type = task_type
WHERE task_type IN ('month', 'quarter', 'year', 'single')
  AND recurrence_type IS NULL;

-- Тепер оновлюємо task_type на "Планова задача" для всіх існуючих задач
UPDATE tasks
SET task_type = 'Планова задача'
WHERE task_type IS NULL 
   OR task_type IN ('month', 'quarter', 'year', 'single')
   OR task_type NOT IN ('Планова задача', 'Індивідуальна задача', 'Власна задача');

-- Створюємо індекс для recurrence_type
CREATE INDEX IF NOT EXISTS idx_tasks_recurrence_type ON tasks(recurrence_type);

-- Коментарі для документації
COMMENT ON COLUMN tasks.task_type IS 'Тип задачі: "Планова задача" (створена Керівником виробництва), "Індивідуальна задача" (призначена кимось комусь), "Власна задача" (створена для себе)';
COMMENT ON COLUMN tasks.recurrence_type IS 'Тип повторюваності задачі: "month" (щомісячна), "quarter" (квартальна), "year" (річна), "single" (одноразова)';

