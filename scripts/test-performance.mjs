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
  console.log('📝 Створіть файл .env.local з VITE_SUPABASE_ANON_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// Утиліта для вимірювання часу виконання
async function measureTime(name, fn) {
  const start = performance.now()
  try {
    const result = await fn()
    const end = performance.now()
    const duration = end - start
    return { name, duration, success: true, result }
  } catch (error) {
    const end = performance.now()
    const duration = end - start
    return { name, duration, success: false, error: error.message }
  }
}

// Тестові запити для перевірки продуктивності
async function testQueries() {
  console.log('🚀 Тестування продуктивності запитів...\n')
  console.log('='.repeat(60))
  
  const results = []
  
  // 1. Тест: Отримання клієнтів з відділами (getClientsWithDepartments)
  console.log('\n1️⃣ Тест: getClientsWithDepartments')
  const { data: clients } = await supabase
    .from('clients')
    .select('id')
    .limit(10)
  
  if (clients && clients.length > 0) {
    const clientIds = clients.map(c => c.id)
    const result = await measureTime('getClientsWithDepartments', async () => {
      const { data, error } = await supabase
        .from('client_departments')
        .select(`
          client_id,
          departments (id, department_name, project_id)
        `)
        .in('client_id', clientIds)
      if (error) throw error
      return data
    })
    results.push(result)
    console.log(`   ⏱️  Час: ${result.duration.toFixed(2)}ms`)
    console.log(`   ${result.success ? '✅' : '❌'} ${result.success ? 'Успішно' : result.error}`)
    if (result.success) {
      console.log(`   📊 Знайдено: ${result.result?.length || 0} записів`)
    }
  }
  
  // 2. Тест: Отримання призначених задач по клієнту (getAssignedTasksByClient)
  console.log('\n2️⃣ Тест: getAssignedTasksByClient')
  if (clients && clients.length > 0) {
    const clientId = clients[0].id
    const result = await measureTime('getAssignedTasksByClient', async () => {
      const { data, error } = await supabase
        .from('assigned_tasks')
        .select(`
          *,
          task:tasks(id, task_name, planned_date, task_type, description, category_id),
          executor:users!assigned_tasks_executor_id_fkey(id, surname, name, middle_name, email)
        `)
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    })
    results.push(result)
    console.log(`   ⏱️  Час: ${result.duration.toFixed(2)}ms`)
    console.log(`   ${result.success ? '✅' : '❌'} ${result.success ? 'Успішно' : result.error}`)
    if (result.success) {
      console.log(`   📊 Знайдено: ${result.result?.length || 0} задач`)
    }
  }
  
  // 3. Тест: Отримання активних задач по клієнту
  console.log('\n3️⃣ Тест: getActiveAssignedTasksByClient')
  if (clients && clients.length > 0) {
    const clientId = clients[0].id
    const result = await measureTime('getActiveAssignedTasksByClient', async () => {
      const { data, error } = await supabase
        .from('assigned_tasks')
        .select(`
          *,
          task:tasks(id, task_name, planned_date, task_type, description, category_id),
          executor:users!assigned_tasks_executor_id_fkey(id, surname, name, middle_name, email)
        `)
        .eq('client_id', clientId)
        .eq('is_active', true)
      if (error) throw error
      return data
    })
    results.push(result)
    console.log(`   ⏱️  Час: ${result.duration.toFixed(2)}ms`)
    console.log(`   ${result.success ? '✅' : '❌'} ${result.success ? 'Успішно' : result.error}`)
    if (result.success) {
      console.log(`   📊 Знайдено: ${result.result?.length || 0} активних задач`)
    }
  }
  
  // 4. Тест: Отримання користувачів з ролями (getUserWithRole)
  console.log('\n4️⃣ Тест: getUserWithRole')
  const { data: users } = await supabase
    .from('users')
    .select('id')
    .limit(5)
  
  if (users && users.length > 0) {
    const userId = users[0].id
    const result = await measureTime('getUserWithRole', async () => {
      const { data, error } = await supabase
        .from('users')
        .select(`
          *,
          role:roles(id, role_name)
        `)
        .eq('id', userId)
        .single()
      if (error) throw error
      return data
    })
    results.push(result)
    console.log(`   ⏱️  Час: ${result.duration.toFixed(2)}ms`)
    console.log(`   ${result.success ? '✅' : '❌'} ${result.success ? 'Успішно' : result.error}`)
  }
  
  // 5. Тест: Отримання користувачів по проекту та ролі
  console.log('\n5️⃣ Тест: getUsersByProjectAndRole')
  const { data: projects } = await supabase
    .from('projects')
    .select('id')
    .limit(1)
  
  if (projects && projects.length > 0) {
    const projectId = projects[0].id
    const result = await measureTime('getUsersByProjectAndRole', async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, surname, name, middle_name, email, phone, status, role_id, group_id, project_id, date_added')
        .eq('project_id', projectId)
        .order('surname')
        .order('name')
      if (error) throw error
      return data
    })
    results.push(result)
    console.log(`   ⏱️  Час: ${result.duration.toFixed(2)}ms`)
    console.log(`   ${result.success ? '✅' : '❌'} ${result.success ? 'Успішно' : result.error}`)
    if (result.success) {
      console.log(`   📊 Знайдено: ${result.result?.length || 0} користувачів`)
    }
  }
  
  // 6. Тест: Отримання задач виконавця з сортуванням
  console.log('\n6️⃣ Тест: getAssignedTasksForExecutor')
  if (users && users.length > 0) {
    const executorId = users[0].id
    const result = await measureTime('getAssignedTasksForExecutor', async () => {
      const { data, error } = await supabase
        .from('assigned_tasks')
        .select(`
          *,
          task:tasks(id, task_name, planned_date, task_type, description, category_id),
          executor:users!assigned_tasks_executor_id_fkey(id, surname, name, middle_name, email),
          client:clients(id, legal_name, group_company_id)
        `)
        .eq('executor_id', executorId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    })
    results.push(result)
    console.log(`   ⏱️  Час: ${result.duration.toFixed(2)}ms`)
    console.log(`   ${result.success ? '✅' : '❌'} ${result.success ? 'Успішно' : result.error}`)
    if (result.success) {
      console.log(`   📊 Знайдено: ${result.result?.length || 0} задач`)
    }
  }
  
  // 7. Тест: Отримання клієнтів з сортуванням
  console.log('\n7️⃣ Тест: getAllClients (з сортуванням)')
  const result7 = await measureTime('getAllClients', async () => {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) throw error
    return data
  })
  results.push(result7)
  console.log(`   ⏱️  Час: ${result7.duration.toFixed(2)}ms`)
  console.log(`   ${result7.success ? '✅' : '❌'} ${result7.success ? 'Успішно' : result7.error}`)
  if (result7.success) {
    console.log(`   📊 Знайдено: ${result7.result?.length || 0} клієнтів`)
  }
  
  // Підсумок
  console.log('\n' + '='.repeat(60))
  console.log('\n📊 ПІДСУМОК ТЕСТУВАННЯ\n')
  
  const successfulTests = results.filter(r => r.success)
  const failedTests = results.filter(r => !r.success)
  
  console.log(`✅ Успішних тестів: ${successfulTests.length}/${results.length}`)
  if (failedTests.length > 0) {
    console.log(`❌ Помилок: ${failedTests.length}`)
    failedTests.forEach(test => {
      console.log(`   - ${test.name}: ${test.error}`)
    })
  }
  
  if (successfulTests.length > 0) {
    const times = successfulTests.map(t => t.duration)
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length
    const minTime = Math.min(...times)
    const maxTime = Math.max(...times)
    
    console.log(`\n⏱️  Статистика часу виконання:`)
    console.log(`   Середній час: ${avgTime.toFixed(2)}ms`)
    console.log(`   Мінімальний: ${minTime.toFixed(2)}ms`)
    console.log(`   Максимальний: ${maxTime.toFixed(2)}ms`)
    
    console.log(`\n📈 Детальна статистика по тестах:`)
    successfulTests.forEach(test => {
      const emoji = test.duration < 100 ? '🟢' : test.duration < 500 ? '🟡' : '🔴'
      console.log(`   ${emoji} ${test.name}: ${test.duration.toFixed(2)}ms`)
    })
    
    // Перевірка індексів
    console.log(`\n🔍 Перевірка індексів:`)
    try {
      const { data: indexes, error: indexError } = await supabase.rpc('pg_indexes', {
        schemaname: 'public',
        tablename: 'assigned_tasks'
      }).catch(() => ({ data: null, error: null }))
      
      // Альтернативний спосіб перевірки індексів через SQL
      const { data: indexData, error: indexErr } = await supabase
        .from('pg_indexes')
        .select('*')
        .eq('schemaname', 'public')
        .eq('tablename', 'assigned_tasks')
        .limit(20)
        .catch(() => ({ data: null, error: null }))
      
      console.log(`   ℹ️  Для перевірки індексів виконайте SQL запит в Supabase Dashboard:`)
      console.log(`   SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'assigned_tasks';`)
    } catch (err) {
      console.log(`   ℹ️  Для перевірки індексів виконайте SQL запит в Supabase Dashboard`)
    }
  }
  
  console.log('\n' + '='.repeat(60))
  console.log('\n💡 Рекомендації:')
  console.log('   - Якщо час виконання > 500ms - перевірте наявність індексів')
  console.log('   - Якщо час виконання > 1000ms - потрібна додаткова оптимізація')
  console.log('   - Переконайтеся що міграція 019_add_performance_indexes.sql виконана')
  console.log('\n')
}

// Запуск тестів
testQueries().catch(error => {
  console.error('❌ Критична помилка:', error)
  process.exit(1)
})

