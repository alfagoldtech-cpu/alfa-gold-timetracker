/**
 * Система черги запитів для обмеження кількості одночасних запитів до Supabase
 * 
 * Особливості:
 * - Обмежує кількість одночасних запитів (за замовчуванням 8)
 * - Автоматичний retry для failed запитів (до 3 спроб)
 * - Експоненціальна затримка між спробами
 * - Логування повільних запитів (>1 секунда)
 */

interface QueuedRequest<T> {
  id: string
  execute: () => Promise<T>
  resolve: (value: T) => void
  reject: (error: any) => void
  retries: number
  maxRetries: number
}

interface RequestQueueConfig {
  maxConcurrent: number
  retryDelay: number
  maxRetries: number
  logSlowRequests: boolean
  slowRequestThreshold: number // в мілісекундах
}

class RequestQueue {
  private queue: QueuedRequest<any>[] = []
  private running: Set<string> = new Set()
  private config: RequestQueueConfig

  constructor(config: Partial<RequestQueueConfig> = {}) {
    this.config = {
      maxConcurrent: config.maxConcurrent ?? 8,
      retryDelay: config.retryDelay ?? 1000,
      maxRetries: config.maxRetries ?? 3,
      logSlowRequests: config.logSlowRequests ?? (import.meta.env.DEV),
      slowRequestThreshold: config.slowRequestThreshold ?? 1000,
    }
  }

  /**
   * Додає запит до черги
   */
  async enqueue<T>(execute: () => Promise<T>, requestId?: string): Promise<T> {
    const id = requestId || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        id,
        execute,
        resolve,
        reject,
        retries: 0,
        maxRetries: this.config.maxRetries,
      })

      this.processQueue()
    })
  }

  /**
   * Обробляє чергу запитів
   */
  private async processQueue(): Promise<void> {
    // Якщо досягнуто ліміту одночасних запитів або черга порожня
    if (this.running.size >= this.config.maxConcurrent || this.queue.length === 0) {
      return
    }

    // Беремо наступний запит з черги
    const request = this.queue.shift()
    if (!request) return

    this.running.add(request.id)
    this.executeRequest(request)
  }

  /**
   * Виконує запит з retry логікою
   */
  private async executeRequest<T>(request: QueuedRequest<T>): Promise<void> {
    const startTime = Date.now()

    try {
      const result = await request.execute()
      const duration = Date.now() - startTime

      // Логуємо повільні запити в dev режимі
      if (this.config.logSlowRequests && duration > this.config.slowRequestThreshold) {
        console.warn(`⚠️ Повільний запит: ${request.id} виконався за ${duration}ms`)
      }

      this.running.delete(request.id)
      request.resolve(result)
      
      // Обробляємо наступний запит
      this.processQueue()
    } catch (error: any) {
      const duration = Date.now() - startTime
      
      // Перевіряємо, чи варто повторювати запит
      const shouldRetry = this.shouldRetry(error, request.retries)

      if (shouldRetry && request.retries < request.maxRetries) {
        request.retries++
        const delay = this.calculateRetryDelay(request.retries)
        
        console.warn(`🔄 Повтор запиту ${request.id} (спроба ${request.retries}/${request.maxRetries}) через ${delay}ms. Помилка:`, error.message)
        
        // Додаємо затримку перед повторною спробою
        setTimeout(() => {
          this.executeRequest(request)
        }, delay)
      } else {
        // Вичерпано спроби або помилка не підлягає retry
        this.running.delete(request.id)
        
        if (this.config.logSlowRequests) {
          console.error(`❌ Запит ${request.id} не вдався після ${request.retries} спроб за ${duration}ms:`, error)
        }
        
        request.reject(error)
        
        // Обробляємо наступний запит
        this.processQueue()
      }
    }
  }

  /**
   * Визначає, чи варто повторювати запит на основі помилки
   */
  private shouldRetry(error: any, retries: number): boolean {
    // Не повторюємо, якщо вичерпано спроби
    if (retries >= this.config.maxRetries) {
      return false
    }

    // Повторюємо для мережевих помилок та помилок сервера
    if (error?.code) {
      // Supabase помилки
      const retryableCodes = [
        'PGRST301', // Connection timeout
        'PGRST116', // Network error
        '500',      // Internal server error
        '502',      // Bad gateway
        '503',      // Service unavailable
        '504',      // Gateway timeout
      ]

      if (retryableCodes.includes(error.code)) {
        return true
      }
    }

    // Повторюємо для помилок без коду (можливо мережева помилка)
    if (!error?.code && error?.message) {
      const retryableMessages = [
        'network',
        'timeout',
        'connection',
        'fetch',
        'ECONNRESET',
        'ETIMEDOUT',
      ]

      const errorMessage = error.message.toLowerCase()
      if (retryableMessages.some(msg => errorMessage.includes(msg))) {
        return true
      }
    }

    return false
  }

  /**
   * Розраховує затримку перед повторною спробою (експоненціальна затримка)
   */
  private calculateRetryDelay(retries: number): number {
    // Експоненціальна затримка: 1s, 2s, 4s
    return this.config.retryDelay * Math.pow(2, retries - 1)
  }

  /**
   * Отримує статистику черги
   */
  getStats() {
    return {
      queueLength: this.queue.length,
      running: this.running.size,
      maxConcurrent: this.config.maxConcurrent,
    }
  }

  /**
   * Очищає чергу (корисно для тестування або cleanup)
   */
  clear() {
    this.queue.forEach(req => {
      req.reject(new Error('Queue cleared'))
    })
    this.queue = []
  }
}

// Експортуємо singleton instance
export const requestQueue = new RequestQueue({
  maxConcurrent: 8, // Обмежуємо до 8 одночасних запитів
  retryDelay: 1000, // Початкова затримка 1 секунда
  maxRetries: 3,    // Максимум 3 спроби
  logSlowRequests: import.meta.env.DEV, // Логуємо тільки в dev режимі
  slowRequestThreshold: 1000, // Логуємо запити >1 секунди
})

/**
 * Обгортка для Supabase запитів з автоматичною чергою
 */
export async function queuedRequest<T>(
  execute: () => Promise<T>,
  requestId?: string
): Promise<T> {
  return requestQueue.enqueue(execute, requestId)
}

