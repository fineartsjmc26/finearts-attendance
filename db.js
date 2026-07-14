// db.js — lightweight JSON-file data store.
// Good enough for a single department's records. No native modules,
// so it deploys anywhere without a build step.

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'data.json');

function nextId(arr) {
  return arr.length ? Math.max(...arr.map(x => x.id)) + 1 : 1;
}

// Default student field definitions. Admin can rename, hide, delete
// (except locked ones), and add new custom fields from the Manage Fields screen.
function defaultFields() {
  return [
    { key: 'name', label: 'Name', type: 'text', locked: true, visible: true },
    { key: 'year', label: 'Year', type: 'select', options: ['I Year', 'II Year', 'III Year'], locked: false, visible: true },
    { key: 'section', label: 'Section', type: 'select', options: ['A', 'B', 'C'], locked: false, visible: true },
    { key: 'dept', label: 'Department', type: 'text', locked: false, visible: true },
    { key: 'mobile', label: 'Mobile Number', type: 'text', locked: false, visible: true },
    { key: 'events', label: 'Events', type: 'multiselect', locked: false, visible: true },
    { key: 'financeType', label: 'Finance Type', type: 'select', options: ['Aided', 'Self Finance'], locked: false, visible: true }
  ];
}

// Bump this whenever a migration needs to run on old installs. Migrations
// only run once per install (tracked by data.schemaVersion), so deleting a
// field later (like Section) sticks — it won't get silently re-added.
const SCHEMA_VERSION = 2;

function defaultData() {
  return {
    schemaVersion: SCHEMA_VERSION,
    users: [
      {
        id: 1,
        name: 'Administrator',
        username: 'admin',
        // default password: admin123 (change this after first login!)
        passwordHash: bcrypt.hashSync('admin123', 10),
        role: 'Admin'
      }
    ],
    fieldDefs: defaultFields(),
    students: [], // { id, values: { <fieldKey>: value, events: [...] } }
    attendance: [] // { id, date, eventName, markedBy, updatedBy, updatedAt, marks:[{studentId, hours:{'Hour 1':'Present',...}}] }
  };
}

// Upgrade any older-shaped data.json (from earlier versions of this app)
// so existing installs don't break when the schema changes. Runs only
// once — after data.schemaVersion reaches SCHEMA_VERSION, none of this
// touches fieldDefs again, so deliberate deletions/renames always stick.
function migrate(data) {
  if (data.schemaVersion === SCHEMA_VERSION) return data;

  if (!data.fieldDefs) data.fieldDefs = defaultFields();
  if (!data.fieldDefs.some(f => f.key === 'section')) {
    // insert Section right after Year for installs upgraded from an older version
    const yearIdx = data.fieldDefs.findIndex(f => f.key === 'year');
    const sectionField = { key: 'section', label: 'Section', type: 'select', options: ['A', 'B', 'C'], locked: false, visible: true };
    if (yearIdx >= 0) data.fieldDefs.splice(yearIdx + 1, 0, sectionField);
    else data.fieldDefs.push(sectionField);
  }
  if (!Array.isArray(data.students)) data.students = [];

  data.students = data.students.map(s => {
    if (s.values) return s; // already new shape
    // old shape: { id, name, class, dept, mobile, event, financeType }
    return {
      id: s.id,
      values: {
        name: s.name || '',
        year: s.year || '',
        dept: s.dept || (s.class ? s.class : ''),
        mobile: s.mobile || '',
        events: s.event ? [s.event] : (Array.isArray(s.events) ? s.events : []),
        financeType: s.financeType || 'Aided'
      }
    };
  });

  data.attendance = data.attendance || [];
  const needsHourMigration = data.attendance.some(sess => {
    const marks = sess.marks || [];
    return marks.length && marks[0] && marks[0].hours === undefined;
  });

  if (needsHourMigration) {
    // Old shape: one session per date+time+event, marks:[{studentId,status}].
    // New shape: one session per date+event, marks:[{studentId, hours:{...}}].
    const groups = {};
    data.attendance.forEach(sess => {
      let marks = sess.marks;
      if (marks && !Array.isArray(marks)) {
        marks = Object.entries(marks).map(([studentId, status]) => ({ studentId: Number(studentId), status }));
      }
      const groupKey = sess.date + '||' + (sess.eventName || '');
      if (!groups[groupKey]) {
        groups[groupKey] = {
          id: sess.id,
          date: sess.date,
          eventName: sess.eventName || '',
          markedBy: sess.markedBy || '',
          updatedBy: sess.updatedBy || sess.markedBy || '',
          updatedAt: sess.updatedAt || new Date().toISOString(),
          marksByStudent: {}
        };
      }
      const hourLabel = sess.time || 'Hour 1';
      (marks || []).forEach(m => {
        if (!groups[groupKey].marksByStudent[m.studentId]) groups[groupKey].marksByStudent[m.studentId] = {};
        groups[groupKey].marksByStudent[m.studentId][hourLabel] = m.status;
      });
    });
    data.attendance = Object.values(groups).map(g => ({
      id: g.id,
      date: g.date,
      eventName: g.eventName,
      markedBy: g.markedBy,
      updatedBy: g.updatedBy,
      updatedAt: g.updatedAt,
      marks: Object.entries(g.marksByStudent).map(([studentId, hours]) => ({ studentId: Number(studentId), hours }))
    }));
  }

  data.schemaVersion = SCHEMA_VERSION;
  return data;
}

function load() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    save(defaultData());
  }
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  try {
    return migrate(JSON.parse(raw));
  } catch (e) {
    console.error('data.json was corrupted, resetting to defaults.', e);
    const fresh = defaultData();
    save(fresh);
    return fresh;
  }
}

function save(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

module.exports = { load, save, nextId };
