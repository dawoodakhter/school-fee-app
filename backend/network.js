// Finds this computer's addresses on the local network (like 192.168.1.5),
// so other computers in the office know what to type.
const os = require('os');

function lanAddresses() {
  const found = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const item of list || []) {
      const isIPv4 = item.family === 'IPv4' || item.family === 4;
      if (isIPv4 && !item.internal && !item.address.startsWith('169.254.')) found.push(item.address);
    }
  }
  return found;
}

module.exports = { lanAddresses };