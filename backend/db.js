require('dotenv').config();
const makePool = require('./makePool');

const pool = makePool(process.env.DATABASE_URL);

module.exports = pool;