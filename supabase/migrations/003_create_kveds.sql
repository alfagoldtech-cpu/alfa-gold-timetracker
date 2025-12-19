-- Створення таблиці КВЕДів (коди видів економічної діяльності)
CREATE TABLE IF NOT EXISTS kveds (
  id SERIAL PRIMARY KEY,
  code VARCHAR(10) NOT NULL UNIQUE,
  description TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Індекс для швидшого пошуку за кодом
CREATE INDEX IF NOT EXISTS idx_kveds_code ON kveds(code);

-- Тригер для автоматичного оновлення updated_at
CREATE TRIGGER update_kveds_updated_at
  BEFORE UPDATE ON kveds
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();






