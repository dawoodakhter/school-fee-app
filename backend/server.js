require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');
const { loadStudents, getSettings } = require('./studentData');
const { getFeeSummary } = require('./feeCalc');
const { requireLogin } = require('./auth');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'School Fee API is running' });
});

app.get('/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT COUNT(*) FROM students');
       res.json({ database: 'connected' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ database: 'error', message: err.message });
  }
});

app.use('/api/auth', require('./routes/auth')); // login (open to everyone)
app.use('/api', requireLogin); // everything below this line needs a login
app.use('/api/payments', require('./routes/payments'));
app.use('/api/students', require('./routes/students'));
app.use('/api/classes', require('./routes/classes'));
app.use('/api/charges', require('./routes/charges'));
// List of all students with their fee totals.
// Optional filters: /api/students?class=Class 1&status=pending
app.get('/api/students', async (req, res) => {
  try {
    const settings = await getSettings();
    const students = await loadStudents();
        let list = students.filter((s) => s.is_active || req.query.includeInactive === 'true').map((s) => {
      const f = getFeeSummary(s, settings);
      return {
        id: s.id, name: s.name, rollNumber: s.roll_number, class: s.class_name,
        section: s.section, concession: s.concession,
        totalDue: f.totalDue, totalPaid: f.totalPaid, remaining: f.remaining,
        status: f.status,
      };
    });
    if (req.query.class) list = list.filter((s) => s.class === req.query.class);
    if (req.query.status) list = list.filter((s) => s.status === req.query.status);
    res.json({ count: list.length, students: list });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

// One student with the full month-by-month fee card
app.get('/api/students/:id/summary', async (req, res) => {
  try {
    const settings = await getSettings();
    const found = await loadStudents(Number(req.params.id));
    if (found.length === 0) return res.status(404).json({ message: 'Student not found' });
    const s = found[0];
    res.json({
      student: { id: s.id, name: s.name, rollNumber: s.roll_number, class: s.class_name, concession: s.concession },
      fees: getFeeSummary(s, settings),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log('Server running on port ' + PORT));