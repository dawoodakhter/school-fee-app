// Fills a DEMO database with made-up students, payments and charges, and creates a demo login.
// It is built so it can never touch your real school data:
//   - you must type the demo database address yourself (it never uses the one in .env)
//   - it refuses if that address is the same as the one in .env
//   - it refuses a database that already holds students that are not demo data
//
// Run: node scripts/seedDemo.js "postgresql://...demo database address..." --yes
require('dotenv').config();
const bcrypt = require('bcryptjs');
const makePool = require('../makePool');

const url = process.argv[2];
const confirmed = process.argv.includes('--yes');

if (!url || url.startsWith('--') || !confirmed) {
  console.log('Usage: node scripts/seedDemo.js "<demo database address>" --yes');
  console.log('The address must be of a DEMO database, not your real one.');
  process.exit(1);
}
if (url === process.env.DATABASE_URL) {
  console.log('Stopped: that is the address of the database in your .env file (your REAL data).');
  console.log('Use a different, empty database for the demo.');
  process.exit(1);
}

const DEMO_USER = 'demo';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'Demo-School-2026';

// the same classes and fees as the real school
const CLASSES = [
  ['Playgroup', 1000], ['Nursery', 1100], ['Prep', 1200], ['Class 1', 1300], ['Class 2', 1400],
  ['Class 3', 1500], ['Class 4', 1600], ['Class 5', 1700], ['Class 6', 2000],
];
const START = '2026-09';
const END = '2027-03';
const MONTHS = ['2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03'];
const PER_CLASS = 8;

const BOYS = ['Ahmed', 'Ali', 'Hamza', 'Usman', 'Bilal', 'Hassan', 'Zain', 'Faizan', 'Talha', 'Saad', 'Umar', 'Daniyal', 'Hashim', 'Rayyan', 'Shayan', 'Danish'];
const GIRLS = ['Ayesha', 'Fatima', 'Zainab', 'Maryam', 'Hira', 'Sana', 'Iqra', 'Amna', 'Laiba', 'Noor', 'Areeba', 'Mahnoor', 'Eshal', 'Zoya', 'Alina', 'Sidra'];
const FATHERS = ['Tariq', 'Imran', 'Naveed', 'Kamran', 'Shahid', 'Rashid', 'Aslam', 'Javed', 'Farooq', 'Irfan', 'Nadeem', 'Saleem'];
const SURNAMES = ['Khan', 'Shah', 'Malik', 'Awan', 'Qureshi', 'Abbasi', 'Raja', 'Butt', 'Chaudhry', 'Mirza', 'Siddiqui', 'Yousaf', 'Hashmi', 'Rizvi'];
const CLERKS = ['Sir Ahmed', 'Miss Sana', 'Accounts Office'];

// a small random number generator, so the demo data is the same every time
function makeRandom(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = makeRandom(2026);
const pick = (list) => list[Math.floor(random() * list.length)];
const chance = (p) => random() < p;
const day = (n) => `2026-09-${String(n).padStart(2, '0')}`;

async function main() {
  const pool = makePool(url);
  const client = await pool.connect();
  try {
    const tables = await client.query("SELECT to_regclass('public.students') AS t");
    if (!tables.rows[0].t) {
      console.log('The tables are missing. Run: node scripts/setupDatabase.js "<same address>"');
      process.exitCode = 1;
      return;
    }
    const existing = await client.query('SELECT COUNT(*)::int AS n FROM students');
    const marker = await client.query("SELECT value FROM settings WHERE key = 'demo_data'");
    if (existing.rows[0].n > 0 && marker.rowCount === 0) {
      console.log(`Stopped: that database already holds ${existing.rows[0].n} students and is not marked as a demo database.`);
      process.exitCode = 1;
      return;
    }

    await client.query('BEGIN');
    await client.query('TRUNCATE payments, monthly_fees, one_time_charges, students, classes RESTART IDENTITY CASCADE');
    await client.query(
      `INSERT INTO settings (key, value) VALUES ('academic_year_start', $1), ('academic_year_end', $2), ('demo_data', 'true')
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [START, END]);

    const classIds = {};
    for (const [i, [name, fee]] of CLASSES.entries()) {
      const r = await client.query(
        'INSERT INTO classes (name, monthly_fee, sort_order) VALUES ($1, $2, $3) RETURNING id', [name, fee, i + 1]);
      classIds[name] = r.rows[0].id;
    }

    const students = [];
    let counter = 0;
    for (const [className, classFee] of CLASSES) {
      for (let n = 1; n <= PER_CLASS; n++) {
        counter++;
        const girl = chance(0.5);
        const surname = pick(SURNAMES);
        const concession = chance(0.15) ? pick([100, 200, 300]) : 0;
        const customFee = chance(0.07) ? classFee + pick([-200, 200, 300]) : null;
        const left = counter % 29 === 0; // a few students who have left
        const r = await client.query(
          `INSERT INTO students (roll_number, name, guardian_name, contact_number, gender, date_of_birth,
             admission_date, class_id, section, concession, custom_fee, is_active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
          [`A${String(n).padStart(3, '0')}`, `${pick(girl ? GIRLS : BOYS)} ${surname}`, `${pick(FATHERS)} ${surname}`,
           `0300 0000${String(counter).padStart(3, '0')}`, girl ? 'Female' : 'Male',
           `${2014 + (CLASSES.findIndex((c) => c[0] === className) % 4) - 0}-0${1 + (n % 9)}-1${n % 9}`,
           `2026-0${4 + (n % 3)}-0${1 + (n % 8)}`, classIds[className], n % 2 ? 'A' : 'B', concession, customFee, !left]);
        students.push({ id: r.rows[0].id, className, tuition: customFee || classFee, concession });
      }
    }

    // every student gets the 7 months of the billing period
    for (const s of students) {
      const params = [s.id];
      const rows = MONTHS.map((m, i) => { params.push(m, s.tuition); return `($1,$${i * 2 + 2},$${i * 2 + 3})`; });
      await client.query(`INSERT INTO monthly_fees (student_id, month, tuition) VALUES ${rows.join(',')}`, params);
    }

    // extra charges: stationary for the small classes in October, an exam fee for Class 5 and 6 in December
    await client.query(
      `UPDATE monthly_fees mf SET stationary = 250 FROM students s JOIN classes c ON c.id = s.class_id
       WHERE s.id = mf.student_id AND mf.month = '2026-10' AND c.name IN ('Playgroup', 'Nursery', 'Prep')`);
    await client.query(
      `UPDATE monthly_fees mf SET exam = 500 FROM students s JOIN classes c ON c.id = s.class_id
       WHERE s.id = mf.student_id AND mf.month = '2026-12' AND c.name IN ('Class 5', 'Class 6')`);

    // payments: some paid September in full, some part, some nothing; a few paid October early
    let payments = 0;
    for (const s of students) {
      const due = Math.max(0, s.tuition - s.concession);
      const roll = random();
      const clerk = pick(CLERKS);
      if (roll < 0.45) {
        await client.query(
          'INSERT INTO payments (student_id, month, amount, paid_on, received_by) VALUES ($1,$2,$3,$4,$5)',
          [s.id, '2026-09', due, day(2 + Math.floor(random() * 24)), clerk]);
        payments++;
        if (chance(0.3)) {
          await client.query(
            'INSERT INTO payments (student_id, month, amount, paid_on, received_by) VALUES ($1,$2,$3,$4,$5)',
            [s.id, '2026-10', due, day(26 + Math.floor(random() * 4)), clerk]);
          payments++;
        }
      } else if (roll < 0.65) {
        const part = Math.round((due * (0.3 + random() * 0.4)) / 50) * 50;
        await client.query(
          'INSERT INTO payments (student_id, month, amount, paid_on, received_by) VALUES ($1,$2,$3,$4,$5)',
          [s.id, '2026-09', part, day(2 + Math.floor(random() * 24)), clerk]);
        payments++;
      }
    }

    // a few admission fees, some already part paid
    const withFee = students.filter((_, i) => i % 13 === 0);
    for (const [i, s] of withFee.entries()) {
      await client.query(
        'INSERT INTO one_time_charges (student_id, name, amount, paid_amount) VALUES ($1, $2, $3, $4)',
        [s.id, 'Admission fee', 2000, i % 3 === 0 ? 2000 : i % 3 === 1 ? 1000 : 0]);
    }

    const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
    await client.query(
      `INSERT INTO users (username, password_hash) VALUES ($1, $2)
       ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash`, [DEMO_USER, hash]);

    await client.query('COMMIT');
    console.log(`Demo data ready: ${students.length} students, ${payments} payments, ${withFee.length} admission fees.`);
    console.log(`Demo login: username "${DEMO_USER}", password "${DEMO_PASSWORD}"`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Failed, nothing was saved:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();