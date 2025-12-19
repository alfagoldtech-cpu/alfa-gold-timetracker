import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://fstvavndcscqisatuyxn.supabase.co'
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzdHZhdm5kY3NjcWlzYXR1eXhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU5NDc5OTIsImV4cCI6MjA4MTUyMzk5Mn0.5nw1wyPLPLa8Tt-zX8UEkBJZ4bNCR4jus7wHzlb9rnU'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function checkKveds() {
  console.log('🔍 Перевірка таблиці kveds...\n')

  try {
    // Перевіряємо чи існує таблиця
    console.log('1️⃣ Перевіряю наявність таблиці kveds...')
    const { data, error } = await supabase
      .from('kveds')
      .select('*')
      .limit(1)
    
    if (error) {
      console.log('❌ Помилка при доступі до таблиці kveds:')
      console.log('   Код помилки:', error.code)
      console.log('   Повідомлення:', error.message)
      console.log('   Деталі:', error.details)
      console.log('   Підказка:', error.hint)
      
      if (error.code === 'PGRST116' || error.message.includes('does not exist')) {
        console.log('\n📝 Рішення:')
        console.log('   Виконайте міграцію 003_create_kveds.sql в Supabase SQL Editor')
        return
      }
      
      return
    }

    // Перевіряємо кількість записів
    const { count, error: countError } = await supabase
      .from('kveds')
      .select('*', { count: 'exact', head: true })
    
    if (countError) {
      console.log('⚠️ Не вдалося підрахувати записи:', countError.message)
    } else {
      console.log(`✅ Таблиця kveds існує`)
      console.log(`   Знайдено записів: ${count || 0}`)
      
      if (count === 0) {
        console.log('\n📝 Рішення:')
        console.log('   Виконайте міграцію 005_insert_kveds.sql в Supabase SQL Editor')
      } else {
        console.log('\n✅ Все добре! КВЕДи завантажені.')
        
        // Показуємо перші 5 записів
        const { data: sampleData } = await supabase
          .from('kveds')
          .select('*')
          .limit(5)
          .order('code')
        
        if (sampleData && sampleData.length > 0) {
          console.log('\n📋 Приклади КВЕДів:')
          sampleData.forEach(kved => {
            console.log(`   ${kved.code} - ${kved.description}`)
          })
        }
      }
    }
  } catch (err) {
    console.error('❌ Несподівана помилка:', err)
  }
}

checkKveds()






