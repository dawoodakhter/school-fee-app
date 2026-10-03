// Backup route: gives you all the school data as one file.
const express = require('express');
const pool = require('../db');
const { makeBackup } = require('../backup');

const router = express.Router();

// /api/backup
router.get('/', async (req, res) => {
  try {
    const backup = await makeBackup(pool);
    const stamp = backup.createdAt.slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="school-fee-backup-${stamp}.json"`);
    res.json(backup);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;