require('./testGuard');
// Safety guard for the test scripts. Put this as the FIRST line of every test file:
//   require('./testGuard');
// It stops the test (before anything is touched) unless the database is the demo database or an empty one.
const { execFileSync } = require('child_process');

if (process.env.TEST_GUARD_CHILD) {
  // child mode: do the check
  require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
  const pool = require('../db');
  (async () => {
    const demo = await pool.query("SELECT value FROM settings WHERE key = 'demo_data'");
    const students = await pool.query('SELECT COUNT(*)::int AS n FROM students');
    const isDemo = demo.rows[0] && demo.rows[0].value === 'true';
    const isEmpty = students.rows[0].n === 0;
    await pool.end();
    process.exit(isDemo || isEmpty ? 0 : 3);
  })().catch((err) => {
    console.error('Guard could not check the database:', err.message);
    process.exit(2);
  });
} else {
  try {
    execFileSync(process.execPath, [__filename], {
      env: { ...process.env, TEST_GUARD_CHILD: '1' },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
  } catch (err) {
    console.error('');
    console.error('STOPPED. This test is not allowed to run on this database.');
    console.error('It looks like your REAL school data (students exist and it is not the demo database).');
    console.error('Tests can change data. Nothing was touched.');
    process.exit(1);
  }
}