// Settings route: the billing period (first and last month) and the list of months in it.
const express = require('express');
const { getSettings } = require('../studentData');
const { getMonthsBetween } = require('../feeCalc');

const router = express.Router();

// /api/settings
router.get('/', async (req, res) => {
  try {
    const settings = await getSettings();
    res.json({
      start: settings.start,
      end: settings.end,
      months: getMonthsBetween(settings.start, settings.end),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;