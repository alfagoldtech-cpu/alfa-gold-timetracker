-- Міграція для оновлення group_id в існуючих призначених задачах
-- Ця міграція встановлює правильний group_id для задач, які його не мають

-- 1. Оновлюємо group_id для задач з виконавцем, але без group_id
-- Беремо group_id з виконавця
UPDATE assigned_tasks at
SET group_id = u.group_id
FROM users u
WHERE at.executor_id = u.id
  AND at.group_id IS NULL
  AND u.group_id IS NOT NULL;

-- 2. Для задач без виконавця (executor_id IS NULL) і без group_id
-- Спробуємо знайти group_id через відділ (department_id)
-- Якщо відділ має користувачів з group_id, беремо найчастіший group_id серед них
-- (тім ліди мають group_id = NULL, тому автоматично виключаються)
UPDATE assigned_tasks at
SET group_id = (
  SELECT u.group_id
  FROM user_departments ud
  JOIN users u ON ud.user_id = u.id
  WHERE ud.department_id = at.department_id
    AND u.group_id IS NOT NULL
  GROUP BY u.group_id
  ORDER BY COUNT(*) DESC
  LIMIT 1
)
WHERE at.executor_id IS NULL
  AND at.group_id IS NULL
  AND at.department_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM user_departments ud
    JOIN users u ON ud.user_id = u.id
    WHERE ud.department_id = at.department_id
      AND u.group_id IS NOT NULL
  );

-- 3. Для задач без виконавця і без відділу, але з клієнтом
-- Спробуємо знайти group_id через клієнта (через відділи клієнта)
-- (тім ліди мають group_id = NULL, тому автоматично виключаються)
UPDATE assigned_tasks at
SET group_id = (
  SELECT u.group_id
  FROM client_departments cd
  JOIN user_departments ud ON cd.department_id = ud.department_id
  JOIN users u ON ud.user_id = u.id
  WHERE cd.client_id = at.client_id
    AND u.group_id IS NOT NULL
  GROUP BY u.group_id
  ORDER BY COUNT(*) DESC
  LIMIT 1
)
WHERE at.executor_id IS NULL
  AND at.group_id IS NULL
  AND at.department_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM client_departments cd
    JOIN user_departments ud ON cd.department_id = ud.department_id
    JOIN users u ON ud.user_id = u.id
    WHERE cd.client_id = at.client_id
      AND u.group_id IS NOT NULL
  );

-- Логування: підрахунок оновлених записів
DO $$
DECLARE
  updated_with_executor INTEGER;
  updated_with_department INTEGER;
  updated_with_client INTEGER;
  remaining_null INTEGER;
BEGIN
  -- Підрахунок оновлених записів
  SELECT COUNT(*) INTO updated_with_executor
  FROM assigned_tasks
  WHERE executor_id IS NOT NULL
    AND group_id IS NOT NULL;
  
  SELECT COUNT(*) INTO updated_with_department
  FROM assigned_tasks
  WHERE executor_id IS NULL
    AND department_id IS NOT NULL
    AND group_id IS NOT NULL;
  
  SELECT COUNT(*) INTO updated_with_client
  FROM assigned_tasks
  WHERE executor_id IS NULL
    AND department_id IS NULL
    AND group_id IS NOT NULL;
  
  SELECT COUNT(*) INTO remaining_null
  FROM assigned_tasks
  WHERE group_id IS NULL;
  
  RAISE NOTICE 'Оновлено задач з виконавцем: %', updated_with_executor;
  RAISE NOTICE 'Оновлено задач через відділ: %', updated_with_department;
  RAISE NOTICE 'Оновлено задач через клієнта: %', updated_with_client;
  RAISE NOTICE 'Залишилося задач без group_id: %', remaining_null;
END $$;

-- Коментарі для документації
COMMENT ON COLUMN assigned_tasks.group_id IS 'ID тім ліда (користувача) з таблиці users. Вказує на тім ліда, який призначив задачу. Має бути встановлений завжди, навіть якщо executor_id не встановлений.';

