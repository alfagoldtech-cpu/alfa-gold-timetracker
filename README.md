# AlfaGold Time Tracker

Проект системи відстеження часу AlfaGold.

## Встановлення

```bash
npm install
```

## Налаштування Supabase

1. Створіть проект на [Supabase](https://supabase.com)
2. Створіть файл `.env.local` в корені проекту:
```env
VITE_SUPABASE_URL=https://fstvavndcscqisatuyxn.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```
3. Отримайте Anon Key:
   - Відкрийте Supabase Dashboard → Settings → API
   - Скопіюйте **anon/public** key (НЕ service_role!)
   - Вставте в `.env.local` замість `your_supabase_anon_key`
4. Виконайте SQL міграції:
   - Відкрийте Supabase Dashboard → SQL Editor
   - Виконайте SQL з файлу `supabase/migrations/001_create_tables.sql`
5. Налаштуйте Authentication:
   - Supabase Dashboard → Authentication → Settings
   - Увімкніть Email авторизацію
   - Додайте ваш домен до Redirect URLs (для локальної розробки: `http://localhost:5173`)

## Запуск локально

```bash
npm run dev
```

Проект буде доступний за адресою: http://localhost:5173

## Структура проекту

- `src/pages/` - сторінки додатку (Login, Dashboard, ChangePassword, ResetPassword)
- `src/components/` - переісні компоненти (ErrorBoundary)
- `src/contexts/` - React контексти (AuthContext)
- `src/lib/` - утиліти та конфігурація (Supabase клієнт, auth функції, users функції)
- `src/types/` - TypeScript типи для бази даних
- `supabase/migrations/` - SQL міграції для бази даних

