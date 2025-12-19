-- Створення таблиці для логів часу виконання задач
-- Ця міграція обробляє всі випадки: якщо таблиця існує чи ні, якщо колонки є чи ні

-- Крок 1: Видаляємо старий VIEW якщо він існує (щоб не було конфліктів)
DROP VIEW IF EXISTS assigned_tasks_with_time_stats;

-- Крок 2: Перевіряємо чи існує таблиця і чи має правильну структуру
DO $$
BEGIN
  -- Якщо таблиця не існує, створюємо її
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'task_time_logs'
  ) THEN
    CREATE TABLE task_time_logs (
      id SERIAL PRIMARY KEY,
      assigned_task_id INTEGER NOT NULL REFERENCES assigned_tasks(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      start_time TIMESTAMP WITH TIME ZONE NOT NULL,
      end_time TIMESTAMP WITH TIME ZONE DEFAULT NULL,
      log_status VARCHAR(50) NOT NULL DEFAULT 'in_progress',
      duration_minutes INTEGER DEFAULT NULL,
      action VARCHAR(50) NOT NULL DEFAULT 'start', -- 'start', 'pause', 'resume', 'stop'
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
  ELSE
    -- Таблиця існує - перевіряємо та додаємо відсутні колонки
    
    -- Перейменовуємо status на log_status якщо потрібно
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'task_time_logs' 
      AND column_name = 'status'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'task_time_logs' 
      AND column_name = 'log_status'
    ) THEN
      ALTER TABLE task_time_logs RENAME COLUMN status TO log_status;
    END IF;
    
    -- Додаємо start_time якщо немає
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'task_time_logs' 
      AND column_name = 'start_time'
    ) THEN
      ALTER TABLE task_time_logs ADD COLUMN start_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW();
    END IF;
    
    -- Додаємо end_time якщо немає
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'task_time_logs' 
      AND column_name = 'end_time'
    ) THEN
      ALTER TABLE task_time_logs ADD COLUMN end_time TIMESTAMP WITH TIME ZONE DEFAULT NULL;
    END IF;
    
    -- Додаємо log_status якщо немає
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'task_time_logs' 
      AND column_name = 'log_status'
    ) THEN
      ALTER TABLE task_time_logs ADD COLUMN log_status VARCHAR(50) NOT NULL DEFAULT 'in_progress';
    END IF;
    
    -- Додаємо duration_minutes якщо немає
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'task_time_logs' 
      AND column_name = 'duration_minutes'
    ) THEN
      ALTER TABLE task_time_logs ADD COLUMN duration_minutes INTEGER DEFAULT NULL;
    END IF;
    
    -- Додаємо created_at якщо немає
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'task_time_logs' 
      AND column_name = 'created_at'
    ) THEN
      ALTER TABLE task_time_logs ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
    
    -- Додаємо updated_at якщо немає
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'task_time_logs' 
      AND column_name = 'updated_at'
    ) THEN
      ALTER TABLE task_time_logs ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
    END IF;
    
    -- Додаємо assigned_task_id якщо немає
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'task_time_logs' 
      AND column_name = 'assigned_task_id'
    ) THEN
      ALTER TABLE task_time_logs ADD COLUMN assigned_task_id INTEGER NOT NULL REFERENCES assigned_tasks(id) ON DELETE CASCADE;
    END IF;
    
    -- Додаємо user_id якщо немає
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'task_time_logs' 
      AND column_name = 'user_id'
    ) THEN
      ALTER TABLE task_time_logs ADD COLUMN user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE;
    END IF;
    
    -- Додаємо action якщо немає (або змінюємо обмеження якщо вже існує)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'task_time_logs' 
      AND column_name = 'action'
    ) THEN
      ALTER TABLE task_time_logs ADD COLUMN action VARCHAR(50) NOT NULL DEFAULT 'start';
    ELSE
      -- Якщо колонка існує, переконаємося що вона має значення за замовчуванням
      ALTER TABLE task_time_logs ALTER COLUMN action SET DEFAULT 'start';
      -- Оновлюємо NULL значення на 'start'
      UPDATE task_time_logs SET action = 'start' WHERE action IS NULL;
      -- Якщо колонка дозволяє NULL, змінюємо на NOT NULL
      ALTER TABLE task_time_logs ALTER COLUMN action SET NOT NULL;
    END IF;
  END IF;
END $$;

-- Крок 3: Видаляємо старий check constraint якщо він існує та створюємо новий
DO $$
DECLARE
  r RECORD;
BEGIN
  -- Видаляємо старий constraint якщо він існує (може бути з різними назвами)
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'task_time_logs_action_check'
    AND conrelid = 'task_time_logs'::regclass
  ) THEN
    ALTER TABLE task_time_logs DROP CONSTRAINT task_time_logs_action_check;
  END IF;
  
  -- Знаходимо та видаляємо всі constraints з action
  FOR r IN (
    SELECT conname FROM pg_constraint 
    WHERE conname LIKE '%action%check%'
    AND conrelid = 'task_time_logs'::regclass
  ) LOOP
    EXECUTE 'ALTER TABLE task_time_logs DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
  END LOOP;
END $$;

-- Створюємо check constraint для action з правильними значеннями
ALTER TABLE task_time_logs 
ADD CONSTRAINT task_time_logs_action_check 
CHECK (action IN ('start', 'pause', 'resume', 'stop'));

-- Крок 4: Створюємо індекси
CREATE INDEX IF NOT EXISTS idx_task_time_logs_assigned_task_id ON task_time_logs(assigned_task_id);
CREATE INDEX IF NOT EXISTS idx_task_time_logs_user_id ON task_time_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_task_time_logs_status ON task_time_logs(log_status);
CREATE INDEX IF NOT EXISTS idx_task_time_logs_start_time ON task_time_logs(start_time);

-- Крок 5: Додаємо коментарі
COMMENT ON TABLE task_time_logs IS 'Логи часу виконання задач. Зберігає інформацію про початок, паузи та завершення роботи над задачами.';
COMMENT ON COLUMN task_time_logs.assigned_task_id IS 'ID призначеної задачі';
COMMENT ON COLUMN task_time_logs.user_id IS 'ID користувача, який виконує задачу';
COMMENT ON COLUMN task_time_logs.start_time IS 'Час початку роботи над задачею';
COMMENT ON COLUMN task_time_logs.end_time IS 'Час завершення роботи над задачею (NULL якщо ще працює)';
COMMENT ON COLUMN task_time_logs.log_status IS 'Статус логу: in_progress (в роботі), paused (призупинено), completed (завершено)';
COMMENT ON COLUMN task_time_logs.duration_minutes IS 'Тривалість сесії в хвилинах (для пауз та завершених сесій)';
COMMENT ON COLUMN task_time_logs.action IS 'Дія: start (початок), pause (пауза), resume (відновлення), stop (завершення)';

-- Крок 6: Створюємо тригер
DROP TRIGGER IF EXISTS update_task_time_logs_updated_at ON task_time_logs;
CREATE TRIGGER update_task_time_logs_updated_at
  BEFORE UPDATE ON task_time_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Крок 7: Створюємо VIEW для розрахунку статусу та часу виконання задач з логів
CREATE OR REPLACE VIEW assigned_tasks_with_time_stats AS
SELECT 
  at.*,
  -- Розраховуємо статус з логів
  CASE 
    -- Якщо є активний лог (в роботі)
    WHEN EXISTS (
      SELECT 1 FROM task_time_logs ttl 
      WHERE ttl.assigned_task_id = at.id 
      AND ttl.log_status = 'in_progress' 
      AND ttl.end_time IS NULL
    ) THEN 'in_progress'
    -- Якщо є призупинений лог
    WHEN EXISTS (
      SELECT 1 FROM task_time_logs ttl 
      WHERE ttl.assigned_task_id = at.id 
      AND ttl.log_status = 'paused'
      AND NOT EXISTS (
        SELECT 1 FROM task_time_logs ttl2 
        WHERE ttl2.assigned_task_id = at.id 
        AND ttl2.log_status = 'in_progress' 
        AND ttl2.end_time IS NULL
      )
    ) THEN 'paused'
    -- Якщо є завершений лог
    WHEN EXISTS (
      SELECT 1 FROM task_time_logs ttl 
      WHERE ttl.assigned_task_id = at.id 
      AND ttl.log_status = 'completed'
    ) THEN 'completed'
    -- Інакше - не розпочато
    ELSE NULL
  END AS calculated_task_status,
  -- Розраховуємо загальний час виконання (сума всіх duration_minutes + поточний час активної задачі)
  COALESCE((
    SELECT SUM(COALESCE(ttl.duration_minutes, 0))
    FROM task_time_logs ttl
    WHERE ttl.assigned_task_id = at.id
    AND ttl.duration_minutes IS NOT NULL
  ), 0) + 
  COALESCE((
    SELECT EXTRACT(EPOCH FROM (NOW() - ttl.start_time))::INTEGER / 60
    FROM task_time_logs ttl
    WHERE ttl.assigned_task_id = at.id
    AND ttl.log_status = 'in_progress'
    AND ttl.end_time IS NULL
    LIMIT 1
  ), 0) AS calculated_completion_time_minutes,
  -- Розраховуємо дату завершення (дата останнього завершеного логу)
  (
    SELECT MAX(ttl.end_time::DATE)
    FROM task_time_logs ttl
    WHERE ttl.assigned_task_id = at.id
    AND ttl.log_status = 'completed'
    AND ttl.end_time IS NOT NULL
  ) AS calculated_completion_date
FROM assigned_tasks at;

COMMENT ON VIEW assigned_tasks_with_time_stats IS 'View для отримання призначених задач з розрахованими статусом та часом виконання з логів task_time_logs';
