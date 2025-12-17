-- Видалення всіх таблиць (у правильному порядку через foreign keys)
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS roles CASCADE;

-- Створення таблиці roles (роль)
CREATE TABLE roles (
  id SERIAL PRIMARY KEY,
  role_name VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Створення таблиці projects
CREATE TABLE projects (
  id SERIAL PRIMARY KEY,
  date_added TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50),
  surname VARCHAR(255),
  middle_name VARCHAR(255),
  phone VARCHAR(50),
  company_name VARCHAR(255),
  company_code VARCHAR(100),
  email VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Створення таблиці users
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  surname VARCHAR(255),
  name VARCHAR(255),
  middle_name VARCHAR(255),
  phone VARCHAR(50),
  status VARCHAR(50),
  date_added TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  email VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Створення індексів для швидшого пошуку
CREATE INDEX idx_users_project_id ON users(project_id);
CREATE INDEX idx_users_role_id ON users(role_id);
CREATE INDEX idx_roles_role_name ON roles(role_name);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_company_code ON projects(company_code);

-- Функція для автоматичного оновлення updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Тригери для автоматичного оновлення updated_at
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_roles_updated_at
  BEFORE UPDATE ON roles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Вставка базових ролей
INSERT INTO roles (role_name) VALUES
  ('Адміністратор'),
  ('Керівник виробництва'),
  ('Тім лід'),
  ('Головний бухгалтер'),
  ('Аудитор'),
  ('Аккаунт менеджер'),
  ('Бухгалтер');
