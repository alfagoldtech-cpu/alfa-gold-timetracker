import { supabase } from './supabase'
import type { TaskTimeLog } from '../types/database'

/**
 * Отримує активний лог часу для користувача (задача в роботі)
 */
export async function getActiveTimeLogForUser(userId: number): Promise<TaskTimeLog | null> {
  const { data, error } = await supabase
    .from('task_time_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('log_status', 'in_progress')
    .is('end_time', null)
    .order('start_time', { ascending: false })
    .limit(1)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      // Немає записів
      return null
    }
    console.error('Error fetching active time log:', error)
    return null
  }

  return data
}

/**
 * Отримує активний лог часу для конкретної задачі
 */
export async function getActiveTimeLogForTask(assignedTaskId: number): Promise<TaskTimeLog | null> {
  const { data, error } = await supabase
    .from('task_time_logs')
    .select('*')
    .eq('assigned_task_id', assignedTaskId)
    .eq('log_status', 'in_progress')
    .is('end_time', null)
    .order('start_time', { ascending: false })
    .limit(1)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return null
    }
    console.error('Error fetching active time log for task:', error)
    return null
  }

  return data
}

/**
 * Створює новий лог часу (старт роботи над задачею)
 */
export async function startTaskTimeLog(assignedTaskId: number, userId: number): Promise<TaskTimeLog | null> {
  // Перевіряємо, чи немає вже активної задачі для цього користувача
  const activeLog = await getActiveTimeLogForUser(userId)
  if (activeLog) {
    throw new Error('У вас вже є активна задача в роботі. Спочатку завершіть або призупиніть поточну задачу.')
  }

  console.log('Creating time log for task:', assignedTaskId, 'user:', userId)
  
  const { data, error } = await supabase
    .from('task_time_logs')
    .insert({
      assigned_task_id: assignedTaskId,
      user_id: userId,
      start_time: new Date().toISOString(),
      log_status: 'in_progress'
    })
    .select()
    .single()

  if (error) {
    console.error('Error starting task time log:', error)
    console.error('Error details:', JSON.stringify(error, null, 2))
    throw new Error(`Помилка створення логу: ${error.message}`)
  }

  console.log('Time log created successfully:', data)
  return data
}

/**
 * Призупиняє роботу над задачею (пауза)
 */
export async function pauseTaskTimeLog(logId: number): Promise<boolean> {
  console.log('Pausing task time log:', logId)
  
  const log = await supabase
    .from('task_time_logs')
    .select('*')
    .eq('id', logId)
    .single()

  if (log.error || !log.data) {
    console.error('Error fetching log for pause:', log.error)
    throw new Error(`Помилка отримання логу: ${log.error?.message || 'Лог не знайдено'}`)
  }

  const startTime = new Date(log.data.start_time)
  const endTime = new Date()
  const durationMinutes = Math.floor((endTime.getTime() - startTime.getTime()) / (1000 * 60))

  console.log('Updating log with:', {
    end_time: endTime.toISOString(),
    log_status: 'paused',
    duration_minutes: durationMinutes,
    action: 'pause'
  })

  const { error } = await supabase
    .from('task_time_logs')
    .update({
      end_time: endTime.toISOString(),
      log_status: 'paused',
      duration_minutes: durationMinutes,
      action: 'pause'
    })
    .eq('id', logId)

  if (error) {
    console.error('Error pausing task time log:', error)
    console.error('Error details:', JSON.stringify(error, null, 2))
    throw new Error(`Помилка призупинення задачі: ${error.message}`)
  }

  console.log('Task paused successfully')
  return true
}

/**
 * Відновлює роботу над задачею (після паузи)
 */
export async function resumeTaskTimeLog(assignedTaskId: number, userId: number): Promise<TaskTimeLog | null> {
  // Перевіряємо, чи немає вже активної задачі для цього користувача
  const activeLog = await getActiveTimeLogForUser(userId)
  if (activeLog) {
    throw new Error('У вас вже є активна задача в роботі. Спочатку завершіть або призупиніть поточну задачу.')
  }

  const { data, error } = await supabase
    .from('task_time_logs')
    .insert({
      assigned_task_id: assignedTaskId,
      user_id: userId,
      start_time: new Date().toISOString(),
      log_status: 'in_progress',
      action: 'resume'
    })
    .select()
    .single()

  if (error) {
    console.error('Error resuming task time log:', error)
    return null
  }

  return data
}

/**
 * Завершує роботу над задачею (стоп/фініш)
 */
export async function stopTaskTimeLog(logId: number): Promise<boolean> {
  console.log('Stopping task time log:', logId)
  
  const log = await supabase
    .from('task_time_logs')
    .select('*')
    .eq('id', logId)
    .single()

  if (log.error || !log.data) {
    console.error('Error fetching log for stop:', log.error)
    throw new Error(`Помилка отримання логу: ${log.error?.message || 'Лог не знайдено'}`)
  }

  const startTime = new Date(log.data.start_time)
  const endTime = new Date()
  const durationMinutes = Math.floor((endTime.getTime() - startTime.getTime()) / (1000 * 60))

  console.log('Updating log with:', {
    end_time: endTime.toISOString(),
    log_status: 'completed',
    duration_minutes: durationMinutes,
    action: 'stop'
  })

  const { error } = await supabase
    .from('task_time_logs')
    .update({
      end_time: endTime.toISOString(),
      log_status: 'completed',
      duration_minutes: durationMinutes,
      action: 'stop'
    })
    .eq('id', logId)

  if (error) {
    console.error('Error stopping task time log:', error)
    console.error('Error details:', JSON.stringify(error, null, 2))
    throw new Error(`Помилка завершення задачі: ${error.message}`)
  }

  console.log('Task stopped successfully')
  return true
}

/**
 * Отримує всі логи часу для задачі
 */
export async function getTimeLogsForTask(assignedTaskId: number): Promise<TaskTimeLog[]> {
  const { data, error } = await supabase
    .from('task_time_logs')
    .select('*')
    .eq('assigned_task_id', assignedTaskId)
    .order('start_time', { ascending: false })

  if (error) {
    console.error('Error fetching time logs for task:', error)
    return []
  }

  return data || []
}

/**
 * Отримує розрахований статус та час виконання задачі з логів
 */
export async function getTaskTimeStats(assignedTaskId: number): Promise<{
  status: 'in_progress' | 'paused' | 'completed' | null
  totalMinutes: number
  completionDate: string | null
}> {
  // Перевіряємо чи є активний лог
  const activeLog = await getActiveTimeLogForTask(assignedTaskId)
  
  // Отримуємо всі логи
  const logs = await getTimeLogsForTask(assignedTaskId)
  
  if (activeLog) {
    // Розраховуємо поточний час для активної задачі
    const startTime = new Date(activeLog.start_time)
    const now = new Date()
    const currentMinutes = Math.floor((now.getTime() - startTime.getTime()) / (1000 * 60))
    
    // Додаємо час з завершених сесій
    const completedMinutes = logs
      .filter(log => log.duration_minutes !== null && log.log_status !== 'in_progress')
      .reduce((sum, log) => sum + (log.duration_minutes || 0), 0)
    
    return {
      status: 'in_progress',
      totalMinutes: completedMinutes + currentMinutes,
      completionDate: null
    }
  }
  
  // Перевіряємо чи є призупинений лог (тільки якщо немає активного логу)
  if (!activeLog) {
    const pausedLogs = logs.filter(log => log.log_status === 'paused')
    if (pausedLogs.length > 0) {
      // Перевіряємо чи останній лог - paused (тобто задача призупинена)
      const sortedLogs = logs.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
      const lastLog = sortedLogs[0]
      
      if (lastLog.log_status === 'paused') {
        const totalMinutes = logs
          .filter(log => log.duration_minutes !== null)
          .reduce((sum, log) => sum + (log.duration_minutes || 0), 0)
        
        return {
          status: 'paused',
          totalMinutes,
          completionDate: null
        }
      }
    }
  }

  // Перевіряємо чи є завершений лог
  const completedLogs = logs.filter(log => log.log_status === 'completed')
  if (completedLogs.length > 0) {
    const totalMinutes = logs
      .filter(log => log.duration_minutes !== null)
      .reduce((sum, log) => sum + (log.duration_minutes || 0), 0)
    
    const lastCompleted = completedLogs
      .sort((a, b) => new Date(b.end_time || b.start_time).getTime() - new Date(a.end_time || a.start_time).getTime())[0]
    
    const completionDate = lastCompleted.end_time 
      ? new Date(lastCompleted.end_time).toISOString().split('T')[0]
      : null
    
    return {
      status: 'completed',
      totalMinutes,
      completionDate
    }
  }

  // Не розпочато
  return {
    status: null,
    totalMinutes: 0,
    completionDate: null
  }
}

