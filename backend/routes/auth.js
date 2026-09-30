// Login routes: log in, see who is logged in, change the password.
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const pool = require('../db');
const { requireLogin, signToken } = require('../auth');

const router = express.Router();

// Used when the username does not exist, so a wrong username and a wrong password take the same time.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

// Only WRONG attempts are counted: 10 wrong tries, then a 15 minute wait.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many wrong attempts. Please try again in 15 minutes' },
});

// LOG IN. Body: { "username": "admin", "password": "your password" }
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const username = String(req.body.username || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!username || !password) {
      return res.status(400).json({ message: 'username and password are required' });
    }
    const r = await pool.query('SELECT id, username, password_hash FROM users WHERE username = $1', [username]);
    const user = r.rows[0];
    const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok) return res.status(401).json({ message: 'Wrong username or password' });
    res.json({ token: signToken(user), username: user.username, expiresIn: '12h' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

// WHO AM I (also a quick way to check that a token still works)
router.get('/me', requireLogin, (req, res) => {
  res.json({ username: req.user.username });
});

// CHANGE PASSWORD. Body: { "currentPassword": "...", "newPassword": "..." }
router.post('/change-password', requireLogin, async (req, res) => {
  try {
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');
    if (newPassword.length < 8 || newPassword.length > 72) {
      return res.status(400).json({ message: 'New password must be 8 to 72 characters' });
    }
    const r = await pool.query('SELECT id, password_hash FROM users WHERE id = $1', [req.user.sub]);
    if (r.rowCount === 0) return res.status(404).json({ message: 'User not found' });
    const ok = await bcrypt.compare(currentPassword, r.rows[0].password_hash);
    if (!ok) return res.status(401).json({ message: 'Current password is wrong' });
    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.sub]);
    res.json({ message: 'Password changed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;