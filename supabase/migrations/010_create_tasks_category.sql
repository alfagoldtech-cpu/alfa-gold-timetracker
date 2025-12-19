-- Створення таблиці tasks_category (категорії задач)
CREATE TABLE IF NOT EXISTS tasks_category (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(name, project_id) -- Унікальна комбінація назви та проекту
);

-- Індекси для швидшого пошуку
CREATE INDEX IF NOT EXISTS idx_tasks_category_project_id ON tasks_category(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_category_name ON tasks_category(name);

-- Тригер для автоматичного оновлення updated_at
CREATE TRIGGER update_tasks_category_updated_at
  BEFORE UPDATE ON tasks_category
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();




