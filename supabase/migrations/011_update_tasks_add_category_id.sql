-- Додавання поля category_id до таблиці tasks
-- Спочатку додаємо нове поле category_id
ALTER TABLE tasks 
ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES tasks_category(id) ON DELETE SET NULL;

-- Створюємо індекс для category_id
CREATE INDEX IF NOT EXISTS idx_tasks_category_id ON tasks(category_id);

-- Міграція існуючих даних (якщо є категорії в текстовому форматі)
-- Створюємо категорії на основі унікальних значень category для кожного проекту
DO $$
DECLARE
  task_record RECORD;
  category_id_var INTEGER;
BEGIN
  -- Проходимо по всіх задачах з непустою категорією
  FOR task_record IN 
    SELECT DISTINCT project_id, category 
    FROM tasks 
    WHERE category IS NOT NULL AND category != '' AND category_id IS NULL
  LOOP
    -- Перевіряємо, чи існує вже така категорія для цього проекту
    SELECT id INTO category_id_var
    FROM tasks_category
    WHERE name = task_record.category AND project_id = task_record.project_id
    LIMIT 1;
    
    -- Якщо категорія не існує, створюємо її
    IF category_id_var IS NULL THEN
      INSERT INTO tasks_category (name, project_id)
      VALUES (task_record.category, task_record.project_id)
      RETURNING id INTO category_id_var;
    END IF;
    
    -- Оновлюємо всі задачі з цією категорією
    UPDATE tasks
    SET category_id = category_id_var
    WHERE project_id = task_record.project_id 
      AND category = task_record.category
      AND category_id IS NULL;
  END LOOP;
END $$;

-- Після міграції даних можна видалити старе поле category
-- АЛЕ: залишаємо його поки що для сумісності, можна видалити пізніше
-- ALTER TABLE tasks DROP COLUMN IF EXISTS category;

