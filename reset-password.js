// reset-password.js — recover a locked-out account without knowing the
// old password. Run this directly on the server/computer where data.json
// lives (it edits that file), not through the website.
//
// Usage:
//   node reset-password.js <username> <newPassword>
//
// Example:
//   node reset-password.js admin myNewPassword123
//
// Run with no arguments to see a list of existing usernames.

const bcrypt = require('bcryptjs');
const db = require('./db');

const [, , username, newPassword] = process.argv;
const data = db.load();

if (!username || !newPassword) {
  console.log('Usage: node reset-password.js <username> <newPassword>\n');
  console.log('Existing usernames on this install:');
  data.users.forEach(u => console.log('  - ' + u.username + '  (' + u.role + ')'));
  process.exit(1);
}

const user = data.users.find(u => u.username.toLowerCase() === username.toLowerCase());
if (!user) {
  console.log('No user found with username "' + username + '".\n');
  console.log('Existing usernames on this install:');
  data.users.forEach(u => console.log('  - ' + u.username + '  (' + u.role + ')'));
  process.exit(1);
}

user.passwordHash = bcrypt.hashSync(newPassword, 10);
db.save(data);
console.log('Done. Password for "' + user.username + '" (' + user.role + ') has been reset.');
console.log('You can now log in at the website with that username and the new password.');
