-- Міграція для додавання індексів для оптимізації продуктивності
-- Ця міграція додає композитні індекси для часто використовуваних комбінацій полів

-- ========== ASSIGNED_TASKS ==========
-- Композитні індекси для assigned_tasks (найчастіше використовувані комбінації)

-- Індекс для пошуку активних задач по клієнту (використовується в getAssignedTasksByClient)
CREATE INDEX IF NOT EXISTS idx_assigned_tasks_client_id_is_active 
ON assigned_tasks(client_id, is_active) 
WHERE is_active = true;

-- Індекс для пошуку задач виконавця з фільтрацією по групі (getAssignedTasksByExecutorAndGroup)
CREATE INDEX IF NOT EXISTS idx_assigned_tasks_executor_id_group_id 
ON assigned_tasks(executor_id, group_id);

-- Індекс для пошуку задач клієнта з фільтрацією по групі (getAssignedTasksByClientAndGroup)
CREATE INDEX IF NOT EXISTS idx_assigned_tasks_client_id_group_id 
ON assigned_tasks(client_id, group_id);

-- Індекс для пошуку активних задач по групі (getActiveAssignedTasksForTeamLead)
CREATE INDEX IF NOT EXISTS idx_assigned_tasks_group_id_is_active 
ON assigned_tasks(group_id, is_active) 
WHERE is_active = true;

-- Індекс для сортування по created_at (використовується в багатьох запитах)
CREATE INDEX IF NOT EXISTS idx_assigned_tasks_created_at_desc 
ON assigned_tasks(created_at DESC);

-- Композитний індекс для executor_id з сортуванням (getAssignedTasksForExecutor)
CREATE INDEX IF NOT EXISTS idx_assigned_tasks_executor_id_created_at 
ON assigned_tasks(executor_id, created_at DESC);

-- Композитний індекс для group_id з сортуванням (getActiveAssignedTasksForTeamLead)
CREATE INDEX IF NOT EXISTS idx_assigned_tasks_group_id_created_at 
ON assigned_tasks(group_id, created_at DESC);

-- ========== USERS ==========
-- Композитні індекси для users (часто використовувані комбінації)

-- Індекс для пошуку користувачів по проекту та ролі (часто використовується)
CREATE INDEX IF NOT EXISTS idx_users_project_id_role_id 
ON users(project_id, role_id);

-- Індекс для пошуку користувачів по проекту та групі (getUsersWithoutGroup)
CREATE INDEX IF NOT EXISTS idx_users_project_id_group_id 
ON users(project_id, group_id);

-- Індекс для сортування по прізвищу та імені (використовується в getTeamLeadGroupMembers)
CREATE INDEX IF NOT EXISTS idx_users_surname_name 
ON users(surname, name);

-- Композитний індекс для пошуку користувачів без групи (getUsersWithoutGroup)
CREATE INDEX IF NOT EXISTS idx_users_project_id_role_id_group_id 
ON users(project_id, role_id, group_id) 
WHERE group_id IS NULL;

-- ========== TASKS ==========
-- Індекс для сортування задач по planned_date (використовується для фільтрації по даті)
CREATE INDEX IF NOT EXISTS idx_tasks_planned_date_desc 
ON tasks(planned_date DESC);

-- Композитний індекс для project_id та planned_date (часто використовується разом)
CREATE INDEX IF NOT EXISTS idx_tasks_project_id_planned_date 
ON tasks(project_id, planned_date DESC);

-- ========== CLIENT_DEPARTMENTS ==========
-- Композитний індекс для пошуку відділів клієнта (getClientsWithDepartments)
-- Вже є PRIMARY KEY, але додаємо індекс для зворотного пошуку
CREATE INDEX IF NOT EXISTS idx_client_departments_department_id_client_id 
ON client_departments(department_id, client_id);

-- ========== USER_DEPARTMENTS ==========
-- Композитний індекс для пошуку користувачів по відділу (getUsersByDepartment)
-- Вже є PRIMARY KEY, але додаємо індекс для зворотного пошуку
CREATE INDEX IF NOT EXISTS idx_user_departments_department_id_user_id 
ON user_departments(department_id, user_id);

-- ========== COMMENTS ==========
COMMENT ON INDEX idx_assigned_tasks_client_id_is_active IS 'Індекс для швидкого пошуку активних задач по клієнту';
COMMENT ON INDEX idx_assigned_tasks_executor_id_group_id IS 'Індекс для пошуку задач виконавця з фільтрацією по групі';
COMMENT ON INDEX idx_assigned_tasks_client_id_group_id IS 'Індекс для пошуку задач клієнта з фільтрацією по групі';
COMMENT ON INDEX idx_assigned_tasks_group_id_is_active IS 'Індекс для пошуку активних задач по групі тім ліда';
COMMENT ON INDEX idx_assigned_tasks_created_at_desc IS 'Індекс для сортування задач по даті створення (DESC)';
COMMENT ON INDEX idx_assigned_tasks_executor_id_created_at IS 'Індекс для пошуку задач виконавця з сортуванням по даті';
COMMENT ON INDEX idx_assigned_tasks_group_id_created_at IS 'Індекс для пошуку задач групи з сортуванням по даті';
COMMENT ON INDEX idx_users_project_id_role_id IS 'Індекс для пошуку користувачів по проекту та ролі';
COMMENT ON INDEX idx_users_project_id_group_id IS 'Індекс для пошуку користувачів по проекту та групі';
COMMENT ON INDEX idx_users_surname_name IS 'Індекс для сортування користувачів по прізвищу та імені';
COMMENT ON INDEX idx_users_project_id_role_id_group_id IS 'Індекс для пошуку користувачів без групи';
COMMENT ON INDEX idx_tasks_planned_date_desc IS 'Індекс для сортування задач по запланованій даті';
COMMENT ON INDEX idx_tasks_project_id_planned_date IS 'Індекс для пошуку задач по проекту та запланованій даті';

