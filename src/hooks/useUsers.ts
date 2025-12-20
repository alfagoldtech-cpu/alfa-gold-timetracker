import { useQuery } from '@tanstack/react-query'
import { getUsersByProject, getUsersByProjectCount } from '../lib/users'
import type { User } from '../types/database'

/**
 * Хук для кешування користувачів проекту з TTL 2 хвилини
 */
export function useUsersByProject(projectId: number, limit?: number, offset?: number) {
  return useQuery({
    queryKey: ['users', 'project', projectId, limit, offset],
    queryFn: () => getUsersByProject(projectId, limit, offset),
    enabled: !!projectId,
    staleTime: 1000 * 60 * 2, // 2 хвилини
    gcTime: 1000 * 60 * 5, // 5 хвилин
  })
}

/**
 * Хук для отримання загальної кількості користувачів проекту
 */
export function useUsersByProjectCount(projectId: number) {
  return useQuery({
    queryKey: ['users', 'project', projectId, 'count'],
    queryFn: () => getUsersByProjectCount(projectId),
    enabled: !!projectId,
    staleTime: 1000 * 60 * 2, // 2 хвилини
    gcTime: 1000 * 60 * 5, // 5 хвилин
  })
}

