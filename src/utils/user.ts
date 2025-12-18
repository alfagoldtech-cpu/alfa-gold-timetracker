import type { User } from '../types/database'

/**
 * Формує повне ім'я користувача з прізвища, імені та по батькові
 * @param user - Об'єкт користувача
 * @returns Повне ім'я або '-' якщо дані відсутні
 */
export function getFullName(user: User | { surname?: string; name?: string; middle_name?: string }): string {
  const parts = [user.surname, user.name, user.middle_name].filter(Boolean)
  return parts.join(' ') || '-'
}

