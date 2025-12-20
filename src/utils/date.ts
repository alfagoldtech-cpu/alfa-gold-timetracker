/**
 * Форматує дату у формат української локалі
 * @param dateString - Дата у форматі рядка (ISO або інший)
 * @returns Відформатована дата у форматі ДД.ММ.РРРР
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  
  // Перевіряємо чи дата валідна
  if (isNaN(date.getTime())) {
    return dateString
  }
  
  // Форматуємо вручну для гарантованого формату дд.ММ.рррр
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  
  return `${day}.${month}.${year}`
}

/**
 * Конвертує дату з формату дд.ММ.рррр в формат YYYY-MM-DD (для input type="date")
 * @param dateString - Дата у форматі дд.ММ.рррр
 * @returns Дата у форматі YYYY-MM-DD або порожній рядок якщо невалідна
 */
export function parseDateToISO(dateString: string): string {
  if (!dateString || !dateString.trim()) {
    return ''
  }
  
  // Перевіряємо формат дд.ММ.рррр
  const match = dateString.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (match) {
    const [, day, month, year] = match
    return `${year}-${month}-${day}`
  }
  
  // Якщо вже у форматі YYYY-MM-DD, повертаємо як є
  if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return dateString
  }
  
  // Спробуємо розпарсити як ISO дату
  const date = new Date(dateString)
  if (!isNaN(date.getTime())) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  
  return ''
}

/**
 * Конвертує дату з формату YYYY-MM-DD в формат дд.ММ.рррр
 * @param dateString - Дата у форматі YYYY-MM-DD
 * @returns Дата у форматі дд.ММ.рррр
 */
export function formatDateToUA(dateString: string): string {
  if (!dateString || !dateString.trim()) {
    return ''
  }
  
  // Якщо вже у форматі дд.ММ.рррр, повертаємо як є
  if (dateString.match(/^\d{2}\.\d{2}\.\d{4}$/)) {
    return dateString
  }
  
  // Конвертуємо з YYYY-MM-DD
  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) {
    const [, year, month, day] = match
    return `${day}.${month}.${year}`
  }
  
  // Спробуємо розпарсити як ISO дату
  const date = new Date(dateString)
  if (!isNaN(date.getTime())) {
    return formatDate(dateString)
  }
  
  return dateString
}

/**
 * Форматує валюту у формат української гривні
 * @param amount - Сума для форматування
 * @returns Відформатована валюта або '-' якщо сума не вказана
 */
export function formatCurrency(amount?: number): string {
  if (!amount) return '-'
  return new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency: 'UAH',
    minimumFractionDigits: 2
  }).format(amount)
}

/**
 * Форматує хвилини у формат "X г. Y хв."
 * @param minutes - Кількість хвилин (може бути null)
 * @returns Відформатований час у форматі "X г. Y хв." або "0 г. 0 хв." якщо null
 */
export function formatMinutesToHoursMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) {
    return '0 г. 0 хв.'
  }
  
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  
  return `${hours} г. ${mins} хв.`
}

/**
 * Отримує понеділок поточного тижня
 */
export function getCurrentWeekMonday(): Date {
  const today = new Date()
  const dayOfWeek = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() + (dayOfWeek === 0 ? -6 : 1) - dayOfWeek)
  monday.setHours(0, 0, 0, 0)
  return monday
}

/**
 * Додає дні до дати
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

/**
 * Отримує всі дати тижня, починаючи з понеділка
 */
export function getWeekDates(startDate: Date): Date[] {
  const week: Date[] = []
  for (let i = 0; i < 7; i++) {
    week.push(addDays(startDate, i))
  }
  return week
}

/**
 * Отримує всі дати місяця
 */
export function getAllDatesInMonth(date: Date): Date[] {
  const year = date.getFullYear()
  const month = date.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const dates: Date[] = []
  
  for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
    dates.push(new Date(d))
  }
  
  return dates
}

/**
 * Форматує дату у ключ формату YYYY-MM-DD
 */
export function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Перевіряє, чи дата є сьогоднішньою
 */
export function isToday(date: Date): boolean {
  const today = new Date()
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  )
}

/**
 * Форматує місяць та рік українською мовою
 * @param date - Дата
 * @returns Рядок формату "Місяць Рік р."
 */
export function formatMonthYear(date: Date): string {
  const months = [
    'січень', 'лютий', 'березень', 'квітень', 'травень', 'червень',
    'липень', 'серпень', 'вересень', 'жовтень', 'листопад', 'грудень'
  ]
  return `${months[date.getMonth()]} ${date.getFullYear()} р.`
}

