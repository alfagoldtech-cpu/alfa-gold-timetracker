/**
 * Видаляє суфікси з назви задачі (місяці, квартали)
 * Наприклад: "Податкова звітність - Січень" -> "Податкова звітність"
 */
export const getBaseTaskName = (taskName: string): string => {
  if (!taskName) return ''
  
  // Видаляємо суфікси типу " - Січень", " - 1 квартал" тощо
  const monthPattern = / - (Січень|Лютий|Березень|Квітень|Травень|Червень|Липень|Серпень|Вересень|Жовтень|Листопад|Грудень)$/
  const quarterPattern = / - \d+ квартал$/
  
  let baseName = taskName
  baseName = baseName.replace(monthPattern, '')
  baseName = baseName.replace(quarterPattern, '')
  
  return baseName.trim()
}

