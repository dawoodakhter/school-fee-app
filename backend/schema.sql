-- All the tables of the School Fee Manager. Safe to run again: it only creates what is missing.

CREATE TABLE IF NOT EXISTS classes (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  monthly_fee INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS students (
  id SERIAL PRIMARY KEY,
  roll_number TEXT NOT NULL,
  name TEXT NOT NULL,
  guardian_name TEXT,
  contact_number TEXT,
  gender TEXT,
  date_of_birth DATE,
  admission_date DATE,
  class_id INTEGER NOT NULL REFERENCES classes(id),
  section TEXT,
  concession INTEGER NOT NULL DEFAULT 0,
  custom_fee INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (class_id, roll_number)
);

CREATE TABLE IF NOT EXISTS monthly_fees (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  month CHAR(7) NOT NULL,
  tuition INTEGER NOT NULL DEFAULT 0,
  stationary INTEGER NOT NULL DEFAULT 0,
  exam INTEGER NOT NULL DEFAULT 0,
  misc_fund INTEGER NOT NULL DEFAULT 0,
  UNIQUE (student_id, month)
);

CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  month CHAR(7) NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  paid_on DATE NOT NULL DEFAULT CURRENT_DATE,
  received_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS one_time_charges (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  paid_amount INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payments_student_idx ON payments (student_id);
CREATE INDEX IF NOT EXISTS payments_paid_on_idx ON payments (paid_on);
CREATE INDEX IF NOT EXISTS students_class_idx ON students (class_id);