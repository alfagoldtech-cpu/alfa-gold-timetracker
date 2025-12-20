-- Додавання поля group_id до таблиці users
-- Це поле зберігає ID тім ліда, який створив цього співробітника
-- NULL означає, що співробітник не належить до жодної групи

ALTER TABLE users
ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Створюємо індекс для швидшого пошуку співробітників за групою
CREATE INDEX IF NOT EXISTS idx_users_group_id ON users(group_id);

-- Коментар для документації
COMMENT ON COLUMN users.group_id IS 'ID тім ліда, який створив цього співробітника. NULL означає, що співробітник не належить до групи.';





