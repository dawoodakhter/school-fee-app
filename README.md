# School Fee Manager

A full-stack fee management app, built for a real school (Al Hira Public School). It replaces an old single-file HTML tool with a proper database, a secure admin login and a React website.

## What it does

- **Students and classes:** add, edit, move, deactivate and restore students. Each student can have a concession or a custom fee.
- **Fees:** monthly tuition, stationary, exam and fund fees. Unpaid balance carries forward, and only months that have started count as owed.
- **Payments and receipts:** record payments and print a receipt that shows the amount in words.
- **Reports:** fees owed and payments received, with print and spreadsheet download.
- **WhatsApp reminders:** one click opens WhatsApp with a ready message per student. Nothing is sent automatically.
- **Import and export:** students move in and out through spreadsheet files (CSV). Imports are checked first, and a bad file changes nothing.
- **Backup and restore:** download everything in one file and restore it later. Restores are all-or-nothing.
- **New school session:** moves students up a class, carries unpaid fees forward and sets the new April to March billing period, after a preview and a typed confirmation.
- **Secure admin login:** hashed passwords, signed tokens that expire, and rate limiting on wrong logins.

## Tech

| Part | Tools |
| --- | --- |
| Frontend | React, Vite, React Router, Vitest and Testing Library |
| Backend | Node.js, Express, `pg`, bcrypt, JSON Web Tokens, helmet, express-rate-limit |
| Database | PostgreSQL (Neon) |

## How it is built

- Fee rules live in one place (`backend/feeCalc.js`) and do no database work, so they are easy to test.
- Balances are never stored. They are always worked out from the fee rows and the payments.
- Imports, restores and the new-session switch run in a single database transaction: they finish completely or not at all.
- Tests are protected by a guard that refuses to run on a database holding real school data.

## Run it

1. Install Node.js and create a PostgreSQL database (a free Neon project works).
2. Copy `backend/.env.example` to `backend/.env` and fill in `DATABASE_URL` and `JWT_SECRET`.
3. In `backend`: `npm install`, then `node scripts/setupDatabase.js` and `node scripts/createAdmin.js`.
4. Optional: `node scripts/seedDemo.js` fills a **demo** database with fake students.
5. In `frontend`: `npm install` and `npm run build`.
6. In `backend`: `node server.js`, then open http://localhost:5000.

## Privacy

Real student data is never stored in this repository. The demo data is fake.