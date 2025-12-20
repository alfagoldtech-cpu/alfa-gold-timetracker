# Налаштування оновлення email співробітників

Для того, щоб функціонал редагування email співробітників працював повністю, потрібно налаштувати Service Role Key в Supabase.

## Крок 1: Отримати Service Role Key

1. Відкрийте [Supabase Dashboard](https://app.supabase.com)
2. Виберіть ваш проект
3. Перейдіть в **Settings** → **API**
4. Знайдіть секцію **Project API keys**
5. Скопіюйте **service_role** key (НЕ anon/public key!)

⚠️ **ВАЖЛИВО**: Service Role Key має повний доступ до бази даних. Ніколи не комітьте його в git!

## Крок 2: Додати ключ в .env.local

Створіть або оновіть файл `.env.local` в корені проекту:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

## Крок 3: Перезапустити dev сервер

Після додавання змінної оточення перезапустіть dev сервер:

```bash
npm run dev
```

## Як це працює

Коли ви редагуєте email співробітника:

1. Email оновлюється в таблиці `users` в базі даних
2. Email оновлюється в Supabase Auth через Admin API (використовує service role key)
3. На новий email відправляється лист для підтвердження
4. Користувач зможе увійти під новим email після підтвердження

## Альтернативний варіант (Edge Function)

Якщо ви не хочете використовувати service role key на клієнті, можна створити Edge Function в Supabase:

1. Створіть Edge Function в Supabase Dashboard
2. Використайте service role key всередині Edge Function
3. Викличте Edge Function з клієнта

Це більш безпечний варіант, але потребує додаткового налаштування.





