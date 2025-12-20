import { useQuery } from '@tanstack/react-query'
import { getAllClients, getClientsCount, getClientsWithDepartments } from '../lib/clients'
import type { Client } from '../types/database'

/**
 * Хук для кешування клієнтів з TTL 5 хвилин
 */
export function useClients(limit?: number, offset?: number) {
  return useQuery({
    queryKey: ['clients', limit, offset],
    queryFn: () => getAllClients(limit, offset),
    staleTime: 1000 * 60 * 5, // 5 хвилин
    gcTime: 1000 * 60 * 10, // 10 хвилин
  })
}

/**
 * Хук для отримання загальної кількості клієнтів
 */
export function useClientsCount() {
  return useQuery({
    queryKey: ['clients', 'count'],
    queryFn: () => getClientsCount(),
    staleTime: 1000 * 60 * 5, // 5 хвилин
    gcTime: 1000 * 60 * 10, // 10 хвилин
  })
}

/**
 * Хук для отримання відділів клієнтів (batch-запит)
 */
export function useClientsDepartments(clientIds: number[]) {
  return useQuery({
    queryKey: ['clients', 'departments', clientIds.sort().join(',')],
    queryFn: () => getClientsWithDepartments(clientIds),
    enabled: clientIds.length > 0,
    staleTime: 1000 * 60 * 5, // 5 хвилин
    gcTime: 1000 * 60 * 10, // 10 хвилин
  })
}

