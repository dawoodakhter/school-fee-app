// Login protection. requireLogin blocks any request that has no valid login token.
require('dotenv').config();
const jwt = require('jsonwebtoken');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET is missing or too short in your .env file (it must be at least 32 characters)');
}

function signToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '12h',
  });
}

function requireLogin(req, res, next) {
  const [type, token] = (req.headers.authorization || '').split(' ');
  if (type !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Please log in' });
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Your login has expired or is not valid. Please log in again' });
  }
}

module.exports = { requireLogin, signToken };