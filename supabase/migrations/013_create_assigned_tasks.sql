-- Створення таблиці assigned_tasks (призначені задачі)
-- Ця таблиця зберігає інформацію про призначення планових задач клієнтам
CREATE TABLE IF NOT EXISTS assigned_tasks (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  group_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  executor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- Унікальна комбінація задачі та клієнта (одна задача може бути призначена клієнту тільки один раз)
  UNIQUE(task_id, client_id)
);

-- Індекси для швидшого пошуку
CREATE INDEX IF NOT EXISTS idx_assigned_tasks_task_id ON assigned_tasks(task_id);
CREATE INDEX IF NOT EXISTS idx_assigned_tasks_client_id ON assigned_tasks(client_id);
CREATE INDEX IF NOT EXISTS idx_assigned_tasks_department_id ON assigned_tasks(department_id);
CREATE INDEX IF NOT EXISTS idx_assigned_tasks_group_id ON assigned_tasks(group_id);
CREATE INDEX IF NOT EXISTS idx_assigned_tasks_executor_id ON assigned_tasks(executor_id);
CREATE INDEX IF NOT EXISTS idx_assigned_tasks_is_active ON assigned_tasks(is_active);

-- Коментарі для документації
COMMENT ON TABLE assigned_tasks IS 'Таблиця призначених задач. Зберігає інформацію про призначення планових задач клієнтам.';
COMMENT ON COLUMN assigned_tasks.task_id IS 'ID задачі з таблиці tasks';
COMMENT ON COLUMN assigned_tasks.client_id IS 'ID клієнта з таблиці clients';
COMMENT ON COLUMN assigned_tasks.department_id IS 'ID відділу з таблиці departments. Може бути NULL, якщо задача призначена на весь відділ.';
COMMENT ON COLUMN assigned_tasks.group_id IS 'ID тім ліда (користувача) з таблиці users. Вказує на тім ліда, який призначив задачу.';
COMMENT ON COLUMN assigned_tasks.executor_id IS 'ID виконавця (користувача) з таблиці users. Вказує на співробітника, якому призначена задача.';
COMMENT ON COLUMN assigned_tasks.is_active IS 'Статус задачі: TRUE - включена (активна), FALSE - виключена (неактивна). За замовчуванням TRUE.';

-- Тригер для автоматичного оновлення updated_at (якщо функція update_updated_at_column() існує)
-- Перевіряємо, чи існує функція перед створенням тригера
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    CREATE TRIGGER update_assigned_tasks_updated_at
      BEFORE UPDATE ON assigned_tasks
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

