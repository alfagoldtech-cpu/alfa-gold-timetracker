-- Видалення колонки status з таблиці tasks
-- Спочатку видаляємо індекс, якщо він існує
DROP INDEX IF EXISTS idx_tasks_status;

-- Видаляємо колонку status
ALTER TABLE tasks DROP COLUMN IF EXISTS status;




