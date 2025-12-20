import { getTaskTimeStats } from '../lib/taskTimeLogs'
import { getTaskStatus } from './status'
import type { AssignedTaskWithDetails } from '../lib/assignedTasks'

/**
 * Отримує актуальний статус задачі з урахуванням активного трекера, БД та статистики
 * Використовується для уніфікованого відображення статусів на всіх сторінках
 * 
 * @param task - Призначена задача
 * @param activeTaskId - ID активної задачі (якщо є)
 * @param stats - Статистика з логів (опціонально, якщо вже завантажена)
 * @returns Статус задачі
 */
export async function getActualTaskStatus(
  task: AssignedTaskWithDetails,
  activeTaskId?: number | null,
  stats?: { status: string | null; totalMinutes: number; completionDate: string | null } | null
): Promise<string> {
  // 1. Якщо задача активна (запущена в трекері) - завжди "in_progress"
  if (activeTaskId === task.id) {
    return 'in_progress'
  }

  // 2. Пріоритет: використовуємо статус з БД (assigned_tasks.task_status)
  if (task.task_status) {
    return task.task_status
  }

  // 3. Якщо статистика вже завантажена, використовуємо її
  if (stats?.status) {
    return stats.status
  }

  // 4. Якщо статистика не завантажена, завантажуємо її
  try {
    const taskStats = await getTaskTimeStats(task.id)
    if (taskStats.status) {
      return taskStats.status
    }
  } catch (err) {
    console.error(`Error loading stats for task ${task.id}:`, err)
  }

  // 5. Автоматичне визначення статусу
  return getTaskStatus(task)
}

/**
 * Синхронна версія для визначення статусу (без завантаження статистики)
 * Використовується коли статистика вже завантажена або не потрібна
 */
export function getActualTaskStatusSync(
  task: AssignedTaskWithDetails,
  activeTaskId?: number | null,
  stats?: { status: string | null; totalMinutes: number; completionDate: string | null } | null
): string {
  // 1. Якщо задача активна (запущена в трекері) - завжди "in_progress"
  if (activeTaskId === task.id) {
    return 'in_progress'
  }

  // 2. Пріоритет: використовуємо статус з БД (assigned_tasks.task_status)
  if (task.task_status) {
    return task.task_status
  }

  // 3. Якщо статистика завантажена, використовуємо її
  if (stats?.status) {
    return stats.status
  }

  // 4. Автоматичне визначення статусу
  return getTaskStatus(task)
}

