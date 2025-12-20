import { useQuery } from '@tanstack/react-query'
import { getAssignedTasksByClient } from '../lib/assignedTasks'
import type { AssignedTaskWithDetails } from '../lib/assignedTasks'

interface GetAssignedTasksParams {
  clientId: number
  periodType: 'week' | 'month'
  startDate: Date
  page: number
  limit?: number
}

/**
 * Хук для кешування призначених задач з TTL 1 хвилина
 */
export function useAssignedTasksByClient(params: GetAssignedTasksParams) {
  const { clientId, periodType, startDate, page, limit = 10 } = params
  
  return useQuery({
    queryKey: ['assignedTasks', 'client', clientId, periodType, startDate.toISOString(), page, limit],
    queryFn: async () => {
      const tasks = await getAssignedTasksByClient(clientId, periodType, startDate, page, limit)
      return tasks
    },
    enabled: !!clientId,
    staleTime: 1000 * 60, // 1 хвилина
    gcTime: 1000 * 60 * 2, // 2 хвилини
  })
}

