/**
 * Отримує CSS клас для статус-бейджа
 * @param status - Статус (active, inactive, completed, in_progress, pending)
 * @returns CSS клас для статус-бейджа
 */
export function getStatusBadgeClass(status?: string): string {
  switch (status) {
    case 'active':
    case 'completed':
      return 'status-active'
    case 'in_progress':
      return 'status-badge'
    case 'inactive':
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
      return 'Неактивний'
    case 'completed':
      return 'Виконано'
    case 'in_progress':
      return 'В процесі'
    case 'pending':
      return 'Очікує'
    default:
      return 'Не вказано'
  }
}

/**
 * Отримує текстовий опис типу задачі
 * @param type - Тип задачі
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
    default:
      return 'Одиночна'
  }
}

