-- SQL запити для створення клієнтів
-- УВАГА: Перед виконанням потрібно:
-- 1. Знати project_id вашого проекту (замініть <PROJECT_ID> на реальний ID)
-- 2. Переконатися, що групи компаній існують або створити їх
-- 3. Переконатися, що КВЕДи існують в таблиці kveds
-- 4. Знати user_id бухгалтерів для зв'язків

-- ============================================
-- КРОК 1: Створення груп компаній (якщо їх ще немає)
-- ============================================
-- Перевірте, чи існують ці групи, і якщо ні - створіть їх:
-- INSERT INTO group_company (group_name, project_id) VALUES ('Буковель', <PROJECT_ID>) ON CONFLICT DO NOTHING;
-- INSERT INTO group_company (group_name, project_id) VALUES ('Book.ua', <PROJECT_ID>) ON CONFLICT DO NOTHING;
-- INSERT INTO group_company (group_name, project_id) VALUES ('GELATO', <PROJECT_ID>) ON CONFLICT DO NOTHING;
-- INSERT INTO group_company (group_name, project_id) VALUES ('Lofter-gastro-bar', <PROJECT_ID>) ON CONFLICT DO NOTHING;
-- INSERT INTO group_company (group_name, project_id) VALUES ('Maiami', <PROJECT_ID>) ON CONFLICT DO NOTHING;

-- ============================================
-- КРОК 2: Отримання ID груп компаній та КВЕДів
-- ============================================
-- Виконайте ці запити, щоб отримати ID:
-- SELECT id, group_name FROM group_company WHERE project_id = <PROJECT_ID>;
-- SELECT id, code FROM kveds WHERE code IN ('55.1', '56.1', '47.81', '68.2', '56.3');
-- SELECT id, surname, name, middle_name FROM users WHERE project_id = <PROJECT_ID> AND (surname || ' ' || name || ' ' || COALESCE(middle_name, '')) IN ('Малькевич Олена', 'Мірошниченко Юлія', 'Слуковська Євгенія', 'Яблонська Ганна', 'Чернявська Валентина', 'Чиренко Ніна');

-- ============================================
-- КРОК 3: Вставка клієнтів
-- ============================================
-- Замініть <GROUP_COMPANY_ID_БУКОВЕЛЬ>, <KVED_ID_55.1> та інші на реальні ID з кроку 2

-- Клієнт 1: ФОП Стаховський Станіслав Борисович
INSERT INTO clients (
  edrpou, legal_name, phone, status, group_company_id, service_cost, 
  company_folder, client_card, address, city, kved_id, activity_type, 
  email, type, director_full_name, gender, iban, bank_name, created_at
) VALUES (
  '3367606313',
  'ФОП Стаховський Станіслав Борисович',
  '380930214860',
  'active',
  (SELECT id FROM group_company WHERE group_name = 'Буковель' AND project_id = <PROJECT_ID> LIMIT 1),
  2500.00,
  'https://drive.google.com/drive/folders/11GDrwl7qql3DUgfOUQOy-tdeLJdfVI4w?role=writer',
  NULL,
  'Україна, 23210, Вінницька обл., Вінницький р-н, селище Стрижавка, вулиця Героїв України, будинок 45',
  'Вишневе',
  (SELECT id FROM kveds WHERE code = '55.1' LIMIT 1),
  'готель',
  NULL,
  'ФОП',
  NULL,
  NULL,
  'UA513220010000026006370010611',
  'АТ "УНIВЕРСАЛ БАНК"',
  '2025-11-10'::timestamp
) ON CONFLICT (edrpou) DO UPDATE SET
  legal_name = EXCLUDED.legal_name,
  phone = EXCLUDED.phone,
  status = EXCLUDED.status,
  group_company_id = EXCLUDED.group_company_id,
  service_cost = EXCLUDED.service_cost,
  company_folder = EXCLUDED.company_folder,
  address = EXCLUDED.address,
  city = EXCLUDED.city,
  kved_id = EXCLUDED.kved_id,
  activity_type = EXCLUDED.activity_type,
  type = EXCLUDED.type,
  iban = EXCLUDED.iban,
  bank_name = EXCLUDED.bank_name;

-- Клієнт 2: ФОП Сайчук Олена Миколаївна
INSERT INTO clients (
  edrpou, legal_name, phone, status, group_company_id, service_cost, 
  company_folder, client_card, address, city, kved_id, activity_type, 
  email, type, director_full_name, gender, iban, bank_name, created_at
) VALUES (
  '3803305589',
  'ФОП Сайчук Олена Миколаївна',
  '380677564845',
  'active',
  (SELECT id FROM group_company WHERE group_name = 'Book.ua' AND project_id = <PROJECT_ID> LIMIT 1),
  5000.00,
  'https://drive.google.com/drive/u/0/folders/15_7ptff_d4-Lg0aPlp82zOZTWTxhROoG',
  NULL,
  'Україна, 08130, Київська обл., Бучанський р-н, село Петропавлівська Борщагівка, вулиця Кооперативна, будинок 23',
  'Київ',
  (SELECT id FROM kveds WHERE code = '56.1' LIMIT 1),
  'кухня',
  NULL,
  'ФОП',
  NULL,
  NULL,
  'UA533052990000026004016235459',
  'АТ КБ "ПриватБанк"',
  '2025-11-10'::timestamp
) ON CONFLICT (edrpou) DO UPDATE SET
  legal_name = EXCLUDED.legal_name,
  phone = EXCLUDED.phone,
  status = EXCLUDED.status,
  group_company_id = EXCLUDED.group_company_id,
  service_cost = EXCLUDED.service_cost,
  company_folder = EXCLUDED.company_folder,
  address = EXCLUDED.address,
  city = EXCLUDED.city,
  kved_id = EXCLUDED.kved_id,
  activity_type = EXCLUDED.activity_type,
  type = EXCLUDED.type,
  iban = EXCLUDED.iban,
  bank_name = EXCLUDED.bank_name;

-- Клієнт 3: ФОП Міходуй Богдан Андрійович
INSERT INTO clients (
  edrpou, legal_name, phone, status, group_company_id, service_cost, 
  company_folder, client_card, address, city, kved_id, activity_type, 
  email, type, director_full_name, gender, iban, bank_name, created_at
) VALUES (
  '3362716135',
  'ФОП Міходуй Богдан Андрійович',
  NULL,
  'active',
  (SELECT id FROM group_company WHERE group_name = 'GELATO' AND project_id = <PROJECT_ID> LIMIT 1),
  15000.00,
  NULL,
  NULL,
  'Україна, 30600, Хмельницька обл., Хмельницький р-н, село Теофіполь, вулиця Ювілейна, будинок 44',
  'Хмельницький',
  (SELECT id FROM kveds WHERE code = '47.81' LIMIT 1),
  'Виробництво морозива',
  NULL,
  'ФОП',
  NULL,
  NULL,
  NULL,
  NULL,
  '2025-12-07'::timestamp
) ON CONFLICT (edrpou) DO UPDATE SET
  legal_name = EXCLUDED.legal_name,
  status = EXCLUDED.status,
  group_company_id = EXCLUDED.group_company_id,
  service_cost = EXCLUDED.service_cost,
  address = EXCLUDED.address,
  city = EXCLUDED.city,
  kved_id = EXCLUDED.kved_id,
  activity_type = EXCLUDED.activity_type,
  type = EXCLUDED.type,
  created_at = EXCLUDED.created_at;

-- Клієнт 4: ФОП Голінко Антон Андрійович
INSERT INTO clients (
  edrpou, legal_name, phone, status, group_company_id, service_cost, 
  company_folder, client_card, address, city, kved_id, activity_type, 
  email, type, director_full_name, gender, iban, bank_name, created_at
) VALUES (
  '3695011412',
  'ФОП Голінко Антон Андрійович',
  '38(066)2153963',
  'active',
  (SELECT id FROM group_company WHERE group_name = 'Lofter-gastro-bar' AND project_id = <PROJECT_ID> LIMIT 1),
  3500.00,
  'https://drive.google.com/drive/u/0/folders/1M8BncWS1ElCAGU0iWnyoT7b1m7O3RrhY',
  'https://docs.google.com/spreadsheets/d/1hK_aq9_QsRWqBks27-ATMxMyLZ98viZThMuwzEtUgbo/edit?gid=609583644#gid=609583644',
  'УКРАЇНА, 25555, МІСТО КИЇВ, СВЯТОШИНСЬКИЙ Р-Н, ПР-Т ПЕРЕМОГИ, БУД. 121-А, КВ. 158',
  NULL,
  (SELECT id FROM kveds WHERE code = '68.2' LIMIT 1),
  NULL,
  NULL,
  'ФОП',
  NULL,
  NULL,
  'UA023052990000026006005040181',
  'АТ КБ "ПриватБанк"',
  '2025-02-19'::timestamp
) ON CONFLICT (edrpou) DO UPDATE SET
  legal_name = EXCLUDED.legal_name,
  phone = EXCLUDED.phone,
  status = EXCLUDED.status,
  group_company_id = EXCLUDED.group_company_id,
  service_cost = EXCLUDED.service_cost,
  company_folder = EXCLUDED.company_folder,
  client_card = EXCLUDED.client_card,
  address = EXCLUDED.address,
  kved_id = EXCLUDED.kved_id,
  type = EXCLUDED.type,
  iban = EXCLUDED.iban,
  bank_name = EXCLUDED.bank_name,
  created_at = EXCLUDED.created_at;

-- Клієнт 5: ФОП Лісняк Олеся Олегівна
INSERT INTO clients (
  edrpou, legal_name, phone, status, group_company_id, service_cost, 
  company_folder, client_card, address, city, kved_id, activity_type, 
  email, type, director_full_name, gender, iban, bank_name, created_at
) VALUES (
  '2923512922',
  'ФОП Лісняк Олеся Олегівна',
  '380675394670',
  'active',
  (SELECT id FROM group_company WHERE group_name = 'Lofter-gastro-bar' AND project_id = <PROJECT_ID> LIMIT 1),
  8300.00,
  'https://drive.google.com/drive/u/0/folders/1A1Pwzg4tMtUm-lO0W6oUhhu7w-tr3fJ3',
  NULL,
  'УКРАЇНА, 25555, МІСТО КИЇВ, СВЯТОШИНСЬКИЙ Р-Н, ПР-Т ПЕРЕМОГИ, БУД. 121-А, КВ. 158',
  NULL,
  (SELECT id FROM kveds WHERE code = '56.1' LIMIT 1),
  NULL,
  NULL,
  'ФОП',
  NULL,
  NULL,
  'UA193052990000026009045046647',
  'АТ КБ "ПриватБанк"',
  '2025-07-23'::timestamp
) ON CONFLICT (edrpou) DO UPDATE SET
  legal_name = EXCLUDED.legal_name,
  phone = EXCLUDED.phone,
  status = EXCLUDED.status,
  group_company_id = EXCLUDED.group_company_id,
  service_cost = EXCLUDED.service_cost,
  company_folder = EXCLUDED.company_folder,
  address = EXCLUDED.address,
  kved_id = EXCLUDED.kved_id,
  type = EXCLUDED.type,
  iban = EXCLUDED.iban,
  bank_name = EXCLUDED.bank_name,
  created_at = EXCLUDED.created_at;

-- Клієнт 6: ФОП Соловей Олександр Григорович
INSERT INTO clients (
  edrpou, legal_name, phone, status, group_company_id, service_cost, 
  company_folder, client_card, address, city, kved_id, activity_type, 
  email, type, director_full_name, gender, iban, bank_name, created_at
) VALUES (
  '2788412233',
  'ФОП Соловей Олександр Григорович',
  '38(067)5394670',
  'active',
  (SELECT id FROM group_company WHERE group_name = 'Lofter-gastro-bar' AND project_id = <PROJECT_ID> LIMIT 1),
  2500.00,
  'https://drive.google.com/drive/u/0/folders/1j9w-SowRHxvPYJ7eKYhSZhEAj_WP0pGF',
  'https://docs.google.com/spreadsheets/d/1hK_aq9_QsRWqBks27-ATMxMyLZ98viZThMuwzEtUgbo/edit?gid=609583644#gid=609583644',
  'Україна, 37233, Полтавська обл., Миргородський р-н, село Піски, вул. Каденюка Леоніда, будинок 21',
  NULL,
  (SELECT id FROM kveds WHERE code = '56.1' LIMIT 1),
  NULL,
  NULL,
  'ФОП',
  NULL,
  NULL,
  'UA563052990000026005005033229',
  'АТ КБ "ПриватБанк"',
  '2025-02-19'::timestamp
) ON CONFLICT (edrpou) DO UPDATE SET
  legal_name = EXCLUDED.legal_name,
  phone = EXCLUDED.phone,
  status = EXCLUDED.status,
  group_company_id = EXCLUDED.group_company_id,
  service_cost = EXCLUDED.service_cost,
  company_folder = EXCLUDED.company_folder,
  client_card = EXCLUDED.client_card,
  address = EXCLUDED.address,
  kved_id = EXCLUDED.kved_id,
  type = EXCLUDED.type,
  iban = EXCLUDED.iban,
  bank_name = EXCLUDED.bank_name,
  created_at = EXCLUDED.created_at;

-- Клієнт 7: ФОП Белочук Юрій Григорович
INSERT INTO clients (
  edrpou, legal_name, phone, status, group_company_id, service_cost, 
  company_folder, client_card, address, city, kved_id, activity_type, 
  email, type, director_full_name, gender, iban, bank_name, created_at
) VALUES (
  '2753501337',
  'ФОП Белочук Юрій Григорович',
  '380962358779',
  'active',
  (SELECT id FROM group_company WHERE group_name = 'Maiami' AND project_id = <PROJECT_ID> LIMIT 1),
  8000.00,
  'https://drive.google.com/drive/folders/1ahlkdYcvd5wi9a7kHYfOLNOKJLSjljTl',
  NULL,
  'Україна, 65031, Одеська область, м.Одеса, вул. Миколи Боровського, буд.37-Х, кв. 120',
  'Одеса',
  (SELECT id FROM kveds WHERE code = '56.3' LIMIT 1),
  'бар',
  NULL,
  'ФОП',
  NULL,
  NULL,
  'UA763052990000026000004920907',
  'АТ КБ "ПриватБанк"',
  '2025-11-10'::timestamp
) ON CONFLICT (edrpou) DO UPDATE SET
  legal_name = EXCLUDED.legal_name,
  phone = EXCLUDED.phone,
  status = EXCLUDED.status,
  group_company_id = EXCLUDED.group_company_id,
  service_cost = EXCLUDED.service_cost,
  company_folder = EXCLUDED.company_folder,
  address = EXCLUDED.address,
  city = EXCLUDED.city,
  kved_id = EXCLUDED.kved_id,
  activity_type = EXCLUDED.activity_type,
  type = EXCLUDED.type,
  iban = EXCLUDED.iban,
  bank_name = EXCLUDED.bank_name,
  created_at = EXCLUDED.created_at;

-- ============================================
-- КРОК 4: Зв'язки клієнтів з бухгалтерами (client_employees)
-- ============================================
-- Після вставки клієнтів потрібно створити зв'язки з бухгалтерами
-- Замініть <CLIENT_ID> та <USER_ID> на реальні ID

-- Клієнт 1 (3367606313) - бухгалтери: Малькевич Олена, Мірошниченко Юлія, Слуковська Євгенія, Яблонська Ганна
-- INSERT INTO client_employees (client_id, user_id)
-- SELECT c.id, u.id
-- FROM clients c, users u
-- WHERE c.edrpou = '3367606313'
--   AND (u.surname || ' ' || u.name || ' ' || COALESCE(u.middle_name, '')) IN ('Малькевич Олена', 'Мірошниченко Юлія', 'Слуковська Євгенія', 'Яблонська Ганна')
--   AND u.project_id = <PROJECT_ID>
-- ON CONFLICT DO NOTHING;

-- Клієнт 2 (3803305589) - бухгалтери: Малькевич Олена, Мірошниченко Юлія, Слуковська Євгенія
-- INSERT INTO client_employees (client_id, user_id)
-- SELECT c.id, u.id
-- FROM clients c, users u
-- WHERE c.edrpou = '3803305589'
--   AND (u.surname || ' ' || u.name || ' ' || COALESCE(u.middle_name, '')) IN ('Малькевич Олена', 'Мірошниченко Юлія', 'Слуковська Євгенія')
--   AND u.project_id = <PROJECT_ID>
-- ON CONFLICT DO NOTHING;

-- Клієнт 3 (3362716135) - бухгалтери: Слуковська Євгенія, Чернявська Валентина
-- INSERT INTO client_employees (client_id, user_id)
-- SELECT c.id, u.id
-- FROM clients c, users u
-- WHERE c.edrpou = '3362716135'
--   AND (u.surname || ' ' || u.name || ' ' || COALESCE(u.middle_name, '')) IN ('Слуковська Євгенія', 'Чернявська Валентина')
--   AND u.project_id = <PROJECT_ID>
-- ON CONFLICT DO NOTHING;

-- Клієнт 4 (3695011412) - бухгалтери: Малькевич Олена, Мірошниченко Юлія
-- INSERT INTO client_employees (client_id, user_id)
-- SELECT c.id, u.id
-- FROM clients c, users u
-- WHERE c.edrpou = '3695011412'
--   AND (u.surname || ' ' || u.name || ' ' || COALESCE(u.middle_name, '')) IN ('Малькевич Олена', 'Мірошниченко Юлія')
--   AND u.project_id = <PROJECT_ID>
-- ON CONFLICT DO NOTHING;

-- Клієнт 5 (2923512922) - бухгалтери: Малькевич Олена, Чиренко Ніна, Чернявська Валентина, Слуковська Євгенія
-- INSERT INTO client_employees (client_id, user_id)
-- SELECT c.id, u.id
-- FROM clients c, users u
-- WHERE c.edrpou = '2923512922'
--   AND (u.surname || ' ' || u.name || ' ' || COALESCE(u.middle_name, '')) IN ('Малькевич Олена', 'Чиренко Ніна', 'Чернявська Валентина', 'Слуковська Євгенія')
--   AND u.project_id = <PROJECT_ID>
-- ON CONFLICT DO NOTHING;

-- Клієнт 6 (2788412233) - бухгалтери: Малькевич Олена, Мірошниченко Юлія
-- INSERT INTO client_employees (client_id, user_id)
-- SELECT c.id, u.id
-- FROM clients c, users u
-- WHERE c.edrpou = '2788412233'
--   AND (u.surname || ' ' || u.name || ' ' || COALESCE(u.middle_name, '')) IN ('Малькевич Олена', 'Мірошниченко Юлія')
--   AND u.project_id = <PROJECT_ID>
-- ON CONFLICT DO NOTHING;

-- Клієнт 7 (2753501337) - бухгалтери: Малькевич Олена, Мірошниченко Юлія, Яблонська Ганна, Слуковська Євгенія, Чернявська Валентина
-- INSERT INTO client_employees (client_id, user_id)
-- SELECT c.id, u.id
-- FROM clients c, users u
-- WHERE c.edrpou = '2753501337'
--   AND (u.surname || ' ' || u.name || ' ' || COALESCE(u.middle_name, '')) IN ('Малькевич Олена', 'Мірошниченко Юлія', 'Яблонська Ганна', 'Слуковська Євгенія', 'Чернявська Валентина')
--   AND u.project_id = <PROJECT_ID>
-- ON CONFLICT DO NOTHING;

-- ============================================
-- ПРИМІТКИ:
-- ============================================
-- 1. Замініть <PROJECT_ID> на реальний ID вашого проекту
-- 2. Переконайтеся, що всі групи компаній створені
-- 3. Переконайтеся, що всі КВЕДи існують в таблиці kveds
-- 4. Розкоментуйте та виконайте запити для зв'язків з бухгалтерами після вставки клієнтів
-- 5. Якщо потрібно прив'язати клієнтів до відділів (departments), використайте таблицю client_departments



