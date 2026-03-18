# 🛍 Telegram Digital Shop

Sistem toko digital otomatis berbasis Telegram bot dengan dashboard admin.

## 📁 Struktur Project

```
telegram-shop/
├── backend/          # Express API + Telegraf Bot
└── dashboard/        # Next.js Admin Dashboard
```

---

## ⚙️ Tech Stack

| Layer         | Teknologi               |
|---------------|-------------------------|
| Bot           | Node.js + Telegraf      |
| API           | Node.js + Express       |
| Database      | PostgreSQL              |
| Payment       | Midtrans Snap           |
| Dashboard     | Next.js + Tailwind CSS  |

---

## 🚀 Setup Step-by-Step

### 1. Prerequisites

- Node.js >= 18
- PostgreSQL >= 14
- Akun [Midtrans Sandbox](https://sandbox.midtrans.com)
- Telegram Bot dari [@BotFather](https://t.me/BotFather)

---

### 2. Clone & Install

```bash
# Backend
cd backend
npm install

# Dashboard
cd ../dashboard
npm install
```

---

### 3. Konfigurasi Environment

**Backend:**
```bash
cd backend
cp .env.example .env
# Edit .env dengan nilai yang benar
```

Isi file `.env`:
```
PORT=3001
DATABASE_URL=postgresql://user:password@localhost:5432/telegram_shop
BOT_TOKEN=         # dari BotFather
MIDTRANS_SERVER_KEY=SB-Mid-server-xxxx
MIDTRANS_CLIENT_KEY=SB-Mid-client-xxxx
JWT_SECRET=random_string_panjang
ADMIN_TELEGRAM_ID= # telegram user ID kamu (untuk notif out-of-stock)
NODE_ENV=development
```

**Dashboard:**
```bash
cd dashboard
cp .env.example .env.local
# Isi NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

---

### 4. Setup Database

```bash
# Buat database
createdb telegram_shop

# Jalankan migrasi
cd backend
npm run migrate
```

---

### 5. Buat Admin Pertama

```bash
cd backend
ADMIN_EMAIL=admin@toko.com ADMIN_PASSWORD=password123 npm run seed:admin
```

---

### 6. Jalankan Server

**Terminal 1 — Backend + Bot:**
```bash
cd backend
npm run dev
```

**Terminal 2 — Dashboard:**
```bash
cd dashboard
npm run dev
```

Akses dashboard di: http://localhost:3000

---

### 7. Setup Webhook Midtrans (Development)

Gunakan ngrok untuk expose backend ke internet:

```bash
npx ngrok http 3001
```

Copy URL yang muncul (contoh: `https://abc123.ngrok.io`), lalu:

1. Login ke [Midtrans Sandbox Dashboard](https://dashboard.sandbox.midtrans.com)
2. Menu: Settings → Configuration
3. Set **Payment Notification URL** ke:
   ```
   https://abc123.ngrok.io/api/webhook/midtrans
   ```
4. Save

---

### 8. Cara Dapat Bot Token

1. Buka Telegram, cari `@BotFather`
2. Kirim `/newbot`
3. Ikuti instruksi, beri nama bot
4. Copy token ke `BOT_TOKEN` di `.env`

---

## 🔄 Alur Pembelian

```
User klik Buy
  → Buat order (status: pending)
  → Generate Midtrans payment link
  → User bayar di Midtrans

Midtrans kirim webhook
  → Verifikasi signature SHA-512
  → Cek idempotency (jangan proses 2x)
  → Ambil 1 stok (FOR UPDATE SKIP LOCKED)
  → Update order → paid
  → Kirim email:password ke user via Telegram
```

---

## 📤 Format Upload Stok

Di halaman Stocks dashboard, paste akun dengan format:

```
email@example.com:password123
user2@gmail.com:mypass456
akun3@yahoo.com:secret789
```

Satu baris = satu akun. Pemisah adalah tanda titik dua `:` pertama.

---

## 🔐 Security Checklist

- [x] Webhook signature diverifikasi (SHA-512)
- [x] Idempotency check mencegah double delivery
- [x] `FOR UPDATE SKIP LOCKED` mencegah race condition
- [x] Password admin di-hash dengan bcrypt
- [x] JWT untuk autentikasi dashboard
- [x] Parameterized query mencegah SQL injection
- [x] Order duplikat dicek sebelum payment dibuat

---

## 🛠 Production Deployment

1. Set `NODE_ENV=production` di `.env`
2. Gunakan PM2: `pm2 start src/app.js --name telegram-shop`
3. Deploy dashboard ke Vercel: `vercel --prod`
4. Setup PostgreSQL di cloud (Supabase / Railway / RDS)
5. Ganti ngrok dengan domain permanen untuk webhook Midtrans

---

## 📞 Notifikasi Out-of-Stock

Jika ada pesanan berbayar tapi stok habis, bot akan otomatis notifikasi admin via Telegram (perlu set `ADMIN_TELEGRAM_ID` di `.env`).
