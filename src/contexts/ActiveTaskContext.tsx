import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { getActiveTimeLogForUser, pauseTaskTimeLog, stopTaskTimeLog, getTaskTimeStats } from '../lib/taskTimeLogs'
import { getAssignedTasksForExecutor, type AssignedTaskWithDetails } from '../lib/assignedTasks'
import { supabase } from '../lib/supabase'
import type { TaskTimeLog } from '../types/database'

interface ActiveTaskContextType {
  activeTimeLog: TaskTimeLog | null
  activeTaskId: number | null
  activeTask: AssignedTaskWithDetails | null
  elapsedTime: number
  handlePauseTask: (logId: number) => Promise<void>
  handleStopTask: (logId: number) => Promise<void>
  refreshActiveTask: () => Promise<void>
  loadActiveTimeLog: () => Promise<void>
}

const ActiveTaskContext = createContext<ActiveTaskContextType | undefined>(undefined)

export function ActiveTaskProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [activeTimeLog, setActiveTimeLog] = useState<TaskTimeLog | null>(null)
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null)
  const [activeTask, setActiveTask] = useState<AssignedTaskWithDetails | null>(null)
  const [elapsedTime, setElapsedTime] = useState<number>(0)

  // Функція для завантаження активного логу часу
  const loadActiveTimeLog = async () => {
    if (!user?.id) {
      setActiveTimeLog(null)
      setActiveTaskId(null)
      setActiveTask(null)
      setElapsedTime(0)
      return
    }
    
    try {
      const log = await getActiveTimeLogForUser(user.id)
      if (log) {
        setActiveTimeLog(log)
        setActiveTaskId(log.assigned_task_id)
        
        // Завантажуємо інформацію про задачу
        const tasks = await getAssignedTasksForExecutor(user.id)
        const task = tasks.find(t => t.id === log.assigned_task_id)
        setActiveTask(task || null)
        
        // Розраховуємо поточний час виконання
        const startTime = new Date(log.start_time)
        const now = new Date()
        const elapsed = Math.floor((now.getTime() - startTime.getTime()) / 1000)
        setElapsedTime(elapsed)
      } else {
        setActiveTimeLog(null)
        setActiveTaskId(null)
        setActiveTask(null)
        setElapsedTime(0)
      }
    } catch (err) {
      console.error('Error loading active time log:', err)
      setActiveTimeLog(null)
      setActiveTaskId(null)
      setActiveTask(null)
      setElapsedTime(0)
    }
  }

  // Завантажуємо активний лог часу
  useEffect(() => {
    loadActiveTimeLog()
    
    // Оновлюємо час кожну секунду, якщо є активна задача
    const interval = setInterval(() => {
      if (activeTimeLog) {
        const startTime = new Date(activeTimeLog.start_time)
        const now = new Date()
        const elapsed = Math.floor((now.getTime() - startTime.getTime()) / 1000)
        setElapsedTime(elapsed)
      }
    }, 1000)
    
    return () => clearInterval(interval)
  }, [user?.id, activeTimeLog?.start_time])

  const handlePauseTask = async (logId: number) => {
    try {
      const success = await pauseTaskTimeLog(logId)
      
      if (success) {
        // Перезавантажуємо активний лог, щоб переконатися, що він оновився
        await loadActiveTimeLog()
      }
    } catch (err: any) {
      console.error('Error pausing task:', err)
      throw err
    }
  }

  const handleStopTask = async (logId: number) => {
    try {
      const success = await stopTaskTimeLog(logId)
      
      if (success) {
        // Перезавантажуємо активний лог, щоб переконатися, що його більше немає
        await loadActiveTimeLog()
      }
    } catch (err: any) {
      console.error('Error stopping task:', err)
      throw err
    }
  }

  const refreshActiveTask = async () => {
    if (!user?.id || !activeTaskId) return
    
    try {
      const tasks = await getAssignedTasksForExecutor(user.id)
      const task = tasks.find(t => t.id === activeTaskId)
      setActiveTask(task || null)
    } catch (err) {
      console.error('Error refreshing active task:', err)
    }
  }

  return (
    <ActiveTaskContext.Provider
      value={{
        activeTimeLog,
        activeTaskId,
        activeTask,
        elapsedTime,
        handlePauseTask,
        handleStopTask,
        refreshActiveTask,
        loadActiveTimeLog
      }}
    >
      {children}
    </ActiveTaskContext.Provider>
  )
}

export function useActiveTask() {
  const context = useContext(ActiveTaskContext)
  if (context === undefined) {
    throw new Error('useActiveTask must be used within an ActiveTaskProvider')
  }
  return context
}

