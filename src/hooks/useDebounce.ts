import { useState, useEffect } from 'react'

/**
 * Хук для debounce значення
 * @param value - значення для debounce
 * @param delay - затримка в мілісекундах
 * @returns debounced значення
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}

