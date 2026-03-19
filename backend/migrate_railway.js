const { pool } = require('./src/db/pool');
const sql = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, telegram_id BIGINT UNIQUE NOT NULL, username VARCHAR(100), first_name VARCHAR(100), balance BIGINT DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS products (id SERIAL PRIMARY KEY, name VARCHAR(200) NOT NULL, description TEXT, price INTEGER NOT NULL, is_active BOOLEAN DEFAULT true, image_url TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS stocks (id SERIAL PRIMARY KEY, product_id INTEGER REFERENCES products(id) ON DELETE CASCADE, email VARCHAR(300) NOT NULL, password VARCHAR(300) NOT NULL, status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available','sold','reserved')), order_id INTEGER, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS orders (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id), product_id INTEGER REFERENCES products(id), stock_id INTEGER REFERENCES stocks(id), payment_id VARCHAR(200) UNIQUE, payment_url TEXT, amount INTEGER NOT NULL, qty INTEGER DEFAULT 1, status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','expired')), created_at TIMESTAMPTZ DEFAULT NOW(), paid_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS admins (id SERIAL PRIMARY KEY, email VARCHAR(200) UNIQUE NOT NULL, password_hash VARCHAR(200) NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE INDEX IF NOT EXISTS idx_stocks_product_status ON stocks(product_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_id ON orders(payment_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_users_telegram ON users(telegram_id);
`;
pool.query(sql).then(() => console.log('Migration OK')).catch(console.error).finally(() => process.exit());
