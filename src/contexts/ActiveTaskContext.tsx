import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { getActiveTimeLogForUser, pauseTaskTimeLog, stopTaskTimeLog, getTaskTimeStats } from '../lib/taskTimeLogs'
import { getAssignedTasksForExecutor, getAssignedTaskById, type AssignedTaskWithDetails } from '../lib/assignedTasks'
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
  
  // Refs для захисту від race conditions та перевірки монтування
  const isMountedRef = useRef(true)
  const loadingRef = useRef(false)

  // Мемоізована функція для завантаження активного логу часу
  const loadActiveTimeLog = useCallback(async () => {
    if (!user?.id || loadingRef.current) {
      if (!user?.id) {
        setActiveTimeLog(null)
        setActiveTaskId(null)
        setActiveTask(null)
        setElapsedTime(0)
      }
      return
    }
    
    loadingRef.current = true
    
    try {
      const log = await getActiveTimeLogForUser(user.id)
      
      // Перевіряємо, чи компонент ще змонтований
      if (!isMountedRef.current) return
      
      if (log) {
        setActiveTimeLog(log)
        setActiveTaskId(log.assigned_task_id)
        
        // Завантажуємо інформацію про задачу безпосередньо за ID
        const task = await getAssignedTaskById(log.assigned_task_id)
        
        // Знову перевіряємо монтування після асинхронної операції
        if (!isMountedRef.current) return
        
        setActiveTask(task)
        
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
      if (isMountedRef.current) {
        setActiveTimeLog(null)
        setActiveTaskId(null)
        setActiveTask(null)
        setElapsedTime(0)
      }
    } finally {
      if (isMountedRef.current) {
        loadingRef.current = false
      }
    }
  }, [user?.id])

  // Завантажуємо активний лог часу при зміні користувача
  useEffect(() => {
    isMountedRef.current = true
    loadActiveTimeLog()
    
    return () => {
      isMountedRef.current = false
    }
  }, [loadActiveTimeLog])

  // Окремий useEffect для оновлення часу кожну секунду
  useEffect(() => {
    if (!activeTimeLog) return
    
    const interval = setInterval(() => {
      if (activeTimeLog && isMountedRef.current) {
        const startTime = new Date(activeTimeLog.start_time)
        const now = new Date()
        const elapsed = Math.floor((now.getTime() - startTime.getTime()) / 1000)
        setElapsedTime(elapsed)
      }
    }, 1000)
    
    return () => clearInterval(interval)
  }, [activeTimeLog?.id, activeTimeLog?.start_time]) // Залежність тільки від ID та start_time, не викликає циклів

  // Мемоізована функція для паузи задачі
  const handlePauseTask = useCallback(async (logId: number) => {
    try {
      const success = await pauseTaskTimeLog(logId)
      
      if (success && isMountedRef.current) {
        // Перезавантажуємо активний лог, щоб переконатися, що він оновився
        await loadActiveTimeLog()
      }
    } catch (err: any) {
      console.error('Error pausing task:', err)
      throw err
    }
  }, [loadActiveTimeLog])

  // Мемоізована функція для зупинки задачі
  const handleStopTask = useCallback(async (logId: number) => {
    try {
      const success = await stopTaskTimeLog(logId)
      
      if (success && isMountedRef.current) {
        // Перезавантажуємо активний лог, щоб переконатися, що його більше немає
        await loadActiveTimeLog()
      }
    } catch (err: any) {
      console.error('Error stopping task:', err)
      throw err
    }
  }, [loadActiveTimeLog])

  // Мемоізована функція для оновлення інформації про задачу
  const refreshActiveTask = useCallback(async () => {
    if (!user?.id || !activeTaskId || !isMountedRef.current) return
    
    try {
      const task = await getAssignedTaskById(activeTaskId)
      if (isMountedRef.current) {
        setActiveTask(task)
      }
    } catch (err) {
      console.error('Error refreshing active task:', err)
    }
  }, [user?.id, activeTaskId])

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

