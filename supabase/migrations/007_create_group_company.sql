-- Створення таблиці group_company (групи компаній)
CREATE TABLE IF NOT EXISTS group_company (
  id SERIAL PRIMARY KEY,
  group_name VARCHAR(255) NOT NULL,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(group_name, project_id)
);

-- Додавання поля group_company_id до таблиці clients
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS group_company_id INTEGER REFERENCES group_company(id) ON DELETE SET NULL;

-- Індекси для швидшого пошуку
CREATE INDEX IF NOT EXISTS idx_group_company_project_id ON group_company(project_id);
CREATE INDEX IF NOT EXISTS idx_group_company_group_name ON group_company(group_name);
CREATE INDEX IF NOT EXISTS idx_clients_group_company_id ON clients(group_company_id);

-- Тригер для автоматичного оновлення updated_at
CREATE TRIGGER update_group_company_updated_at
  BEFORE UPDATE ON group_company
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

