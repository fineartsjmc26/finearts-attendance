const API = '/api';

// Class-period slots used for marking attendance. Edit this list if your
// department needs more or fewer periods per day.
const HOUR_SLOTS = ['Hour 1', 'Hour 2', 'Hour 3', 'Hour 4', 'Hour 5'];


let state = {
  token: localStorage.getItem('fa_token') || null,
  currentUser: JSON.parse(localStorage.getItem('fa_user') || 'null'),
  fields: [],
  students: [],
  users: [],
  attendance: [],
  page: 'dashboard',
  editingStudent: null,   // { id?, values:{} }
  editingUser: null,
  editingField: null,     // key being renamed inline, or null
  editingFieldOptions: null, // key whose dropdown options are being edited, or null
  addingField: false,
  attendanceDraft: null,  // { id?, date, time, eventName, marks:{studentId:status} }
  viewingSession: null,
  loading: false,
  _studentSearch: '',
  _studentYearFilter: '',
  _studentSectionFilter: '',
  _studentFinanceFilter: '',
  _attYearFilter: '',
  _attSectionFilter: '',
  _attFinanceFilter: '',
  _eventTagDraft: ''
};

function esc(str){
  return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function showToast(msg, isError){
  let t = document.getElementById('toast');
  if (!t){ t = document.createElement('div'); t.id='toast'; t.className='toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.style.background = isError ? '#a94a35' : '#2B2420';
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(()=> t.classList.remove('show'), 2600);
}

// ---------- API helper ----------
async function api(path, options={}){
  const headers = { 'Content-Type': 'application/json', ...(options.headers||{}) };
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  let res;
  try {
    res = await fetch(API + path, { ...options, headers });
  } catch(e){
    showToast('Could not reach the server. Check your connection.', true);
    throw e;
  }
  let body = null;
  try { body = await res.json(); } catch(e){ /* no body */ }
  if (!res.ok){
    if (res.status === 401){ logout(); }
    const msg = (body && body.error) || 'Something went wrong (' + res.status + ').';
    showToast(msg, true);
    throw new Error(msg);
  }
  return body;
}

function logout(){
  state.token = null;
  state.currentUser = null;
  localStorage.removeItem('fa_token');
  localStorage.removeItem('fa_user');
  render();
}

// ---------- data loading ----------
async function loadAll(){
  state.loading = true; render();
  try {
    const [fields, students, attendance] = await Promise.all([
      api('/fields'), api('/students'), api('/attendance')
    ]);
    state.fields = fields;
    state.students = students;
    state.attendance = attendance;
    if (state.currentUser.role === 'Admin'){
      state.users = await api('/users');
    }
  } finally {
    state.loading = false;
    render();
  }
}

function visibleFields(){ return state.fields.filter(f => f.visible !== false); }
function fieldByKey(key){ return state.fields.find(f => f.key === key); }
function val(student, key){ return (student.values || {})[key]; }
function yearOptions(){
  const yf = fieldByKey('year');
  return yf && yf.options ? yf.options : [];
}
function allEventTags(){
  const set = new Set();
  state.students.forEach(s => (val(s,'events')||[]).forEach(e => set.add(e)));
  return [...set].sort();
}

/* ================= RENDER ================= */
function render(){
  const app = document.getElementById('app');
  if (!state.currentUser || !state.token){
    app.innerHTML = renderLogin();
    attachLoginEvents();
    return;
  }
  app.innerHTML = renderShell();
  attachShellEvents();
}

function renderLogin(){
  return `
  <div class="login-wrap">
    <div class="login-card">
      <div class="brand-mark">FA</div>
      <h1 class="display">Fine Arts Register</h1>
      <div class="sub">Attendance &amp; student records portal</div>
      <div class="login-error" id="loginError"></div>
      <div class="field"><label>Username</label><input id="loginUser" type="text" autocomplete="username"></div>
      <div class="field"><label>Password</label><input id="loginPass" type="password" autocomplete="current-password"></div>
      <button class="btn btn-primary" id="loginBtn">Sign in</button>
      <div class="login-hint">Default admin login: <b>admin</b> / <b>admin123</b><br>
      Change this password after your first sign-in. Admin can create Staff and Student Incharge accounts from the Users tab.</div>
    </div>
  </div>`;
}

function attachLoginEvents(){
  const btn = document.getElementById('loginBtn');
  const doLogin = async () => {
    const username = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPass').value;
    const err = document.getElementById('loginError');
    err.style.display = 'none';
    try {
      const res = await fetch(API + '/login', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ username, password })
      });
      const body = await res.json();
      if (!res.ok){ err.textContent = body.error || 'Sign in failed.'; err.style.display='block'; return; }
      state.token = body.token;
      state.currentUser = body.user;
      localStorage.setItem('fa_token', state.token);
      localStorage.setItem('fa_user', JSON.stringify(state.currentUser));
      state.page = 'dashboard';
      render();
      loadAll();
    } catch(e){
      err.textContent = 'Could not reach the server.'; err.style.display='block';
    }
  };
  btn.addEventListener('click', doLogin);
  ['loginUser','loginPass'].forEach(id=>{
    document.getElementById(id).addEventListener('keydown', e => { if (e.key==='Enter') doLogin(); });
  });
}

function navItems(){
  const items = [
    {id:'dashboard', label:'Dashboard', icon:'◈'},
    {id:'attendance', label:'Mark Attendance', icon:'✎'},
    {id:'records', label:'Attendance Records', icon:'▤'},
    {id:'students', label:'Students', icon:'☺'},
  ];
  if (state.currentUser.role === 'Admin'){
    items.push({id:'users', label:'Staff & Users', icon:'⚿'});
    items.push({id:'fields', label:'Manage Fields', icon:'⚙'});
  }
  items.push({id:'account', label:'My Account', icon:'●'});
  return items;
}

function renderShell(){
  const items = navItems();
  return `
  <div class="sidebar">
    <div class="side-brand">
      <div class="mark display">Fine Arts</div>
      <div class="tag">Attendance Register</div>
    </div>
    <div>
      ${items.map(i => `<div class="nav-item ${state.page===i.id?'active':''}" data-nav="${i.id}">
        <span class="nav-icon">${i.icon}</span><span>${i.label}</span></div>`).join('')}
    </div>
    <div class="side-footer">
      <div class="side-user">${esc(state.currentUser.name)}</div>
      <div class="side-role">${esc(state.currentUser.role)}</div>
      <button class="logout-btn" id="myAccountBtn" style="margin-bottom:6px;">My Account</button>
      <button class="logout-btn" id="logoutBtn">Sign out</button>
    </div>
  </div>
  <div class="main">
    ${state.loading ? `<div class="loading-msg">Loading…</div>` : renderPage()}
  </div>
  ${renderModals()}
  `;
}

function renderPage(){
  switch(state.page){
    case 'dashboard': return renderDashboard();
    case 'attendance': return renderMarkAttendance();
    case 'records': return renderRecords();
    case 'students': return renderStudents();
    case 'users': return state.currentUser.role==='Admin' ? renderUsers() : renderDashboard();
    case 'fields': return state.currentUser.role==='Admin' ? renderFields() : renderDashboard();
    case 'account': return renderAccount();
    default: return renderDashboard();
  }
}

/* ---------------- CATEGORY TABS (shared component) ---------------- */
function renderCategoryTabs(fieldKey, activeVal, dataAttr){
  const field = fieldByKey(fieldKey);
  if (!field || field.visible === false) return '';
  const options = field.options || [];
  if (!options.length) return '';
  const tabs = ['', ...options];
  return `<div class="year-tabs">
    <span class="tab-group-label">${esc(field.label)}</span>
    ${tabs.map(o => `<button class="year-tab ${activeVal===o?'active':''}" data-${dataAttr}="${esc(o)}">${o===''?'All':esc(o)}</button>`).join('')}
  </div>`;
}
function renderYearTabs(activeVal, dataAttr){ return renderCategoryTabs('year', activeVal, dataAttr); }

/* ---------------- DASHBOARD ---------------- */
function renderDashboard(){
  const totalStudents = state.students.length;
  const years = yearOptions();
  const yearCounts = years.map(y => ({ y, n: state.students.filter(s=>val(s,'year')===y).length }));
  const events = allEventTags().length;
  const recent = [...state.attendance].sort((a,b)=> b.date.localeCompare(a.date)).slice(0,6);

  return `
  <div class="page-head">
    <div><h2 class="display">Welcome, ${esc(state.currentUser.name.split(' ')[0])}</h2>
    <div class="desc">Overview of the Fine Arts department register</div></div>
  </div>
  <div class="stat-row">
    <div class="stat-card"><div class="num">${totalStudents}</div><div class="lbl">Students</div></div>
    ${yearCounts.map(yc=>`<div class="stat-card"><div class="num">${yc.n}</div><div class="lbl">${esc(yc.y)}</div></div>`).join('')}
    <div class="stat-card"><div class="num">${events}</div><div class="lbl">Events tracked</div></div>
  </div>
  <div class="card">
    <h3 style="margin-top:0;font-size:16px;">Recent attendance sessions</h3>
    ${recent.length===0 ? `<div class="empty"><div class="glyph">▤</div>No attendance marked yet.</div>` : `
    <div class="table-scroll"><table>
      <thead><tr><th>Date</th><th>Event</th><th>Present marks</th><th>Absent marks</th><th>Marked by</th></tr></thead>
      <tbody>
        ${recent.map(s => {
          const { present, absent } = sessionCounts(s);
          return `<tr class="session-row" data-view-session="${s.id}">
            <td>${esc(s.date)}</td><td>${esc(s.eventName||'—')}</td>
            <td><span class="pill pill-present">${present}</span></td>
            <td><span class="pill pill-absent">${absent}</span></td>
            <td>${esc(s.markedBy||'—')}</td></tr>`;
        }).join('')}
      </tbody>
    </table></div>`}
  </div>`;
}

/* ---------------- STUDENTS ---------------- */
function financePillOf(f){
  if (f === 'Self Finance') return `<span class="pill pill-self">Self Finance</span>`;
  if (f === 'Aided') return `<span class="pill pill-aided">Aided</span>`;
  return f ? esc(f) : '—';
}

function renderFieldCell(field, student){
  const v = val(student, field.key);
  if (field.key === 'financeType') return financePillOf(v);
  if (field.type === 'multiselect'){
    const arr = Array.isArray(v) ? v : [];
    if (!arr.length) return '—';
    return arr.map(e=>`<span class="pill pill-dept" style="margin:1px;">${esc(e)}</span>`).join(' ');
  }
  if (field.key === 'dept' && v) return `<span class="pill pill-dept">${esc(v)}</span>`;
  return v ? esc(v) : '—';
}

function renderStudents(){
  const q = (state._studentSearch||'').toLowerCase();
  const yearF = state._studentYearFilter || '';
  const sectionF = state._studentSectionFilter || '';
  const financeF = state._studentFinanceFilter || '';
  const cols = visibleFields();
  const filtered = state.students.filter(s=>{
    const values = s.values || {};
    const matchQ = !q || Object.values(values).some(v => Array.isArray(v) ? v.join(' ').toLowerCase().includes(q) : String(v||'').toLowerCase().includes(q));
    const matchY = !yearF || values.year === yearF;
    const matchS = !sectionF || values.section === sectionF;
    const matchF = !financeF || values.financeType === financeF;
    return matchQ && matchY && matchS && matchF;
  });
  return `
  <div class="page-head">
    <div><h2 class="display">Students</h2><div class="desc">${state.students.length} students on record</div></div>
    <button class="btn-add" id="addStudentBtn">+ Add student</button>
  </div>
  ${renderCategoryTabs('year', yearF, 'student-year')}
  ${renderCategoryTabs('section', sectionF, 'student-section')}
  ${renderCategoryTabs('financeType', financeF, 'student-finance')}
  <div class="card">
    <div class="toolbar">
      <input class="search-input" id="studentSearch" placeholder="Search across all fields…" value="${esc(state._studentSearch||'')}">
    </div>
    ${filtered.length===0 ? `<div class="empty"><div class="glyph">☺</div>No students match yet.</div>` : `
    <div class="table-scroll"><table>
      <thead><tr>${cols.map(f=>`<th>${esc(f.label)}</th>`).join('')}<th></th></tr></thead>
      <tbody>
        ${filtered.map(s=>`
          <tr>
            ${cols.map(f=>`<td>${f.key==='name'?`<b>${renderFieldCell(f,s)}</b>`:renderFieldCell(f,s)}</td>`).join('')}
            <td style="text-align:right;white-space:nowrap;">
              <button class="btn-sm" data-edit-student="${s.id}">Edit</button>
              <button class="btn-sm danger" data-del-student="${s.id}">Delete</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table></div>`}
  </div>`;
}

/* ---------------- MY ACCOUNT (self-service) ---------------- */
function renderAccount(){
  return `
  <div class="page-head">
    <div><h2 class="display">My Account</h2><div class="desc">Update your own name, username, or password</div></div>
  </div>
  <div class="card" style="max-width:460px;">
    <div class="modal-error" id="accountError"></div>
    <div class="field"><label>Full name</label><input id="acc_name" value="${esc(state.currentUser.name)}"></div>
    <div class="field"><label>Username</label><input id="acc_username" value="${esc(state.currentUser.username)}"></div>
    <div class="field"><label>Role</label><input value="${esc(state.currentUser.role)}" disabled style="opacity:.6;"></div>
    <hr style="border:none;border-top:1px solid var(--border);margin:20px 0;">
    <div class="small-note" style="margin-bottom:10px;">Leave the password fields blank if you only want to change your name or username.</div>
    <div class="field"><label>Current password</label><input id="acc_current_password" type="password" placeholder="Required only to set a new password"></div>
    <div class="field"><label>New password</label><input id="acc_new_password" type="password" placeholder="Leave blank to keep current password"></div>
    <button class="btn btn-primary" id="saveAccountBtn" style="width:auto;">Save changes</button>
  </div>`;
}

/* ---------------- MANAGE FIELDS (admin) ---------------- */
function renderFields(){
  return `
  <div class="page-head">
    <div><h2 class="display">Manage Fields</h2><div class="desc">Add, rename, hide, remove fields, or edit dropdown options (like Section or Year)</div></div>
    <button class="btn-add" id="addFieldBtn">+ Add field</button>
  </div>
  <div class="card">
    <table>
      <thead><tr><th>Label</th><th>Type</th><th>Visible</th><th></th></tr></thead>
      <tbody>
        ${state.fields.map(f => {
          if (f.key === state.editingField){
            return `<tr><td colspan="4">
              <div class="inline-edit-row">
                <input id="renameFieldInput" value="${esc(f.label)}" placeholder="Field label">
                <button class="btn-sm" id="saveFieldRename">Save</button>
                <button class="btn-sm btn-ghost" id="cancelFieldRename">Cancel</button>
              </div>
            </td></tr>`;
          }
          if (f.key === state.editingFieldOptions){
            return `<tr><td colspan="4">
              <div class="inline-edit-row">
                <input id="optionsFieldInput" value="${esc((f.options||[]).join(', '))}" placeholder="e.g. A, B, C, D">
                <button class="btn-sm" id="saveFieldOptions">Save</button>
                <button class="btn-sm btn-ghost" id="cancelFieldOptions">Cancel</button>
              </div>
              <div class="small-note" style="margin-top:6px;">Comma-separated. This becomes the list of categorize buttons and dropdown choices for ${esc(f.label)}.</div>
            </td></tr>`;
          }
          return `<tr>
            <td><b>${esc(f.label)}</b>${f.locked?' <span class="small-note">(required)</span>':''}</td>
            <td><span class="pill pill-role">${esc(f.type)}</span></td>
            <td>${f.visible!==false ? '<span class="pill pill-present">Visible</span>' : '<span class="pill pill-absent">Hidden</span>'}</td>
            <td style="text-align:right;white-space:nowrap;">
              <button class="btn-sm" data-rename-field="${f.key}">Rename</button>
              ${f.type==='select' ? `<button class="btn-sm" data-edit-options="${f.key}">Edit options</button>` : ''}
              <button class="btn-sm" data-toggle-field="${f.key}">${f.visible!==false?'Hide':'Show'}</button>
              ${!f.locked ? `<button class="btn-sm danger" data-del-field="${f.key}">Delete</button>` : ''}
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    <div class="small-note" style="margin-top:14px;">Hidden fields keep their data but disappear from forms and tables. Deleting a field removes its data from every student permanently.</div>
  </div>`;
}

/* ---------------- USERS ---------------- */
function renderUsers(){
  return `
  <div class="page-head">
    <div><h2 class="display">Staff &amp; Users</h2><div class="desc">Manage who can sign in to the register</div></div>
    <button class="btn-add" id="addUserBtn">+ Add user</button>
  </div>
  <div class="card">
    <div class="table-scroll"><table>
      <thead><tr><th>Name</th><th>Username</th><th>Role</th><th></th></tr></thead>
      <tbody>
        ${state.users.map(u=>`
          <tr>
            <td><b>${esc(u.name)}</b></td>
            <td>${esc(u.username)}</td>
            <td><span class="pill pill-role">${esc(u.role)}</span></td>
            <td style="text-align:right;white-space:nowrap;">
              <button class="btn-sm" data-edit-user="${u.id}">Edit</button>
              ${u.id!==state.currentUser.id ? `<button class="btn-sm danger" data-del-user="${u.id}">Delete</button>` : `<span class="small-note">(you)</span>`}
            </td>
          </tr>`).join('')}
      </tbody>
    </table></div>
  </div>`;
}

/* ---------------- MARK ATTENDANCE ---------------- */
function ensureDraft(){
  if (!state.attendanceDraft){
    state.attendanceDraft = { date: new Date().toISOString().slice(0,10), eventName: '', marks: {} };
    // marks: { studentId: { 'Hour 1': 'Present'|'Absent', ... } }
  }
}

function getHourStatus(studentId, hour){
  const rec = state.attendanceDraft.marks[studentId];
  return (rec && rec[hour]) || 'Absent';
}

function toggleHourStatus(studentId, hour){
  ensureDraft();
  if (!state.attendanceDraft.marks[studentId]) state.attendanceDraft.marks[studentId] = {};
  const cur = state.attendanceDraft.marks[studentId][hour] || 'Absent';
  state.attendanceDraft.marks[studentId][hour] = cur === 'Present' ? 'Absent' : 'Present';
}

function setFullDay(studentId, status){
  ensureDraft();
  const rec = {};
  HOUR_SLOTS.forEach(h => rec[h] = status);
  state.attendanceDraft.marks[studentId] = rec;
}

function renderEventTabs(activeVal, dataAttr){
  const events = allEventTags();
  if (!events.length) return '';
  const tabs = ['', ...events];
  return `<div class="year-tabs">
    <span class="tab-group-label">Event</span>
    ${tabs.map(o => `<button class="year-tab ${activeVal===o?'active':''}" data-${dataAttr}="${esc(o)}">${o===''?'All':esc(o)}</button>`).join('')}
  </div>`;
}

function renderMarkAttendance(){
  ensureDraft();
  const draft = state.attendanceDraft;
  const eventF = draft.eventName;
  const yearF = state._attYearFilter || '';
  const sectionF = state._attSectionFilter || '';
  const pool = state.students.filter(s => {
    const matchEvent = !eventF || (val(s,'events')||[]).includes(eventF);
    const matchYear = !yearF || val(s,'year')===yearF;
    const matchSection = !sectionF || val(s,'section')===sectionF;
    return matchEvent && matchYear && matchSection;
  });

  return `
  <div class="page-head">
    <div><h2 class="display">${draft.id ? 'Edit Attendance Session' : 'Mark Attendance'}</h2>
    <div class="desc">Tap P or A for each hour, or use "Full day P" to mark all hours present at once. Use the tabs below to quickly narrow the list.</div></div>
    ${draft.id ? `<button class="btn-sm" id="cancelEditSession">Cancel edit / start new session</button>` : ''}
  </div>
  <div class="card">
    <div class="toolbar">
      <div><label>Date</label><input type="date" id="attDate" value="${esc(draft.date)}"></div>
      <div style="align-self:flex-end;">
        <button class="btn-sm" id="markAllPresent">Mark all, all hours present</button>
        <button class="btn-sm" id="markAllAbsent">Mark all, all hours absent</button>
      </div>
    </div>
    ${renderCategoryTabs('year', yearF, 'att-year')}
    ${renderCategoryTabs('section', sectionF, 'att-section')}
    ${renderEventTabs(eventF, 'att-event')}
    ${pool.length===0 ? `<div class="empty"><div class="glyph">✎</div>No students to mark yet with these filters.</div>` : `
    <div class="table-scroll"><table>
      <thead><tr><th>Name</th><th>Year</th><th>Dept</th>${HOUR_SLOTS.map(h=>`<th>${esc(h)}</th>`).join('')}<th>Full day</th></tr></thead>
      <tbody>
        ${pool.map(s=>{
          return `<tr>
            <td><b>${esc(val(s,'name'))}</b></td><td>${esc(val(s,'year')||'—')}</td><td>${esc(val(s,'dept')||'—')}</td>
            ${HOUR_SLOTS.map(h=>{
              const status = getHourStatus(s.id, h);
              return `<td><span class="hour-toggle ${status==='Present'?'present':'absent'}" data-toggle-hour="${s.id}::${esc(h)}" title="${esc(h)}">${status==='Present'?'P':'A'}</span></td>`;
            }).join('')}
            <td><button class="btn-sm" data-full-day="${s.id}">Full day P</button></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>
    <div style="margin-top:20px;display:flex;justify-content:flex-end;gap:10px;">
      <button class="btn btn-primary" id="saveAttendanceBtn" style="width:auto;">${draft.id ? 'Update this session' : 'Save attendance session'}</button>
    </div>`}
  </div>`;
}

/* ---------------- RECORDS ---------------- */
function sessionCounts(s){
  let present = 0, absent = 0;
  (s.marks||[]).forEach(m => {
    Object.values(m.hours||{}).forEach(v => { if (v==='Present') present++; else absent++; });
  });
  return { present, absent };
}

function renderRecords(){
  if (state.viewingSession){
    const s = state.attendance.find(x=>x.id===state.viewingSession);
    if (s) return renderSessionDetail(s);
  }
  const sorted = [...state.attendance].sort((a,b)=> b.date.localeCompare(a.date));
  return `
  <div class="page-head">
    <div><h2 class="display">Attendance Records</h2><div class="desc">All saved sessions — visible to admin, staff and student incharge, and stays in sync no matter who edits it</div></div>
  </div>
  <div class="card">
    ${sorted.length===0 ? `<div class="empty"><div class="glyph">▤</div>No sessions recorded yet.</div>` : `
    <div class="table-scroll"><table>
      <thead><tr><th>Date</th><th>Event</th><th>Present marks</th><th>Absent marks</th><th>Marked by</th><th>Last updated</th><th></th></tr></thead>
      <tbody>
        ${sorted.map(s=>{
          const {present, absent} = sessionCounts(s);
          return `<tr class="session-row" data-view-session="${s.id}">
            <td>${esc(s.date)}</td><td>${esc(s.eventName||'All students')}</td>
            <td><span class="pill pill-present">${present}</span></td>
            <td><span class="pill pill-absent">${absent}</span></td>
            <td>${esc(s.markedBy||'—')}</td>
            <td>${esc(s.updatedBy||s.markedBy||'—')}</td>
            <td style="text-align:right;white-space:nowrap;">
              <button class="btn-sm" data-edit-session="${s.id}">Edit</button>
              <button class="btn-sm danger" data-del-session="${s.id}">Delete</button>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>`}
  </div>`;
}

function renderSessionDetail(s){
  const rows = (s.marks||[]).map(m=>{
    const st = state.students.find(x=>x.id===m.studentId);
    return {name: st?val(st,'name'):'(removed student)', year: st?val(st,'year'):'—', dept: st?val(st,'dept'):'—', hours: m.hours||{}};
  });
  return `
  <div class="page-head">
    <div><h2 class="display">${esc(s.date)}</h2><div class="desc">${esc(s.eventName||'All students')} — marked by ${esc(s.markedBy||'—')}${s.updatedBy && s.updatedBy!==s.markedBy ? `, last updated by ${esc(s.updatedBy)}`:''}</div></div>
    <div>
      <button class="btn-sm" id="editFromDetail" data-edit-session="${s.id}">Edit this session</button>
      <button class="btn-sm" id="backToRecords">← Back to records</button>
    </div>
  </div>
  <div class="card">
    <div class="table-scroll"><table>
      <thead><tr><th>Name</th><th>Year</th><th>Dept</th>${HOUR_SLOTS.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>
        ${rows.map(r=>`<tr><td><b>${esc(r.name)}</b></td><td>${esc(r.year||'—')}</td><td>${esc(r.dept||'—')}</td>
          ${HOUR_SLOTS.map(h=>{
            const st = r.hours[h] || '—';
            const cls = st==='Present' ? 'pill-present' : (st==='Absent' ? 'pill-absent' : '');
            return `<td>${st==='—' ? '—' : `<span class="pill ${cls}">${st==='Present'?'P':'A'}</span>`}</td>`;
          }).join('')}
        </tr>`).join('')}
      </tbody>
    </table></div>
  </div>`;
}

/* ---------------- MODALS ---------------- */
function renderStudentFormFields(){
  const cols = visibleFields();
  return cols.map(f => {
    const current = state.editingStudent?.values?.[f.key];
    if (f.type === 'select'){
      const opts = f.options || [];
      return `<div class="field"><label>${esc(f.label)}</label>
        <select id="sf_${esc(f.key)}">
          <option value="">— Select —</option>
          ${opts.map(o=>`<option value="${esc(o)}" ${current===o?'selected':''}>${esc(o)}</option>`).join('')}
        </select></div>`;
    }
    if (f.type === 'multiselect'){
      const arr = Array.isArray(current) ? current : [];
      return `<div class="field">
        <label>${esc(f.label)}</label>
        <div class="tag-input-wrap" id="sf_${esc(f.key)}_wrap" data-field-key="${esc(f.key)}">
          <div class="tag-chips">
            ${arr.map((v,i)=>`<span class="tag-chip">${esc(v)}<span class="tag-x" data-remove-tag="${esc(f.key)}:${i}">×</span></span>`).join('')}
          </div>
          <input type="text" class="tag-add-input" data-tag-field="${esc(f.key)}" placeholder="Type an event and press Enter">
        </div>
      </div>`;
    }
    return `<div class="field"><label>${esc(f.label)}</label><input id="sf_${esc(f.key)}" value="${esc(current||'')}"></div>`;
  }).join('');
}

function renderModals(){
  return `
  <div class="overlay" id="studentModalOverlay">
    <div class="modal">
      <h3>${state.editingStudent && state.editingStudent.id ? 'Edit student' : 'Add student'}</h3>
      <div class="modal-error" id="studentModalError"></div>
      ${renderStudentFormFields()}
      <div class="modal-actions">
        <button class="btn btn-ghost" id="cancelStudentModal">Cancel</button>
        <button class="btn btn-primary" id="saveStudentModal">Save</button>
      </div>
    </div>
  </div>
  <div class="overlay" id="userModalOverlay">
    <div class="modal">
      <h3>${state.editingUser && state.editingUser.id ? 'Edit user' : 'Add user'}</h3>
      <div class="modal-error" id="userModalError"></div>
      <div class="field"><label>Full name</label><input id="u_name" value="${esc(state.editingUser?.name||'')}"></div>
      <div class="field"><label>Username</label><input id="u_username" value="${esc(state.editingUser?.username||'')}"></div>
      <div class="field"><label>Password ${state.editingUser?.id?'(leave blank to keep unchanged)':''}</label><input id="u_password" type="text" value=""></div>
      <div class="field"><label>Role</label>
        <select id="u_role">
          <option value="Admin" ${state.editingUser?.role==='Admin'?'selected':''}>Admin</option>
          <option value="Staff" ${state.editingUser?.role==='Staff'?'selected':''}>Staff</option>
          <option value="Student Incharge" ${state.editingUser?.role==='Student Incharge'?'selected':''}>Student Incharge</option>
        </select>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="cancelUserModal">Cancel</button>
        <button class="btn btn-primary" id="saveUserModal">Save</button>
      </div>
    </div>
  </div>
  <div class="overlay" id="fieldModalOverlay">
    <div class="modal">
      <h3>Add a new student field</h3>
      <div class="modal-error" id="fieldModalError"></div>
      <div class="field"><label>Field label</label><input id="nf_label" placeholder="e.g. Blood Group"></div>
      <div class="field"><label>Field type</label>
        <select id="nf_type">
          <option value="text">Text</option>
          <option value="select">Dropdown (fixed options)</option>
        </select>
      </div>
      <div class="field" id="nf_options_wrap">
        <label>Options (comma-separated, dropdown only)</label>
        <input id="nf_options" placeholder="e.g. A+, B+, O+, AB+">
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="cancelFieldModal">Cancel</button>
        <button class="btn btn-primary" id="saveFieldModal">Add field</button>
      </div>
    </div>
  </div>
  <div class="overlay" id="accountModalOverlay">
    <div class="modal">
      <h3>My Account</h3>
      <div class="modal-error" id="accountModalError"></div>
      <div class="field"><label>Full name</label><input id="acc_name" value="${esc(state.currentUser?.name||'')}"></div>
      <div class="field"><label>Username</label><input id="acc_username" value="${esc(state.currentUser?.username||'')}"></div>
      <div class="field"><label>New password (leave blank to keep unchanged)</label><input id="acc_password" type="password" placeholder="••••••••"></div>
      <div class="small-note" style="margin-bottom:10px;">Role: ${esc(state.currentUser?.role||'')} — only Admin can change roles.</div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="cancelAccountModal">Cancel</button>
        <button class="btn btn-primary" id="saveAccountModal">Save changes</button>
      </div>
    </div>
  </div>`;
}

/* ---------------- EVENTS ---------------- */
function attachShellEvents(){
  document.querySelectorAll('[data-nav]').forEach(el=>{
    el.addEventListener('click', ()=>{ state.page = el.dataset.nav; state.viewingSession=null; render(); });
  });
  document.getElementById('logoutBtn').addEventListener('click', logout);

  // My Account (self-service)
  const saveAccountBtn = document.getElementById('saveAccountBtn');
  if (saveAccountBtn) saveAccountBtn.addEventListener('click', async ()=>{
    const errEl = document.getElementById('accountError');
    errEl.style.display = 'none';
    const name = document.getElementById('acc_name').value.trim();
    const username = document.getElementById('acc_username').value.trim();
    const currentPassword = document.getElementById('acc_current_password').value;
    const newPassword = document.getElementById('acc_new_password').value;
    if (!name || !username){ errEl.textContent='Name and username are required.'; errEl.style.display='block'; return; }
    if (newPassword && !currentPassword){ errEl.textContent='Enter your current password to set a new one.'; errEl.style.display='block'; return; }
    const payload = { name, username };
    if (newPassword){ payload.password = newPassword; payload.currentPassword = currentPassword; }
    try {
      const result = await api('/me', { method:'PUT', body: JSON.stringify(payload) });
      state.token = result.token;
      state.currentUser = result.user;
      localStorage.setItem('fa_token', state.token);
      localStorage.setItem('fa_user', JSON.stringify(state.currentUser));
      showToast('Account updated.');
      render();
    } catch(e){
      errEl.textContent = e.message; errEl.style.display = 'block';
    }
  });
  const myAccountBtn = document.getElementById('myAccountBtn');
  if (myAccountBtn) myAccountBtn.addEventListener('click', ()=>{ openOverlay('accountModalOverlay'); });
  const cancelAccountModal = document.getElementById('cancelAccountModal');
  if (cancelAccountModal) cancelAccountModal.addEventListener('click', ()=> closeOverlay('accountModalOverlay'));
  const saveAccountModal = document.getElementById('saveAccountModal');
  if (saveAccountModal) saveAccountModal.addEventListener('click', async ()=>{
    const errEl = document.getElementById('accountModalError');
    errEl.style.display = 'none';
    const name = document.getElementById('acc_name').value.trim();
    const username = document.getElementById('acc_username').value.trim();
    const password = document.getElementById('acc_password').value;
    if (!name || !username){ errEl.textContent='Name and username are required.'; errEl.style.display='block'; return; }
    const payload = { name, username };
    if (password) payload.password = password;
    try {
      const res = await api('/account', { method:'PUT', body: JSON.stringify(payload) });
      state.token = res.token;
      state.currentUser = res.user;
      localStorage.setItem('fa_token', state.token);
      localStorage.setItem('fa_user', JSON.stringify(state.currentUser));
      showToast('Account updated.');
      closeOverlay('accountModalOverlay');
      render();
    } catch(e){
      errEl.textContent = e.message; errEl.style.display = 'block';
    }
  });

  // Year tab filters
  document.querySelectorAll('[data-student-year]').forEach(el=>{
    el.addEventListener('click', ()=>{ state._studentYearFilter = el.dataset.studentYear; render(); });
  });
  document.querySelectorAll('[data-student-section]').forEach(el=>{
    el.addEventListener('click', ()=>{ state._studentSectionFilter = el.dataset.studentSection; render(); });
  });
  document.querySelectorAll('[data-student-finance]').forEach(el=>{
    el.addEventListener('click', ()=>{ state._studentFinanceFilter = el.dataset.studentFinance; render(); });
  });
  document.querySelectorAll('[data-att-year]').forEach(el=>{
    el.addEventListener('click', ()=>{ state._attYearFilter = el.dataset.attYear; render(); });
  });
  document.querySelectorAll('[data-att-section]').forEach(el=>{
    el.addEventListener('click', ()=>{ state._attSectionFilter = el.dataset.attSection; render(); });
  });
  document.querySelectorAll('[data-att-event]').forEach(el=>{
    el.addEventListener('click', ()=>{ ensureDraft(); state.attendanceDraft.eventName = el.dataset.attEvent; render(); });
  });

  // Students
  const addStudentBtn = document.getElementById('addStudentBtn');
  if (addStudentBtn) addStudentBtn.addEventListener('click', ()=>{ state.editingStudent={ values:{} }; openOverlay('studentModalOverlay'); });

  document.querySelectorAll('[data-edit-student]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const id = Number(el.dataset.editStudent);
      const s = state.students.find(x=>x.id===id);
      state.editingStudent = { id: s.id, values: { ...s.values } };
      openOverlay('studentModalOverlay');
    });
  });
  document.querySelectorAll('[data-del-student]').forEach(el=>{
    el.addEventListener('click', async ()=>{
      if (!confirm('Delete this student record? This cannot be undone.')) return;
      const id = Number(el.dataset.delStudent);
      try {
        await api('/students/' + id, { method: 'DELETE' });
        state.students = state.students.filter(s=>s.id!==id);
        showToast('Student deleted.');
        render();
      } catch(e){ /* toast already shown */ }
    });
  });
  const sSearch = document.getElementById('studentSearch');
  if (sSearch){
    sSearch.addEventListener('input', ()=>{
      state._studentSearch = sSearch.value;
      render();
      const el = document.getElementById('studentSearch');
      el.focus(); el.setSelectionRange(el.value.length, el.value.length);
    });
  }

  // Tag (multiselect) inputs inside student modal
  document.querySelectorAll('.tag-add-input').forEach(el=>{
    el.addEventListener('keydown', (e)=>{
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const key = el.dataset.tagField;
      const value = el.value.trim();
      if (!value) return;
      if (!state.editingStudent.values[key]) state.editingStudent.values[key] = [];
      if (!Array.isArray(state.editingStudent.values[key])) state.editingStudent.values[key] = [];
      if (!state.editingStudent.values[key].includes(value)) state.editingStudent.values[key].push(value);
      render();
      openOverlay('studentModalOverlay');
      const reopened = document.querySelector(`.tag-add-input[data-tag-field="${key}"]`);
      if (reopened) reopened.focus();
    });
  });
  document.querySelectorAll('[data-remove-tag]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const [key, idx] = el.dataset.removeTag.split(':');
      state.editingStudent.values[key].splice(Number(idx), 1);
      render();
      openOverlay('studentModalOverlay');
    });
  });

  const cancelStudentModal = document.getElementById('cancelStudentModal');
  if (cancelStudentModal) cancelStudentModal.addEventListener('click', ()=> closeOverlay('studentModalOverlay'));
  const saveStudentModal = document.getElementById('saveStudentModal');
  if (saveStudentModal) saveStudentModal.addEventListener('click', async ()=>{
    const errEl = document.getElementById('studentModalError');
    errEl.style.display = 'none';
    const values = { ...state.editingStudent.values };
    visibleFields().forEach(f=>{
      if (f.type === 'multiselect') return; // already collected via tag interactions
      const inp = document.getElementById('sf_' + f.key);
      if (inp) values[f.key] = inp.value.trim();
    });
    if (!values.name || !values.name.trim()){ errEl.textContent='Please enter a name.'; errEl.style.display='block'; return; }
    try {
      if (state.editingStudent.id){
        const updated = await api('/students/' + state.editingStudent.id, { method:'PUT', body: JSON.stringify({ values }) });
        const idx = state.students.findIndex(s=>s.id===updated.id);
        state.students[idx] = updated;
        showToast('Student updated.');
      } else {
        const created = await api('/students', { method:'POST', body: JSON.stringify({ values }) });
        state.students.push(created);
        showToast('Student added.');
      }
      closeOverlay('studentModalOverlay');
      render();
    } catch(e){
      errEl.textContent = e.message; errEl.style.display = 'block';
    }
  });

  // Manage Fields (admin)
  const addFieldBtn = document.getElementById('addFieldBtn');
  if (addFieldBtn) addFieldBtn.addEventListener('click', ()=>{ openOverlay('fieldModalOverlay'); });
  const nfType = document.getElementById('nf_type');
  if (nfType) nfType.addEventListener('change', ()=>{
    document.getElementById('nf_options_wrap').style.display = nfType.value === 'select' ? 'block' : 'none';
  });
  const cancelFieldModal = document.getElementById('cancelFieldModal');
  if (cancelFieldModal) cancelFieldModal.addEventListener('click', ()=> closeOverlay('fieldModalOverlay'));
  const saveFieldModal = document.getElementById('saveFieldModal');
  if (saveFieldModal) saveFieldModal.addEventListener('click', async ()=>{
    const errEl = document.getElementById('fieldModalError');
    errEl.style.display = 'none';
    const label = document.getElementById('nf_label').value.trim();
    const type = document.getElementById('nf_type').value;
    const optionsRaw = document.getElementById('nf_options').value;
    if (!label){ errEl.textContent='Please enter a label.'; errEl.style.display='block'; return; }
    const options = type==='select' ? optionsRaw.split(',').map(s=>s.trim()).filter(Boolean) : undefined;
    try {
      const field = await api('/fields', { method:'POST', body: JSON.stringify({ label, type, options }) });
      state.fields.push(field);
      showToast('Field added.');
      closeOverlay('fieldModalOverlay');
      render();
    } catch(e){
      errEl.textContent = e.message; errEl.style.display = 'block';
    }
  });
  document.querySelectorAll('[data-rename-field]').forEach(el=>{
    el.addEventListener('click', ()=>{ state.editingField = el.dataset.renameField; render(); });
  });
  const cancelFieldRename = document.getElementById('cancelFieldRename');
  if (cancelFieldRename) cancelFieldRename.addEventListener('click', ()=>{ state.editingField = null; render(); });
  const saveFieldRename = document.getElementById('saveFieldRename');
  if (saveFieldRename) saveFieldRename.addEventListener('click', async ()=>{
    const newLabel = document.getElementById('renameFieldInput').value.trim();
    if (!newLabel) return;
    try {
      const updated = await api('/fields/' + state.editingField, { method:'PUT', body: JSON.stringify({ label: newLabel }) });
      const idx = state.fields.findIndex(f=>f.key===updated.key);
      state.fields[idx] = updated;
      state.editingField = null;
      showToast('Field renamed.');
      render();
    } catch(e){ /* toast shown */ }
  });
  document.querySelectorAll('[data-edit-options]').forEach(el=>{
    el.addEventListener('click', ()=>{ state.editingFieldOptions = el.dataset.editOptions; render(); });
  });
  const cancelFieldOptions = document.getElementById('cancelFieldOptions');
  if (cancelFieldOptions) cancelFieldOptions.addEventListener('click', ()=>{ state.editingFieldOptions = null; render(); });
  const saveFieldOptions = document.getElementById('saveFieldOptions');
  if (saveFieldOptions) saveFieldOptions.addEventListener('click', async ()=>{
    const raw = document.getElementById('optionsFieldInput').value;
    const options = raw.split(',').map(s=>s.trim()).filter(Boolean);
    if (!options.length){ showToast('Add at least one option.', true); return; }
    try {
      const updated = await api('/fields/' + state.editingFieldOptions, { method:'PUT', body: JSON.stringify({ options }) });
      const idx = state.fields.findIndex(f=>f.key===updated.key);
      state.fields[idx] = updated;
      state.editingFieldOptions = null;
      showToast('Options updated.');
      render();
    } catch(e){ /* toast shown */ }
  });
  document.querySelectorAll('[data-toggle-field]').forEach(el=>{
    el.addEventListener('click', async ()=>{
      const key = el.dataset.toggleField;
      const f = state.fields.find(x=>x.key===key);
      try {
        const updated = await api('/fields/' + key, { method:'PUT', body: JSON.stringify({ visible: !(f.visible!==false) }) });
        const idx = state.fields.findIndex(x=>x.key===key);
        state.fields[idx] = updated;
        render();
      } catch(e){ /* toast shown */ }
    });
  });
  document.querySelectorAll('[data-del-field]').forEach(el=>{
    el.addEventListener('click', async ()=>{
      if (!confirm('Delete this field? This removes its data from every student permanently.')) return;
      const key = el.dataset.delField;
      try {
        await api('/fields/' + key, { method:'DELETE' });
        state.fields = state.fields.filter(f=>f.key!==key);
        state.students.forEach(s=>{ if (s.values) delete s.values[key]; });
        showToast('Field deleted.');
        render();
      } catch(e){ /* toast shown */ }
    });
  });

  // Users
  const addUserBtn = document.getElementById('addUserBtn');
  if (addUserBtn) addUserBtn.addEventListener('click', ()=>{ state.editingUser={}; openOverlay('userModalOverlay'); });
  document.querySelectorAll('[data-edit-user]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const id = Number(el.dataset.editUser);
      state.editingUser = { ...state.users.find(u=>u.id===id) };
      openOverlay('userModalOverlay');
    });
  });
  document.querySelectorAll('[data-del-user]').forEach(el=>{
    el.addEventListener('click', async ()=>{
      if (!confirm('Delete this user account?')) return;
      const id = Number(el.dataset.delUser);
      try {
        await api('/users/' + id, { method: 'DELETE' });
        state.users = state.users.filter(u=>u.id!==id);
        showToast('User deleted.');
        render();
      } catch(e){ /* toast already shown */ }
    });
  });
  const cancelUserModal = document.getElementById('cancelUserModal');
  if (cancelUserModal) cancelUserModal.addEventListener('click', ()=> closeOverlay('userModalOverlay'));
  const saveUserModal = document.getElementById('saveUserModal');
  if (saveUserModal) saveUserModal.addEventListener('click', async ()=>{
    const errEl = document.getElementById('userModalError');
    errEl.style.display = 'none';
    const name = document.getElementById('u_name').value.trim();
    const username = document.getElementById('u_username').value.trim();
    const password = document.getElementById('u_password').value;
    const role = document.getElementById('u_role').value;
    if (!name || !username){ errEl.textContent='Please fill in name and username.'; errEl.style.display='block'; return; }
    if (!state.editingUser.id && !password){ errEl.textContent='Password is required for a new user.'; errEl.style.display='block'; return; }
    const payload = { name, username, role };
    if (password) payload.password = password;
    try {
      if (state.editingUser.id){
        const updated = await api('/users/' + state.editingUser.id, { method:'PUT', body: JSON.stringify(payload) });
        const idx = state.users.findIndex(u=>u.id===updated.id);
        state.users[idx] = updated;
        if (state.currentUser.id === updated.id){
          state.currentUser = { ...state.currentUser, ...updated };
          localStorage.setItem('fa_user', JSON.stringify(state.currentUser));
        }
        showToast('User updated.');
      } else {
        const created = await api('/users', { method:'POST', body: JSON.stringify(payload) });
        state.users.push(created);
        showToast('User added.');
      }
      closeOverlay('userModalOverlay');
      render();
    } catch(e){
      errEl.textContent = e.message; errEl.style.display = 'block';
    }
  });

  // Attendance marking
  const attDate = document.getElementById('attDate');
  if (attDate) attDate.addEventListener('change', ()=>{ ensureDraft(); state.attendanceDraft.date = attDate.value; render(); });
  const attEvent = document.getElementById('attEvent');
  if (attEvent) attEvent.addEventListener('change', ()=>{ ensureDraft(); state.attendanceDraft.eventName = attEvent.value; render(); });
  document.querySelectorAll('[data-toggle-hour]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const [studentId, hour] = el.dataset.toggleHour.split('::');
      toggleHourStatus(Number(studentId), hour);
      render();
    });
  });
  document.querySelectorAll('[data-full-day]').forEach(el=>{
    el.addEventListener('click', ()=>{
      setFullDay(Number(el.dataset.fullDay), 'Present');
      render();
    });
  });
  const markAllPresent = document.getElementById('markAllPresent');
  if (markAllPresent) markAllPresent.addEventListener('click', ()=>{
    ensureDraft();
    const eventF = state.attendanceDraft.eventName;
    const yearF = state._attYearFilter || '';
    const sectionF = state._attSectionFilter || '';
    state.students.filter(s=> (!eventF||(val(s,'events')||[]).includes(eventF)) && (!yearF||val(s,'year')===yearF) && (!sectionF||val(s,'section')===sectionF) )
      .forEach(s=> setFullDay(s.id, 'Present'));
    render();
  });
  const markAllAbsent = document.getElementById('markAllAbsent');
  if (markAllAbsent) markAllAbsent.addEventListener('click', ()=>{
    ensureDraft();
    const eventF = state.attendanceDraft.eventName;
    const yearF = state._attYearFilter || '';
    const sectionF = state._attSectionFilter || '';
    state.students.filter(s=> (!eventF||(val(s,'events')||[]).includes(eventF)) && (!yearF||val(s,'year')===yearF) && (!sectionF||val(s,'section')===sectionF) )
      .forEach(s=> setFullDay(s.id, 'Absent'));
    render();
  });
  const saveAttendanceBtn = document.getElementById('saveAttendanceBtn');
  if (saveAttendanceBtn) saveAttendanceBtn.addEventListener('click', async ()=>{
    const draft = state.attendanceDraft;
    const marks = Object.entries(draft.marks).map(([studentId, hours]) => ({ studentId: Number(studentId), hours }));
    try {
      const session = await api('/attendance', { method:'POST', body: JSON.stringify({ id: draft.id, date: draft.date, eventName: draft.eventName, marks }) });
      const idx = state.attendance.findIndex(s=>s.id===session.id);
      if (idx>=0) state.attendance[idx]=session; else state.attendance.push(session);
      showToast(draft.id ? 'Attendance session updated.' : 'Attendance session saved.');
      state.attendanceDraft = null;
      state.page = 'records';
      render();
    } catch(e){ /* toast already shown */ }
  });
  const cancelEditSession = document.getElementById('cancelEditSession');
  if (cancelEditSession) cancelEditSession.addEventListener('click', ()=>{ state.attendanceDraft = null; render(); });

  // Records
  document.querySelectorAll('[data-view-session]').forEach(el=>{
    el.addEventListener('click', (e)=>{
      if (e.target.closest('[data-edit-session]') || e.target.closest('[data-del-session]')) return;
      state.viewingSession = Number(el.dataset.viewSession); state.page='records'; render();
    });
  });
  document.querySelectorAll('[data-edit-session]').forEach(el=>{
    el.addEventListener('click', (e)=>{
      e.stopPropagation();
      const id = Number(el.dataset.editSession);
      const s = state.attendance.find(x=>x.id===id);
      if (!s) return;
      const marks = {};
      (s.marks||[]).forEach(m => marks[m.studentId] = { ...(m.hours||{}) });
      state.attendanceDraft = { id: s.id, date: s.date, eventName: s.eventName || '', marks };
      state.viewingSession = null;
      state.page = 'attendance';
      render();
    });
  });
  document.querySelectorAll('[data-del-session]').forEach(el=>{
    el.addEventListener('click', async (e)=>{
      e.stopPropagation();
      if (!confirm('Delete this attendance session?')) return;
      const id = Number(el.dataset.delSession);
      try {
        await api('/attendance/' + id, { method: 'DELETE' });
        state.attendance = state.attendance.filter(s=>s.id!==id);
        showToast('Session deleted.');
        render();
      } catch(e){ /* toast already shown */ }
    });
  });
  const backToRecords = document.getElementById('backToRecords');
  if (backToRecords) backToRecords.addEventListener('click', ()=>{ state.viewingSession=null; render(); });
}

function openOverlay(id){ document.getElementById(id).classList.add('open'); }
function closeOverlay(id){ document.getElementById(id).classList.remove('open'); }

/* ---------------- init ---------------- */
render();
if (state.currentUser && state.token) loadAll();
