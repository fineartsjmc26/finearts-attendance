require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- helpers ----------
function safeUser(u) {
  const { passwordHash, ...rest } = u;
  return rest;
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not signed in.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Session expired, please sign in again.' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Admins only.' });
  next();
}

// ---------- auth ----------
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });

  const data = db.load();
  const user = data.users.find(u => u.username.toLowerCase() === String(username).toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }
  const token = jwt.sign(
    { id: user.id, name: user.name, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
  res.json({ token, user: safeUser(user) });
});

app.get('/api/me', authRequired, (req, res) => {
  res.json({ user: req.user });
});

// Any signed-in user can update their own name/username/password —
// unlike /api/users/:id below, this does not require Admin.
app.put('/api/me', authRequired, (req, res) => {
  const { name, username, password, currentPassword } = req.body || {};
  const data = db.load();
  const idx = data.users.findIndex(u => u.id === req.user.id);
  if (idx === -1) return res.status(404).json({ error: 'Account not found.' });
  const existing = data.users[idx];

  if (password) {
    if (!currentPassword || !bcrypt.compareSync(currentPassword, existing.passwordHash)) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }
  }
  if (username) {
    const dupe = data.users.find(u => u.username.toLowerCase() === String(username).toLowerCase() && u.id !== existing.id);
    if (dupe) return res.status(409).json({ error: 'That username is already taken.' });
  }

  data.users[idx] = {
    ...existing,
    name: name !== undefined && String(name).trim() ? String(name).trim() : existing.name,
    username: username !== undefined && String(username).trim() ? String(username).trim() : existing.username,
    passwordHash: password ? bcrypt.hashSync(password, 10) : existing.passwordHash
  };
  db.save(data);

  const updated = data.users[idx];
  const token = jwt.sign(
    { id: updated.id, name: updated.name, username: updated.username, role: updated.role },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
  res.json({ token, user: safeUser(updated) });
});

// Any signed-in user (Admin, Staff, or Student Incharge) can change their
// own username and/or password here — no admin needed.
app.put('/api/account', authRequired, (req, res) => {
  const { username, password, name } = req.body || {};
  const data = db.load();
  const idx = data.users.findIndex(u => u.id === req.user.id);
  if (idx === -1) return res.status(404).json({ error: 'Account not found.' });

  if (username) {
    const dupe = data.users.find(u => u.username.toLowerCase() === String(username).toLowerCase() && u.id !== req.user.id);
    if (dupe) return res.status(409).json({ error: 'That username is already taken.' });
  }

  const existing = data.users[idx];
  data.users[idx] = {
    ...existing,
    name: name !== undefined && String(name).trim() ? String(name).trim() : existing.name,
    username: username !== undefined && String(username).trim() ? String(username).trim() : existing.username,
    passwordHash: password ? bcrypt.hashSync(password, 10) : existing.passwordHash
  };
  db.save(data);

  const updated = data.users[idx];
  const token = jwt.sign(
    { id: updated.id, name: updated.name, username: updated.username, role: updated.role },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
  res.json({ token, user: safeUser(updated) });
});

// ---------- field definitions (student record schema) ----------
app.get('/api/fields', authRequired, (req, res) => {
  const data = db.load();
  res.json(data.fieldDefs);
});

app.post('/api/fields', authRequired, adminOnly, (req, res) => {
  const { label, type, options } = req.body || {};
  if (!label || !String(label).trim()) return res.status(400).json({ error: 'A field label is required.' });
  const allowedTypes = ['text', 'select', 'multiselect'];
  const fieldType = allowedTypes.includes(type) ? type : 'text';

  const data = db.load();
  const key = String(label).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') + '_' + Date.now().toString(36);
  const field = {
    key,
    label: String(label).trim(),
    type: fieldType,
    options: fieldType === 'select' && Array.isArray(options) ? options.filter(Boolean) : undefined,
    locked: false,
    visible: true
  };
  data.fieldDefs.push(field);
  db.save(data);
  res.status(201).json(field);
});

app.put('/api/fields/:key', authRequired, adminOnly, (req, res) => {
  const key = req.params.key;
  const data = db.load();
  const idx = data.fieldDefs.findIndex(f => f.key === key);
  if (idx === -1) return res.status(404).json({ error: 'Field not found.' });

  const { label, visible, options } = req.body || {};
  const existing = data.fieldDefs[idx];
  data.fieldDefs[idx] = {
    ...existing,
    label: label !== undefined && String(label).trim() ? String(label).trim() : existing.label,
    visible: visible !== undefined ? Boolean(visible) : existing.visible,
    options: Array.isArray(options) ? options.filter(Boolean) : existing.options
  };
  db.save(data);
  res.json(data.fieldDefs[idx]);
});

app.delete('/api/fields/:key', authRequired, adminOnly, (req, res) => {
  const key = req.params.key;
  const data = db.load();
  const field = data.fieldDefs.find(f => f.key === key);
  if (!field) return res.status(404).json({ error: 'Field not found.' });
  if (field.locked) return res.status(400).json({ error: 'This field is required and cannot be removed.' });

  data.fieldDefs = data.fieldDefs.filter(f => f.key !== key);
  data.students.forEach(s => { if (s.values) delete s.values[key]; });
  db.save(data);
  res.json({ ok: true });
});

// ---------- students (Admin, Staff, Student Incharge) ----------
app.get('/api/students', authRequired, (req, res) => {
  const data = db.load();
  res.json(data.students);
});

function validateStudentValues(values, fieldDefs) {
  if (!values || typeof values !== 'object') return 'Student details are required.';
  const nameField = fieldDefs.find(f => f.key === 'name');
  if (nameField && (!values.name || !String(values.name).trim())) return 'Name is required.';
  return null;
}

app.post('/api/students', authRequired, (req, res) => {
  const { values } = req.body || {};
  const data = db.load();
  const err = validateStudentValues(values, data.fieldDefs);
  if (err) return res.status(400).json({ error: err });

  const cleanValues = { ...values };
  if (cleanValues.events && !Array.isArray(cleanValues.events)) cleanValues.events = [cleanValues.events].filter(Boolean);

  const student = { id: db.nextId(data.students), values: cleanValues };
  data.students.push(student);
  db.save(data);
  res.status(201).json(student);
});

app.put('/api/students/:id', authRequired, (req, res) => {
  const id = Number(req.params.id);
  const data = db.load();
  const idx = data.students.findIndex(s => s.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Student not found.' });

  const { values } = req.body || {};
  if (values) {
    const err = validateStudentValues({ ...data.students[idx].values, ...values }, data.fieldDefs);
    if (err) return res.status(400).json({ error: err });
  }

  const cleanValues = { ...(values || {}) };
  if (cleanValues.events && !Array.isArray(cleanValues.events)) cleanValues.events = [cleanValues.events].filter(Boolean);

  data.students[idx] = {
    ...data.students[idx],
    values: { ...data.students[idx].values, ...cleanValues }
  };
  db.save(data);
  res.json(data.students[idx]);
});

app.delete('/api/students/:id', authRequired, (req, res) => {
  const id = Number(req.params.id);
  const data = db.load();
  const before = data.students.length;
  data.students = data.students.filter(s => s.id !== id);
  if (data.students.length === before) return res.status(404).json({ error: 'Student not found.' });

  data.attendance.forEach(sess => {
    sess.marks = (sess.marks || []).filter(m => m.studentId !== id);
  });
  db.save(data);
  res.json({ ok: true });
});

// ---------- users (Admin only) ----------
app.get('/api/users', authRequired, adminOnly, (req, res) => {
  const data = db.load();
  res.json(data.users.map(safeUser));
});

app.post('/api/users', authRequired, adminOnly, (req, res) => {
  const { name, username, password, role } = req.body || {};
  if (!name || !username || !password || !role) {
    return res.status(400).json({ error: 'Name, username, password and role are all required.' });
  }
  if (!['Admin', 'Staff', 'Student Incharge'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role.' });
  }
  const data = db.load();
  if (data.users.some(u => u.username.toLowerCase() === String(username).toLowerCase())) {
    return res.status(409).json({ error: 'That username is already taken.' });
  }
  const user = {
    id: db.nextId(data.users),
    name,
    username,
    passwordHash: bcrypt.hashSync(password, 10),
    role
  };
  data.users.push(user);
  db.save(data);
  res.status(201).json(safeUser(user));
});

app.put('/api/users/:id', authRequired, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const data = db.load();
  const idx = data.users.findIndex(u => u.id === id);
  if (idx === -1) return res.status(404).json({ error: 'User not found.' });

  const { name, username, password, role } = req.body || {};
  if (role && !['Admin', 'Staff', 'Student Incharge'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role.' });
  }
  if (username) {
    const dupe = data.users.find(u => u.username.toLowerCase() === String(username).toLowerCase() && u.id !== id);
    if (dupe) return res.status(409).json({ error: 'That username is already taken.' });
  }

  const existing = data.users[idx];
  data.users[idx] = {
    ...existing,
    name: name !== undefined ? name : existing.name,
    username: username !== undefined ? username : existing.username,
    role: role !== undefined ? role : existing.role,
    passwordHash: password ? bcrypt.hashSync(password, 10) : existing.passwordHash
  };
  db.save(data);
  res.json(safeUser(data.users[idx]));
});

app.delete('/api/users/:id', authRequired, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: "You can't delete your own account while signed in." });
  const data = db.load();
  const before = data.users.length;
  data.users = data.users.filter(u => u.id !== id);
  if (data.users.length === before) return res.status(404).json({ error: 'User not found.' });
  db.save(data);
  res.json({ ok: true });
});

// ---------- attendance (Admin, Staff, Student Incharge) ----------
// One session per date + event. Each student's mark is a set of hour ->
// Present/Absent statuses, so a single session covers Hour 1 through
// Hour 5 (or however many hours the frontend sends) at once. Any of the
// three roles can create, edit (including past dates), or delete a
// session, and the change is immediately visible to the other two —
// there's one shared record, not separate copies per role.
app.get('/api/attendance', authRequired, (req, res) => {
  const data = db.load();
  res.json(data.attendance);
});

app.post('/api/attendance', authRequired, (req, res) => {
  const { id, date, eventName, marks } = req.body || {};
  if (!date || !Array.isArray(marks)) {
    return res.status(400).json({ error: 'date and marks[] are required.' });
  }
  const data = db.load();
  const cleanMarks = marks.map(m => {
    const hours = {};
    if (m.hours && typeof m.hours === 'object') {
      Object.entries(m.hours).forEach(([hourLabel, status]) => {
        hours[hourLabel] = status === 'Present' ? 'Present' : 'Absent';
      });
    }
    return { studentId: Number(m.studentId), hours };
  });

  let idx = -1;
  if (id) {
    idx = data.attendance.findIndex(s => s.id === Number(id));
  }
  if (idx === -1) {
    idx = data.attendance.findIndex(s => s.date === date && (s.eventName || '') === (eventName || ''));
  }

  const now = new Date().toISOString();
  const session = {
    id: idx >= 0 ? data.attendance[idx].id : db.nextId(data.attendance),
    date,
    eventName: eventName || '',
    markedBy: idx >= 0 ? data.attendance[idx].markedBy : req.user.name,
    updatedBy: req.user.name,
    updatedAt: now,
    marks: cleanMarks
  };
  if (idx >= 0) data.attendance[idx] = session;
  else data.attendance.push(session);
  db.save(data);
  res.status(201).json(session);
});

app.delete('/api/attendance/:id', authRequired, (req, res) => {
  const id = Number(req.params.id);
  const data = db.load();
  const before = data.attendance.length;
  data.attendance = data.attendance.filter(s => s.id !== id);
  if (data.attendance.length === before) return res.status(404).json({ error: 'Session not found.' });
  db.save(data);
  res.json({ ok: true });
});

// fallback to the frontend for any non-API route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Fine Arts Attendance server running on http://localhost:${PORT}`);
});
