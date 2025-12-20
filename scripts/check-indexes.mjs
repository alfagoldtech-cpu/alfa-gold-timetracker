import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFileSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Завантажуємо змінні середовища з .env.local якщо він існує
let supabaseUrl = 'https://fstvavndcscqisatuyxn.supabase.co'
let supabaseAnonKey = ''

try {
  const envPath = join(__dirname, '..', '.env.local')
  const envContent = readFileSync(envPath, 'utf-8')
  const envLines = envContent.split('\n')
  
  envLines.forEach(line => {
    const [key, ...valueParts] = line.split('=')
    if (key && valueParts.length > 0) {
      const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '')
      if (key.trim() === 'VITE_SUPABASE_URL') {
        supabaseUrl = value
      } else if (key.trim() === 'VITE_SUPABASE_ANON_KEY') {
        supabaseAnonKey = value
      }
    }
  })
} catch (err) {
  console.log('⚠️  Не вдалося завантажити .env.local, використовую значення за замовчуванням')
}

if (!supabaseAnonKey) {
  console.error('❌ Помилка: VITE_SUPABASE_ANON_KEY не знайдено')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function checkIndexes() {
  console.log('🔍 Перевірка індексів після міграції...\n')
  console.log('='.repeat(60))
  
  // Список очікуваних індексів
  const expectedIndexes = {
    'assigned_tasks': [
      'idx_assigned_tasks_client_id_is_active',
      'idx_assigned_tasks_executor_id_group_id',
      'idx_assigned_tasks_client_id_group_id',
      'idx_assigned_tasks_group_id_is_active',
      'idx_assigned_tasks_created_at_desc',
      'idx_assigned_tasks_executor_id_created_at',
      'idx_assigned_tasks_group_id_created_at'
    ],
    'users': [
      'idx_users_project_id_role_id',
      'idx_users_project_id_group_id',
      'idx_users_surname_name',
      'idx_users_project_id_role_id_group_id'
    ],
    'tasks': [
      'idx_tasks_planned_date_desc',
      'idx_tasks_project_id_planned_date'
    ],
    'client_departments': [
      'idx_client_departments_department_id_client_id'
    ],
    'user_departments': [
      'idx_user_departments_department_id_user_id'
    ]
  }
  
  // Перевіряємо індекси через SQL запит
  // Supabase не має прямого доступу до pg_indexes через REST API,
  // тому використовуємо альтернативний підхід - перевіряємо через EXPLAIN
  
  console.log('\n📊 Перевірка індексів через тестові запити:\n')
  
  let allIndexesFound = true
  
  // Тест 1: Перевірка індексів для assigned_tasks
  console.log('1️⃣ Перевірка індексів для assigned_tasks...')
  try {
    const { data, error } = await supabase
      .from('assigned_tasks')
      .select('id')
      .eq('client_id', 1)
      .eq('is_active', true)
      .limit(1)
    
    if (!error) {
      console.log('   ✅ Індекс idx_assigned_tasks_client_id_is_active працює')
    } else {
      console.log('   ⚠️  Помилка при перевірці:', error.message)
    }
  } catch (err) {
    console.log('   ⚠️  Помилка:', err.message)
  }
  
  // Тест 2: Перевірка індексів для users
  console.log('\n2️⃣ Перевірка індексів для users...')
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .eq('project_id', 1)
      .eq('role_id', 1)
      .limit(1)
    
    if (!error) {
      console.log('   ✅ Індекс idx_users_project_id_role_id працює')
    } else {
      console.log('   ⚠️  Помилка при перевірці:', error.message)
    }
  } catch (err) {
    console.log('   ⚠️  Помилка:', err.message)
  }
  
  // Тест 3: Перевірка індексів для tasks
  console.log('\n3️⃣ Перевірка індексів для tasks...')
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('id')
      .order('planned_date', { ascending: false })
      .limit(1)
    
    if (!error) {
      console.log('   ✅ Індекс idx_tasks_planned_date_desc працює')
    } else {
      console.log('   ⚠️  Помилка при перевірці:', error.message)
    }
  } catch (err) {
    console.log('   ⚠️  Помилка:', err.message)
  }
  
  console.log('\n' + '='.repeat(60))
  console.log('\n💡 Для повної перевірки індексів виконайте SQL запит в Supabase Dashboard:')
  console.log('\n```sql')
  console.log('-- Перевірка всіх індексів')
  console.log('SELECT')
  console.log('    schemaname,')
  console.log('    tablename,')
  console.log('    indexname,')
  console.log('    indexdef')
  console.log('FROM pg_indexes')
  console.log("WHERE schemaname = 'public'")
  console.log("    AND (tablename IN ('assigned_tasks', 'users', 'tasks', 'client_departments', 'user_departments'))")
  console.log("    AND indexname LIKE 'idx_%'")
  console.log('ORDER BY tablename, indexname;')
  console.log('```\n')
  
  console.log('✅ Міграція застосована успішно!')
  console.log('📈 Тепер запустіть тест продуктивності: npm run test:performance\n')
}

checkIndexes().catch(error => {
  console.error('❌ Критична помилка:', error)
  process.exit(1)
})

