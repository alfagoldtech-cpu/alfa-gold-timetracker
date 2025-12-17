import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://fstvavndcscqisatuyxn.supabase.co'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzdHZhdm5kY3NjcWlzYXR1eXhuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTk0Nzk5MiwiZXhwIjoyMDgxNTIzOTkyfQ.W5D-dhijIHJ3BbDOW4Dg7I3mV69HhH57pk1tbcibdPU'

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function checkTables() {
  console.log('🔍 Перевірка таблиць у Supabase...\n')

  try {
    console.log('1️⃣ Перевіряю таблицю roles...')
    const { data: roles, error: rolesError } = await supabase
      .from('roles')
      .select('*')
    
    if (rolesError) {
      console.log('❌ Таблиця roles не існує або помилка:', rolesError.message)
      console.log('📝 Потрібно виконати SQL міграцію')
    } else {
      console.log(`✅ Таблиця roles існує (знайдено ${roles?.length || 0} записів)`)
      if (roles && roles.length > 0) {
        console.log('   Ролі:')
        roles.forEach(role => {
          console.log(`   - ${role.name}: ${role.description || 'без опису'}`)
        })
      }
    }

    console.log('\n2️⃣ Перевіряю таблицю users...')
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*')
    
    if (usersError) {
      console.log('❌ Таблиця users не існує або помилка:', usersError.message)
      console.log('📝 Потрібно виконати SQL міграцію')
    } else {
      console.log(`✅ Таблиця users існує (знайдено ${users?.length || 0} записів)`)
    }

    console.log('\n📋 Висновок:')
    if (!rolesError && !usersError) {
      console.log('✅ Всі таблиці створені та працюють!')
      console.log('✅ База даних готова до використання')
    } else {
      console.log('⚠️  Потрібно виконати SQL міграцію')
      console.log('📝 Відкрийте Supabase Dashboard → SQL Editor')
      console.log('📝 Скопіюйте вміст файлу: supabase/migrations/001_create_tables.sql')
      console.log('📝 Виконайте SQL запит')
    }

  } catch (error) {
    console.error('❌ Помилка:', error.message)
  }
}

checkTables()

