-- Додавання полів для статусу задачі, дати виконання та часу виконання
-- Ці поля будуть використовуватися для логування та аналізу виконання задач

-- Додаємо поле статусу задачі
ALTER TABLE assigned_tasks
ADD COLUMN IF NOT EXISTS task_status VARCHAR(50) DEFAULT NULL;

-- Додаємо поле дати виконання
ALTER TABLE assigned_tasks
ADD COLUMN IF NOT EXISTS completion_date DATE DEFAULT NULL;

-- Додаємо поле часу виконання (у хвилинах)
ALTER TABLE assigned_tasks
ADD COLUMN IF NOT EXISTS completion_time_minutes INTEGER DEFAULT NULL;

-- Додаємо індекси для швидшого пошуку
CREATE INDEX IF NOT EXISTS idx_assigned_tasks_task_status ON assigned_tasks(task_status);
CREATE INDEX IF NOT EXISTS idx_assigned_tasks_completion_date ON assigned_tasks(completion_date);

-- Коментарі для документації
COMMENT ON COLUMN assigned_tasks.task_status IS 'Статус виконання задачі (наприклад: "В роботі", "Виконано", "Відкладено", "Скасовано" тощо)';
COMMENT ON COLUMN assigned_tasks.completion_date IS 'Дата виконання задачі';
COMMENT ON COLUMN assigned_tasks.completion_time_minutes IS 'Час виконання задачі в хвилинах';





