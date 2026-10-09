require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const pool = require('./db');
const { loadStudents, getSettings } = require('./studentData');
const { getFeeSummary } = require('./feeCalc');
const { requireLogin } = require('./auth');
const { lanAddresses } = require('./network');

const app = express();

// Only trust the "forwarded" headers when the app really sits behind a proxy (set TRUST_PROXY=1 in .env then).
// Inside an office network there is no proxy, and trusting them would let anyone fake their address.
app.set('trust proxy', process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : false);

// Safety headers on every answer. (The "upgrade insecure requests" rule is off so the app also works on http://localhost.)
app.use(
  helmet({
    contentSecurityPolicy: { useDefaults: true, directives: { 'upgrade-insecure-requests': null } },
  })
);
app.use(express.json({ limit: '2mb' })); // big enough for a spreadsheet of a few thousand students

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ database: 'connected' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ database: 'error', message: err.message });
  }
});

app.use('/api/auth', require('./routes/auth')); // login (open to everyone)
app.use('/api', requireLogin); // everything below this line needs a login
app.use('/api/payments', require('./routes/payments'));
app.use('/api/students', require('./routes/studentImport')); // must come before the next line
app.use('/api/students', require('./routes/students'));
app.use('/api/classes', require('./routes/classes'));
app.use('/api/charges', require('./routes/charges'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/backup', require('./routes/backup'));
app.use('/api/new-session', require('./routes/newSession'));

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
        status: f.status, isActive: s.is_active,
        guardianName: s.guardian_name, contactNumber: s.contact_number,
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

// Any other /api address does not exist
app.use('/api', (req, res) => {
  res.status(404).json({ message: 'Not found' });
});

// If the website has been built (frontend/dist), serve it from here too.
const dist = path.join(__dirname, '..', 'frontend', 'dist');
const siteBuilt = fs.existsSync(path.join(dist, 'index.html'));
if (siteBuilt) {
  app.use(express.static(dist));
  // every other page address belongs to the website (it shows the right screen itself)
  app.get(/^\/(?!api(\/|$)|health$).*/, (req, res) => {
    res.sendFile(path.join(dist, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.json({ message: 'School Fee API is running' });
  });
}

// Last safety net: always answer with JSON, never with a technical error page.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'The request is not valid JSON' });
  if (err.type === 'entity.too.large') return res.status(413).json({ message: 'The request is too big' });
  console.error(err);
  res.status(500).json({ message: 'Something went wrong' });
});

const PORT = process.env.PORT || 5000;
// HOST is optional. HOST=127.0.0.1 in .env lets only THIS computer open the app.
const HOST = process.env.HOST;

function started() {
  console.log('Server running on port ' + PORT);
  if (!siteBuilt) return; // while you are programming, the website runs separately (npm run dev)
  console.log('');
  console.log('The school fee app is ready. Open it on this computer:');
  console.log('   http://localhost:' + PORT);
  if (HOST === '127.0.0.1' || HOST === 'localhost') {
    console.log('Only this computer can open it (HOST is set in .env).');
  } else {
    const addresses = lanAddresses();
    if (addresses.length > 0) {
      console.log('Other computers on the same network can open:');
      for (const ip of addresses) console.log('   http://' + ip + ':' + PORT);
    }
  }
  console.log('');
  console.log('Keep this window open while you use the app. Close it to stop the app.');
}

if (HOST) app.listen(PORT, HOST, started);
else app.listen(PORT, started);