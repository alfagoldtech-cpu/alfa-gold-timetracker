-- Виправлення: якщо таблиця вже існує з колонкою status, перейменовуємо її на log_status
-- Це потрібно для уникнення конфліктів з іншими таблицями

-- Перевіряємо чи існує таблиця та колонка status
DO $$
BEGIN
  -- Якщо таблиця існує і має колонку status, перейменовуємо її
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'task_time_logs' 
    AND column_name = 'status'
  ) THEN
    ALTER TABLE task_time_logs RENAME COLUMN status TO log_status;
  END IF;
END $$;

-- Якщо таблиця не існує, створюємо її з правильною назвою колонки
CREATE TABLE IF NOT EXISTS task_time_logs (
  id SERIAL PRIMARY KEY,
  assigned_task_id INTEGER NOT NULL REFERENCES assigned_tasks(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  log_status VARCHAR(50) NOT NULL DEFAULT 'in_progress', -- 'in_progress', 'paused', 'completed'
  duration_minutes INTEGER DEFAULT NULL, -- Тривалість сесії в хвилинах (для пауз)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Додаємо колонку log_status якщо її немає
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'task_time_logs' 
    AND column_name = 'log_status'
  ) THEN
    ALTER TABLE task_time_logs ADD COLUMN log_status VARCHAR(50) NOT NULL DEFAULT 'in_progress';
  END IF;
END $$;

-- Індекси для швидшого пошуку
CREATE INDEX IF NOT EXISTS idx_task_time_logs_assigned_task_id ON task_time_logs(assigned_task_id);
CREATE INDEX IF NOT EXISTS idx_task_time_logs_user_id ON task_time_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_task_time_logs_status ON task_time_logs(log_status);
CREATE INDEX IF NOT EXISTS idx_task_time_logs_start_time ON task_time_logs(start_time);

-- Коментарі для документації
COMMENT ON TABLE task_time_logs IS 'Логи часу виконання задач. Зберігає інформацію про початок, паузи та завершення роботи над задачами.';
COMMENT ON COLUMN task_time_logs.assigned_task_id IS 'ID призначеної задачі';
COMMENT ON COLUMN task_time_logs.user_id IS 'ID користувача, який виконує задачу';
COMMENT ON COLUMN task_time_logs.start_time IS 'Час початку роботи над задачею';
COMMENT ON COLUMN task_time_logs.end_time IS 'Час завершення роботи над задачею (NULL якщо ще працює)';
COMMENT ON COLUMN task_time_logs.log_status IS 'Статус логу: in_progress (в роботі), paused (призупинено), completed (завершено)';
COMMENT ON COLUMN task_time_logs.duration_minutes IS 'Тривалість сесії в хвилинах (для пауз та завершених сесій)';

-- Тригер для автоматичного оновлення updated_at
DROP TRIGGER IF EXISTS update_task_time_logs_updated_at ON task_time_logs;
CREATE TRIGGER update_task_time_logs_updated_at
  BEFORE UPDATE ON task_time_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();




