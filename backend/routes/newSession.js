// New school session routes: /api/new-session
const express = require('express');
const { preview, startNewSession } = require('../newSession');

const router = express.Router();

function fail(res, err) {
  if (err.status) return res.status(err.status).json({ message: err.message });
  console.error(err);
  res.status(500).json({ message: err.message });
}

// PREVIEW (changes nothing): /api/new-session/preview?start=2027-04&end=2028-03
router.get('/preview', async (req, res) => {
  try {
    res.json(await preview(req.query.start, req.query.end));
  } catch (err) {
    fail(res, err);
  }
});

// START the new session. Body: { "start": "2027-04", "end": "2028-03", "confirm": "START NEW SESSION" }
router.post('/', async (req, res) => {
  try {
    if (req.body.confirm !== 'START NEW SESSION') {
      return res.status(400).json({ message: 'Type START NEW SESSION to confirm' });
    }
    res.json(await startNewSession(req.body.start, req.body.end));
  } catch (err) {
    fail(res, err);
  }
});

module.exports = router;