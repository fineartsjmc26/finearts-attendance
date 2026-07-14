# Fine Arts Department — Attendance Register

A real full-stack app: Node.js/Express backend with its own database file, plain
HTML/CSS/JS frontend, JWT-based login with three roles (Admin, Staff, Student
Incharge).

## What's new in this version

- **Customizable student fields** — Admin can add new fields, rename any
  field's label, hide fields, or delete non-required ones, from **Manage
  Fields**. Everyone's Add/Edit Student form updates automatically.
- **Year categorization** — filter Students and Attendance by I Year / II
  Year / III Year with one tap (shown automatically if the Year field exists).
- **Multiple events per student** — a student can be tagged into as many
  events as they're part of (e.g. Art Fest + Dance Comp + Drama Night).
- **Multiple attendance sessions per day** — attendance is marked by date
  *and time*, so you can run a session every few hours without one
  overwriting the last.
- **Edit past attendance** — open any saved session from Attendance Records
  and click **Edit** to change who was marked present/absent, even for a
  previous day.
- **One shared record** — students, attendance, and field changes are stored
  centrally. Whatever Admin, Staff, or Student Incharge adds, edits, or
  deletes is immediately visible to the other two — there's no separate copy
  per user.


## What's inside

```
finearts-attendance/
├── server.js         # Express API (auth, students, users, attendance)
├── db.js             # Simple JSON-file database (no native modules to install)
├── data/data.json     # Created automatically on first run — this IS your database
├── public/            # Frontend (served by the same server)
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── package.json
└── .env.example
```

There's no separate database server to set up — `data/data.json` is created
automatically the first time you run the app, and everything (students,
users, attendance) lives in that one file. This is enough for a single
department's records. If you outgrow it later (thousands of students, many
simultaneous editors), the API layer is written so it's a contained job to
swap `db.js` for a real database like PostgreSQL.

## Run it on your own computer first

You'll need [Node.js](https://nodejs.org) 18 or later installed.

```bash
cd finearts-attendance
npm install
cp .env.example .env
# open .env and change JWT_SECRET to any random string
npm start
```

Open **http://localhost:3000** in your browser.

Default login:
- **Username:** `admin`
- **Password:** `admin123`

**Change this password immediately** — sign in, go to "Staff & Users," edit
the Administrator account, and set a new password. Then create separate
logins for your Staff and Student Incharge users from that same screen.

## Forgot a password? (locked out)

Passwords are stored encrypted (hashed) — nobody, including me, can look up
or recover the original password. But you can reset any account's password
directly on the computer/server running the app:

```bash
node reset-password.js <username> <newPassword>
```

Example:
```bash
node reset-password.js admin myNewPassword123
```

Run it with no arguments to see a list of existing usernames on that install.
This edits `data/data.json` directly, so run it from inside the
`finearts-attendance` folder, and stop the server first if it's running.

If the app is deployed on Render/Railway/etc., you'd run this by opening a
shell on that hosting service (Render has a "Shell" tab on your service
page), not on your own computer, since the real `data.json` lives there.

## Deploying so it's live on the internet

The easiest free option is **Render**:

1. Create a free account at [render.com](https://render.com).
2. Put this project in a GitHub repository (create a new repo, push these
   files to it).
3. In Render, click **New → Web Service**, connect your GitHub repo.
4. Settings:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
5. Under **Environment**, add an environment variable:
   - `JWT_SECRET` → any long random string (e.g. generate one at
     [randomkeygen.com](https://randomkeygen.com))
6. Click **Create Web Service**. Render will build and deploy it, and give
   you a live URL like `https://finearts-attendance.onrender.com`.

**Important:** Render's free tier does not keep a persistent disk by
default, which means `data/data.json` can be wiped on redeploys or restarts.
For anything beyond a quick test, add a **free persistent disk** in Render
(Settings → Disks → mount it at `/opt/render/project/src/data`), or migrate
to a real database. Two other free/cheap options that behave the same way:
[Railway](https://railway.app) and [Fly.io](https://fly.io) — both work with
these exact same files, and both offer persistent volumes for the `data`
folder in their free/starter tiers.

If your college already has its own server or hosting (cPanel with Node.js
support, a VPS, etc.), you can also just copy this folder there, run
`npm install && npm start` (or use a process manager like `pm2` to keep it
running), and point your domain at it.

## API reference (for future changes)

All routes except `/api/login` require an `Authorization: Bearer <token>`
header, obtained by logging in.

| Method | Route              | Who          | Purpose                        |
|--------|--------------------|--------------|---------------------------------|
| POST   | /api/login          | anyone       | Sign in, get a token            |
| GET    | /api/fields          | signed in    | List student field definitions  |
| POST   | /api/fields          | Admin only   | Add a new custom field          |
| PUT    | /api/fields/:key      | Admin only   | Rename or hide/show a field     |
| DELETE | /api/fields/:key      | Admin only   | Delete a non-required field     |
| GET    | /api/students        | signed in    | List all students               |
| POST   | /api/students        | signed in    | Add a student                   |
| PUT    | /api/students/:id     | signed in    | Edit a student                  |
| DELETE | /api/students/:id     | signed in    | Delete a student                 |
| GET    | /api/users            | Admin only   | List staff/incharge accounts    |
| POST   | /api/users            | Admin only   | Add a staff/incharge account    |
| PUT    | /api/users/:id        | Admin only   | Edit an account                 |
| DELETE | /api/users/:id        | Admin only   | Delete an account               |
| GET    | /api/attendance       | signed in    | List attendance sessions        |
| POST   | /api/attendance       | signed in    | Save a new session, or update an existing one by passing its `id` |
| DELETE | /api/attendance/:id   | signed in    | Delete an attendance session    |

Student records are stored as `{ id, values: { <fieldKey>: value } }`. The
default fields are `name`, `year`, `dept`, `mobile`, `events` (an array,
for multiple events), and `financeType` (`"Aided"` or `"Self Finance"`).
Attendance sessions are `{ id, date, time, eventName, marks: [...] }` — a
session is uniquely identified by date + time + eventName unless you pass
an explicit `id` to update one directly.
