-- Створення таблиці clients (клієнти)
CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  edrpou VARCHAR(20) UNIQUE,
  legal_name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  status VARCHAR(50) DEFAULT 'active',
  company_group VARCHAR(255),
  service_cost DECIMAL(15, 2),
  company_folder VARCHAR(500),
  client_card TEXT,
  address TEXT,
  city VARCHAR(255),
  kved_id INTEGER REFERENCES kveds(id) ON DELETE SET NULL,
  activity_type VARCHAR(255),
  email VARCHAR(255),
  type VARCHAR(100),
  director_full_name VARCHAR(255),
  gender VARCHAR(20),
  iban VARCHAR(50),
  bank_name VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Створення проміжної таблиці для відділів обслуговування (many-to-many)
CREATE TABLE IF NOT EXISTS client_departments (
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (client_id, department_id)
);

-- Створення проміжної таблиці для закріплених працівників (many-to-many)
CREATE TABLE IF NOT EXISTS client_employees (
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (client_id, user_id)
);

-- Індекси для швидшого пошуку
CREATE INDEX IF NOT EXISTS idx_clients_edrpou ON clients(edrpou);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
CREATE INDEX IF NOT EXISTS idx_clients_kved_id ON clients(kved_id);
CREATE INDEX IF NOT EXISTS idx_clients_created_at ON clients(created_at);
CREATE INDEX IF NOT EXISTS idx_client_departments_client_id ON client_departments(client_id);
CREATE INDEX IF NOT EXISTS idx_client_departments_department_id ON client_departments(department_id);
CREATE INDEX IF NOT EXISTS idx_client_employees_client_id ON client_employees(client_id);
CREATE INDEX IF NOT EXISTS idx_client_employees_user_id ON client_employees(user_id);

-- Тригер для автоматичного оновлення updated_at
CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();







