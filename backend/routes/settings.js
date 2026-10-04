// Settings routes: school details and the billing period.
const express = require('express');
const pool = require('../db');
const { getMonthsBetween } = require('../feeCalc');
const { extendBillingPeriod } = require('../billing');

const router = express.Router();

async function readSettings(db) {
  const r = await db.query('SELECT key, value FROM settings');
  const m = Object.fromEntries(r.rows.map((x) => [x.key, x.value]));
  return {
    start: m.academic_year_start,
    end: m.academic_year_end,
    months: getMonthsBetween(m.academic_year_start, m.academic_year_end),
    schoolName: m.school_name || '',
    schoolAddress: m.school_address || '',
    schoolPhone: m.school_phone || '',
  };
}

// /api/settings
router.get('/', async (req, res) => {
  try {
    res.json(await readSettings(pool));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

// SAVE the school details. Body: { "schoolName": "...", "schoolAddress": "...", "schoolPhone": "..." }
router.put('/school', async (req, res) => {
  try {
    const fields = [
      ['schoolName', 'school_name', 100],
      ['schoolAddress', 'school_address', 200],
      ['schoolPhone', 'school_phone', 40],
    ];
    const rows = [];
    for (const [key, column, max] of fields) {
      if (req.body[key] === undefined) continue;
      const text = String(req.body[key]).trim();
      if (text.length > max) return res.status(400).json({ message: `${key} is too long (at most ${max} letters)` });
      rows.push([column, text]);
    }
    if (rows.length === 0) return res.status(400).json({ message: 'Nothing to save' });
    for (const [column, text] of rows) {
      await pool.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [column, text]
      );
    }
    res.json(await readSettings(pool));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

// MAKE THE BILLING PERIOD LONGER. Body: { "start": "2026-09", "end": "2027-06" }
router.put('/billing-period', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await extendBillingPeriod(client, req.body.start, req.body.end);
    await client.query('COMMIT');
    res.json(result);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ message: err.message });
    console.error(err);
    res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;