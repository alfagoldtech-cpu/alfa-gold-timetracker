/**
 * Отримує CSS клас для статус-бейджа
 * @param status - Статус (active, inactive, completed, in_progress, pending, overdue, no_executor, not_started)
 * @returns CSS клас для статус-бейджа
 */
export function getStatusBadgeClass(status?: string): string {
  switch (status) {
    case 'active':
    case 'completed':
    case 'not_started':
      return 'status-active'
    case 'in_progress':
      return 'status-badge'
    case 'paused':
      return 'status-badge'
    case 'overdue':
      return 'status-overdue'
    case 'inactive':
    case 'no_executor':
      return 'status-inactive'
    case 'pending':
    default:
      return 'status-inactive'
  }
}

/**
 * Отримує текстовий опис статусу українською
 * @param status - Статус
 * @returns Текстовий опис статусу
 */
export function getStatusText(status?: string): string {
  switch (status) {
    case 'active':
      return 'Активний'
    case 'inactive':
      return 'Не активна'
    case 'completed':
      return 'Виконано'
    case 'in_progress':
      return 'В процесі'
    case 'paused':
      return 'Призупинено'
    case 'pending':
      return 'Очікує'
    case 'overdue':
      return 'Протермінована'
    case 'no_executor':
      return 'Не назначено виконавця'
    case 'not_started':
      return 'Не розпочато'
    default:
      return 'Не вказано'
  }
}

/**
 * Отримує текстовий опис типу повторюваності задачі
 * @param type - Тип повторюваності (month, quarter, year, single)
 * @returns Текстовий опис типу
 */
export function getTaskTypeText(type?: string): string {
  switch (type) {
    case 'month':
      return 'Місяць'
    case 'quarter':
      return 'Квартал'
    case 'year':
      return 'Рік'
    case 'single':
      return 'Одиночна'
    case 'Планова задача':
      return 'Планова задача'
    case 'Індивідуальна задача':
      return 'Індивідуальна задача'
    case 'Власна задача':
      return 'Власна задача'
    default:
      return type || 'Не вказано'
  }
}

/**
 * Автоматично визначає статус задачі на основі її властивостей
 * @param task - Призначена задача з деталями
 * @returns Статус задачі (inactive, task_status, no_executor, overdue, not_started)
 */
export function getTaskStatus(task: {
  is_active: boolean
  task_status?: string | null
  executor_id?: number | null
  completion_date?: string | null
  task?: {
    planned_date?: string
  } | null
}): string {
  // 1. Якщо задача не активна - завжди "Не активна" (пріоритет найвищий)
  if (!task.is_active) {
    return 'inactive'
  }

  // Якщо є явний статус з БД - використовуємо його (тільки для активних задач)
  if (task.task_status) {
    return task.task_status
  }

  // 2. Якщо задача активна але немає виконавця - "Не назначено виконавця"
  if (!task.executor_id) {
    return 'no_executor'
  }

  // 3. Перевіряємо чи задача протермінована
  const plannedDate = task.task?.planned_date
  if (plannedDate) {
    const planned = new Date(plannedDate.split('T')[0])
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    planned.setHours(0, 0, 0, 0)
    
    // Якщо задача не виконана (немає completion_date) і дата менша за сьогодні - "Протермінована"
    if (!task.completion_date && planned < today) {
      return 'overdue'
    }
  }

  // 4. Якщо задача активна, має виконавця, але немає статусу - "Не розпочато"
  return 'not_started'
}

