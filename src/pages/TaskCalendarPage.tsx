import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getActiveAssignedTasksForTeamLead, type AssignedTaskWithDetails } from '../lib/assignedTasks'
import { formatDateToUA } from '../utils/date'
import { getStatusBadgeClass, getStatusText } from '../utils/status'
import { formatMinutesToHoursMinutes } from '../utils/date'
import './AdminPages.css'
import './ManagerDashboard.css'

export default function TaskCalendarPage() {
  const { user } = useAuth()
  const [assignedTasks, setAssignedTasks] = useState<AssignedTaskWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set())

  // Групуємо задачі по датах
  const groupTasksByDate = (tasks: AssignedTaskWithDetails[]): Map<string, AssignedTaskWithDetails[]> => {
    const grouped = new Map<string, AssignedTaskWithDetails[]>()
    
    console.log('Групування задач. Всього задач:', tasks.length)
    
    tasks.forEach(task => {
      // Отримуємо дату з tasks.planned_date
      const taskDate = task.task?.planned_date
      
      console.log('Задача:', {
        id: task.id,
        task_id: task.task_id,
        hasTask: !!task.task,
        planned_date: taskDate,
        taskName: task.task?.task_name
      })
      
      if (!taskDate) {
        console.warn('Задача без дати:', task.id)
        return
      }
      
      // Форматуємо дату для групування (YYYY-MM-DD)
      // Може бути в форматі YYYY-MM-DD або ISO з часом
      let dateKey = taskDate
      if (taskDate.includes('T')) {
        dateKey = taskDate.split('T')[0]
      } else if (taskDate.includes(' ')) {
        dateKey = taskDate.split(' ')[0]
      }
      
      // Перевіряємо формат дати
      if (!dateKey.match(/^\d{4}-\d{2}-\d{2}$/)) {
        console.warn('Невірний формат дати:', dateKey, 'для задачі:', task.id)
        return
      }
      
      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, [])
      }
      grouped.get(dateKey)!.push(task)
    })
    
    console.log('Результат групування:', Array.from(grouped.keys()), 'груп:', grouped.size)
    
    return grouped
  }

  // Сортуємо дати за зростанням
  const sortDates = (dates: string[]): string[] => {
    return dates.sort((a, b) => {
      const dateA = new Date(a)
      const dateB = new Date(b)
      return dateA.getTime() - dateB.getTime()
    })
  }

  const loadData = async () => {
    if (!user?.id) {
      setError('Користувач не знайдено')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      console.log('Завантаження активних задач для тім ліда з group_id:', user.id)
      const tasks = await getActiveAssignedTasksForTeamLead(user.id)
      console.log('Завантажено активних задач:', tasks.length)
      
      // Фільтруємо тільки активні задачі (додаткова перевірка)
      const activeTasks = tasks.filter(task => task.is_active === true)
      console.log('Активних задач після фільтрації:', activeTasks.length)
      
      if (activeTasks.length > 0) {
        console.log('Приклад задачі:', {
          id: activeTasks[0].id,
          task_id: activeTasks[0].task_id,
          group_id: activeTasks[0].group_id,
          is_active: activeTasks[0].is_active,
          hasTask: !!activeTasks[0].task,
          planned_date: activeTasks[0].task?.planned_date,
          client: activeTasks[0].client?.legal_name
        })
      }
      
      setAssignedTasks(activeTasks)
    } catch (err) {
      console.error('Error loading assigned tasks:', err)
      setError('Не вдалося завантажити задачі')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [user?.id])

  const toggleDateGroup = (dateKey: string) => {
    setExpandedDates(prev => {
      const newSet = new Set(prev)
      if (newSet.has(dateKey)) {
        newSet.delete(dateKey)
      } else {
        newSet.add(dateKey)
      }
      return newSet
    })
  }

  if (loading) {
    return (
      <div className="admin-page">
        <div className="loading">Завантаження...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="admin-page">
        <div className="error-message">{error}</div>
      </div>
    )
  }

  const groupedTasks = groupTasksByDate(assignedTasks)
  const sortedDates = sortDates(Array.from(groupedTasks.keys()))

  return (
    <div className="admin-page">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '600', color: '#2d3748', marginBottom: '8px' }}>
          Календар задач
        </h1>
        <p style={{ color: '#718096', fontSize: '14px' }}>
          Активні призначені задачі, згруповані по датах
        </p>
      </div>

      {assignedTasks.length === 0 ? (
        <div style={{ 
          padding: '48px', 
          textAlign: 'center', 
          color: '#718096',
          background: '#f7fafc',
          borderRadius: '8px',
          border: '1px solid #e2e8f0'
        }}>
          <p style={{ fontSize: '16px', marginBottom: '8px' }}>Немає активних задач</p>
          <p style={{ fontSize: '14px' }}>Всі призначені задачі будуть відображатися тут</p>
        </div>
      ) : sortedDates.length === 0 ? (
        <div style={{ 
          padding: '48px', 
          textAlign: 'center', 
          color: '#718096',
          background: '#f7fafc',
          borderRadius: '8px',
          border: '1px solid #e2e8f0'
        }}>
          <p style={{ fontSize: '16px', marginBottom: '8px' }}>Задачі знайдено, але не вдалося згрупувати по датах</p>
          <p style={{ fontSize: '14px' }}>Перевірте консоль браузера для деталей</p>
          <div style={{ marginTop: '16px', textAlign: 'left', background: '#ffffff', padding: '16px', borderRadius: '4px' }}>
            <p style={{ fontSize: '12px', color: '#4a5568', marginBottom: '8px' }}>Деталі задач:</p>
            {assignedTasks.slice(0, 3).map(task => (
              <div key={task.id} style={{ fontSize: '12px', color: '#718096', marginBottom: '4px' }}>
                ID: {task.id}, Task ID: {task.task_id}, Has Task: {task.task ? 'Yes' : 'No'}, Date: {task.task?.planned_date || 'N/A'}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {sortedDates.map(dateKey => {
            const tasksForDate = groupedTasks.get(dateKey) || []
            const isExpanded = expandedDates.has(dateKey)
            const formattedDate = formatDateToUA(dateKey)

            return (
              <div
                key={dateKey}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  background: '#ffffff',
                  overflow: 'hidden',
                  transition: 'all 0.2s ease'
                }}
              >
                {/* Заголовок групи дати */}
                <div
                  onClick={() => toggleDateGroup(dateKey)}
                  style={{
                    padding: '16px 20px',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: isExpanded ? '#f7fafc' : '#ffffff',
                    borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none',
                    transition: 'background 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (!isExpanded) {
                      e.currentTarget.style.background = '#f7fafc'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isExpanded) {
                      e.currentTarget.style.background = '#ffffff'
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ 
                      fontSize: '18px', 
                      fontWeight: '600', 
                      color: '#2d3748' 
                    }}>
                      {formattedDate}
                    </span>
                    <span style={{
                      background: '#4299e1',
                      color: '#ffffff',
                      padding: '4px 12px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: '600'
                    }}>
                      {tasksForDate.length} {tasksForDate.length === 1 ? 'задача' : 'задач'}
                    </span>
                  </div>
                  <span style={{
                    fontSize: '20px',
                    color: '#718096',
                    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease'
                  }}>
                    ▼
                  </span>
                </div>

                {/* Розгорнутий список задач */}
                {isExpanded && (
                  <div style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {tasksForDate.map(task => (
                        <div
                          key={task.id}
                          style={{
                            padding: '16px',
                            background: '#f7fafc',
                            borderRadius: '6px',
                            border: '1px solid #e2e8f0'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                            <div style={{ flex: 1 }}>
                              <h4 style={{ 
                                fontSize: '16px', 
                                fontWeight: '600', 
                                color: '#2d3748',
                                marginBottom: '8px'
                              }}>
                                {task.task?.task_name || `Задача #${task.task_id}`}
                              </h4>
                              {task.client && (
                                <p style={{ 
                                  fontSize: '14px', 
                                  color: '#718096',
                                  marginBottom: '4px'
                                }}>
                                  Клієнт: <span style={{ fontWeight: '500', color: '#4a5568' }}>{task.client.legal_name}</span>
                                </p>
                              )}
                            </div>
                            {task.task_status && (
                              <span className={`status-badge ${getStatusBadgeClass(task.task_status)}`}>
                                {getStatusText(task.task_status)}
                              </span>
                            )}
                            {!task.task_status && task.is_active && (
                              <span className="status-badge status-active">
                                Не розпочато
                              </span>
                            )}
                          </div>

                          <div style={{ 
                            display: 'grid', 
                            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                            gap: '12px',
                            marginTop: '12px'
                          }}>
                            {task.executor && (
                              <div>
                                <span style={{ fontSize: '12px', color: '#718096', display: 'block', marginBottom: '4px' }}>
                                  Виконавець
                                </span>
                                <span style={{ fontSize: '14px', color: '#2d3748', fontWeight: '500' }}>
                                  {task.executor.surname} {task.executor.name} {task.executor.middle_name || ''}
                                </span>
                              </div>
                            )}
                            
                            {task.completion_date && (
                              <div>
                                <span style={{ fontSize: '12px', color: '#718096', display: 'block', marginBottom: '4px' }}>
                                  Дата виконання
                                </span>
                                <span style={{ fontSize: '14px', color: '#2d3748', fontWeight: '500' }}>
                                  {formatDateToUA(task.completion_date)}
                                </span>
                              </div>
                            )}
                            
                            <div>
                              <span style={{ fontSize: '12px', color: '#718096', display: 'block', marginBottom: '4px' }}>
                                Час виконання
                              </span>
                              <span style={{ fontSize: '14px', color: '#2d3748', fontWeight: '500' }}>
                                {formatMinutesToHoursMinutes(task.completion_time_minutes)}
                              </span>
                            </div>
                          </div>

                          {task.task?.description && (
                            <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e2e8f0' }}>
                              <span style={{ fontSize: '12px', color: '#718096', display: 'block', marginBottom: '4px' }}>
                                Опис
                              </span>
                              <p style={{ fontSize: '14px', color: '#4a5568', lineHeight: '1.5' }}>
                                {task.task.description}
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

