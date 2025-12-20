# Система черги запитів (Request Queue)

## Опис

Система черги запитів обмежує кількість одночасних запитів до Supabase та автоматично повторює невдалі запити. Це допомагає запобігти перевантаженню бази даних та покращити стабільність системи.

## Особливості

- ✅ Обмеження кількості одночасних запитів (за замовчуванням 8)
- ✅ Автоматичний retry для failed запитів (до 3 спроб)
- ✅ Експоненціальна затримка між спробами (1s, 2s, 4s)
- ✅ Логування повільних запитів (>1 секунда) в dev режимі
- ✅ Розумна логіка retry (тільки для мережевих помилок та помилок сервера)

## Використання

### Базовий приклад

```typescript
import { queuedSupabaseQuery } from '../lib/supabase'

// Замість прямого виклику:
// const { data, error } = await supabase.from('clients').select('*')

// Використовуйте чергу:
const { data, error } = await queuedSupabaseQuery(
  () => supabase.from('clients').select('*')
)
```

### Використання helper функцій

```typescript
import { queuedSelect, queuedInsert, queuedUpdate, queuedDelete, queuedCount } from '../lib/requestQueueHelpers'

// Select запит
const { data, error } = await queuedSelect('clients', '*', {
  status: 'active'
}, {
  orderBy: 'created_at',
  ascending: false,
  limit: 50,
  offset: 0
})

// Insert запит
const { data, error } = await queuedInsert('clients', {
  legal_name: 'Нова компанія',
  edrpou: '12345678'
})

// Update запит
const { data, error } = await queuedUpdate('clients', 123, {
  status: 'inactive'
})

// Delete запит
const { error } = await queuedDelete('clients', 123)

// Count запит
const { count, error } = await queuedCount('clients', {
  status: 'active'
})
```

### Приклад інтеграції в існуючий код

**До:**
```typescript
export async function getAllClients(limit?: number, offset?: number): Promise<Client[]> {
  let query = supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false })

  if (limit !== undefined) {
    query = query.limit(limit)
  }
  if (offset !== undefined) {
    query = query.range(offset, offset + (limit || 1000) - 1)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching clients:', error)
    return []
  }

  return data || []
}
```

**Після:**
```typescript
import { queuedSupabaseQuery } from './supabase'

export async function getAllClients(limit?: number, offset?: number): Promise<Client[]> {
  const { data, error } = await queuedSupabaseQuery(async () => {
    let query = supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false })

    if (limit !== undefined) {
      query = query.limit(limit)
    }
    if (offset !== undefined) {
      query = query.range(offset, offset + (limit || 1000) - 1)
    }

    return query
  }, `getAllClients_${limit}_${offset}`)

  if (error) {
    console.error('Error fetching clients:', error)
    return []
  }

  return data || []
}
```

## Налаштування

Налаштування черги можна змінити в `src/lib/requestQueue.ts`:

```typescript
export const requestQueue = new RequestQueue({
  maxConcurrent: 8,        // Максимальна кількість одночасних запитів
  retryDelay: 1000,        // Початкова затримка перед retry (мс)
  maxRetries: 3,           // Максимальна кількість спроб
  logSlowRequests: true,   // Логувати повільні запити
  slowRequestThreshold: 1000, // Поріг для повільних запитів (мс)
})
```

## Статистика черги

Можна отримати статистику черги для моніторингу:

```typescript
import { requestQueue } from '../lib/requestQueue'

const stats = requestQueue.getStats()
console.log('Queue stats:', stats)
// { queueLength: 5, running: 3, maxConcurrent: 8 }
```

## Retry логіка

Система автоматично повторює запити для наступних помилок:

- Мережеві помилки (network, timeout, connection)
- Помилки сервера (500, 502, 503, 504)
- Supabase помилки (PGRST301, PGRST116)

**Не повторюються:**
- Помилки валідації (400)
- Помилки авторизації (401, 403)
- Помилки "не знайдено" (404)

## Моніторинг

В dev режимі система автоматично логує:
- ⚠️ Повільні запити (>1 секунда)
- 🔄 Повторні спроби запитів
- ❌ Неуспішні запити після всіх спроб

## Міграція існуючого коду

Для поступової міграції можна використовувати чергу опціонально:

```typescript
// Створіть обгортку, яка використовує чергу опціонально
const USE_QUEUE = import.meta.env.VITE_USE_REQUEST_QUEUE === 'true'

export async function getAllClients(...) {
  const queryFn = () => {
    // ... ваш запит
  }

  if (USE_QUEUE) {
    return queuedSupabaseQuery(queryFn)
  } else {
    return queryFn()
  }
}
```

## Переваги

1. **Запобігання перевантаженню БД** - обмеження кількості одночасних запитів
2. **Покращена стабільність** - автоматичний retry для тимчасових помилок
3. **Кращий UX** - менше помилок для користувачів
4. **Моніторинг** - логування повільних запитів для оптимізації

