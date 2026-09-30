// Class routes: list the classes with their monthly fee and student count.
const express = require('express');
const pool = require('../db');

const router = express.Router();

// LIST all classes: /api/classes
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.name, c.monthly_fee AS "monthlyFee", c.sort_order AS "sortOrder",
              COUNT(s.id) FILTER (WHERE s.is_active)::int AS "studentCount"
       FROM classes c LEFT JOIN students s ON s.class_id = c.id
       GROUP BY c.id ORDER BY c.sort_order`
    );
    res.json({ count: result.rowCount, classes: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;