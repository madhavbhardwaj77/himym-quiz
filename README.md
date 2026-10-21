# HOW I MET YOUR MURDERER – Round 2 Quiz App

A full-stack quiz platform for the campus mystery event **"HOW I MET YOUR MURDERER – Round 2: What the Dead Knew"**. Teams answer 20 multiple-choice questions and earn fictional **Evidence Auction credits** based on their score.

---

## Table of Contents
1. [Tech Stack](#tech-stack)
2. [Folder Structure](#folder-structure)
3. [Setup & Running](#setup--running)
4. [Environment Variables](#environment-variables)
5. [Admin Dashboard](#admin-dashboard)
6. [How Scoring Works](#how-scoring-works)
7. [How to Change Weights](#how-to-change-weights)
8. [Deployment (Render / Railway)](#deployment)
9. [Test Checklist](#test-checklist)
10. [Re-importing Questions](#re-importing-questions)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vanilla HTML/CSS/JS (single-page app, no build step) |
| Backend | Node.js + Express |
| Database | SQLite via `better-sqlite3` (file-based, auto-persistent) |
| Fonts | Google Fonts – Special Elite, Courier Prime, Oswald |

---

## Folder Structure

```
tedx_event/
├── server/
│   ├── index.js            ← Express entry point
│   ├── db.js               ← SQLite setup & migrations
│   ├── seed.js             ← Seeds 20 questions on first run
│   ├── routes/
│   │   ├── teams.js        ← POST /api/teams
│   │   ├── attempts.js     ← POST /api/attempts/start, /submit
│   │   ├── questions.js    ← GET /api/questions (no weights)
│   │   ├── answers.js      ← PUT /api/answers
│   │   ├── events.js       ← POST /api/events (anti-cheat)
│   │   └── admin.js        ← /api/admin/* (protected)
│   └── middleware/
│       └── auth.js         ← Admin token verification
├── public/
│   ├── index.html          ← Participant SPA (landing → quiz → result)
│   ├── admin.html          ← Admin dashboard
│   ├── css/
│   │   └── style.css       ← Dark noir theme
│   └── js/
│       ├── app.js          ← Participant quiz logic
│       └── admin.js        ← Admin dashboard logic
├── data/
│   ├── questions.json      ← Seed/backup of all 20 questions + weights
│   └── quiz.db             ← SQLite database (auto-created on first run)
├── .env.example            ← Copy to .env and fill in values
├── package.json
└── README.md
```

---

## Setup & Running

### Prerequisites
- **Node.js** v18+ (includes npm)
- Git (optional)

### 1. Install dependencies

```bash
cd tedx_event
npm install
```

### 2. Configure environment

```bash
# Copy the example env file
cp .env.example .env

# Edit .env with your values:
# ADMIN_PASSWORD=your_secure_password
# PORT=3000
# QUIZ_DURATION_MINUTES=40
```

### 3. Start the server

```bash
npm start
```

The server will:
- Auto-create `data/quiz.db` on first run
- Seed all 20 questions automatically if the DB is empty
- Serve the participant app at **http://localhost:3000**
- Serve the admin dashboard at **http://localhost:3000/admin**

### Development mode (auto-restart on changes)

```bash
npm run dev
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ADMIN_PASSWORD` | `supersecret` | Password for the `/admin` dashboard |
| `PORT` | `3000` | HTTP port |
| `QUIZ_DURATION_MINUTES` | `40` | Default quiz duration in minutes (starts only after clicking Start) |

> **Important:** The timer begins *only* when the participant finishes reading the rules and clicks **"Start Investigation"**.

---

## Admin Dashboard

Navigate to `http://localhost:PORT/admin` and enter your `ADMIN_PASSWORD`.

### Features

| Panel | What you can do |
|-------|----------------|
| **Leaderboard** | Live rankings, status (not started / in progress / submitted), credits, time taken, tab-switch flags. Auto-refreshes every 10 s. Click any row to see per-question answers and weights earned. |
| **Question Manager** | Add, edit, delete questions. Edit option text and weights inline. Set multiplier per question. Toggle active/inactive. |
| **Controls** | Open/close the quiz. Set duration. Reset a single team's attempt. Reset ALL data (with confirmation). |
| **Export** | Download results as CSV. Export all questions as JSON. Import questions from JSON (with replace option). |

### CSV Export columns
`Team Name, Members, Route, Score, Credits, Time Taken (s), Tab Switches, Status`

---

## How Scoring Works

Scoring is **weight-driven** and computed entirely **server-side**. Weights are never sent to the participant browser.

```
credits = Σ ( weight_of_selected_option × question_multiplier )
```

- **Difficulty Tiers (v4):**
  - **Easy (8 questions):** 250 credits each (= 2,000 credits)
  - **Medium (8 questions):** 500 credits each (= 4,000 credits)
  - **Hard (4 questions):** 1,000 credits each (= 4,000 credits)
- **Section Distribution:**
  - **Section A – AI Tools & Prompting (5 Qs):** 2,500 credits
  - **Section B – Data Structures & Algorithms (5 Qs):** 2,500 credits
  - **Section C – Reasoning (10 Qs):** 5,000 credits
- **Total Possible Score:** **10,000 credits**
- **No negative marking** (wrong option weight is 0).
- Credits earned become the team's starting budget for the **Evidence Auction**.

---

## How to Change Weights

### Via the Admin Dashboard (recommended)
1. Go to `/admin` → **Question Manager**
2. Click the expand arrow on any question
3. Edit the `wt:` field next to each option
4. Click **Save** next to the option

### Via questions.json (for bulk changes)
1. Edit `data/questions.json` — change the `"weight"` field on any option
2. In the admin dashboard → **Export → Import Questions** → check "Replace all" → import the file
3. Existing attempts are not retroactively recalculated

### Weight Rules
- Weight must be an integer ≥ 0
- One option per question should have weight `100` (or whatever max you want)
- The others should have weight `0` for no partial credit
- To add negative marking: set wrong options to a negative integer (e.g., `-25`)

---

## Deployment

### Render.com (recommended)

1. Push this repo to GitHub
2. Create a new **Web Service** on Render
3. Set build command: `npm install`
4. Set start command: `node server/index.js`
5. Add environment variables in the Render dashboard:
   - `ADMIN_PASSWORD` = your secure password
   - `QUIZ_DURATION_MINUTES` = 40
6. **Important:** Add a **Disk** to your Render service (mount path: `/data`, size: 1 GB) so the SQLite database persists across deploys

### Railway.app

1. Push to GitHub
2. Create new project → Deploy from GitHub repo
3. Set the same environment variables
4. Railway auto-detects Node.js; start command is `npm start`
5. Add a **Volume** mounted at `/data` for SQLite persistence

### Self-hosted (VPS / VM)

```bash
# Install Node.js, then:
git clone <repo>
cd tedx_event
npm install
cp .env.example .env
nano .env   # set your values
node server/index.js

# Or use PM2 for production:
npm install -g pm2
pm2 start server/index.js --name himym-quiz
pm2 save
pm2 startup
```

---

## Test Checklist

Use this checklist to verify all features before the event:

### 1. Registration & Session
- [ ] Open `http://localhost:3000`
- [ ] Register a team with name "Alpha", members "Alice, Bob", Route 1
- [ ] Verify the token is saved in `localStorage` (DevTools → Application → Local Storage)
- [ ] Refresh the page → you should be taken back to where you left off (rules screen)
- [ ] Try registering the same team name again → should get "Team name already taken" error

### 2. Quiz Flow
- [ ] Click **Start Investigation** from the Rules screen
- [ ] Verify the timer starts counting down from the set duration
- [ ] Answer Q1, then navigate to Q2 using Next
- [ ] Navigate back to Q1 using Previous → your Q1 answer should still be selected
- [ ] **Refresh the page mid-quiz** → quiz should resume with your answer intact (autosave works)
- [ ] Flag a question → verify the navigator button turns amber
- [ ] Answer all 20 questions

### 3. Submit
- [ ] Click SUBMIT → see summary modal (X answered, Y flagged, Z unanswered)
- [ ] Click CONFIRM SUBMIT
- [ ] See the result screen with credits earned
- [ ] Credits = sum of weights earned (up to 10,000 credits)
- [ ] Try refreshing → stays on result screen (cannot re-take)

### 4. Timer Expiry
- [ ] Set `QUIZ_DURATION_MINUTES=1` in `.env` (or via admin dashboard → Controls)
- [ ] Register a new team, start quiz, wait for timer to reach 00:00
- [ ] Quiz should auto-submit
- [ ] Check admin leaderboard → team shows as "submitted" with correct score

### 5. Leaderboard & CSV
- [ ] Go to `/admin` and log in
- [ ] Verify the team appears in the leaderboard with correct credits
- [ ] Click the team row → see per-question answers and weights earned
- [ ] Click **Export → Download CSV** → open the file and verify columns match

### 6. Weights Verification
- [ ] In admin → Question Manager, set Q1 option C weight from 100 to 50
- [ ] Register a new team, answer Q1 with option C, submit
- [ ] Verify their score is 50 (not 100) for that question

### 7. Anti-Cheat & Strict Proctoring
- [ ] While in quiz, switch to another browser tab or minimize window → security violation modal appears with strike counter
- [ ] Text selection is disabled (`user-select: none`)
- [ ] Right-clicking is blocked and triggers a security toast warning
- [ ] Try `Ctrl+C`, `Ctrl+V`, `Ctrl+X` or `F12` → blocked immediately with an alert toast
- [ ] Check `/admin` leaderboard → the Flags column records total infractions in real time

---

## Re-importing Questions

If you need to reset questions to the original 20 (e.g., after testing edits):

1. Go to `/admin` → **Export** panel
2. Click **Import Questions**
3. Select `data/questions.json`
4. Check **Replace all**
5. Click **Import**

The original seed questions are always available in `data/questions.json`.

---

## API Reference (quick summary)

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/teams` | Team token | Register a team |
| POST | `/api/attempts/start` | Team token | Start or resume an attempt |
| GET | `/api/questions` | Team token | Get questions (no weights, options shuffled) |
| PUT | `/api/answers` | Team token | Autosave an answer |
| POST | `/api/attempts/submit` | Team token | Submit and calculate score |
| POST | `/api/events` | Team token | Log anti-cheat event |
| POST | `/api/admin/login` | — | Get admin token |
| GET | `/api/admin/leaderboard` | Admin | All teams + scores |
| GET | `/api/admin/teams/:id` | Admin | Team detail + per-question answers |
| GET | `/api/admin/questions` | Admin | All questions with weights |
| POST | `/api/admin/questions` | Admin | Add question |
| PUT | `/api/admin/questions/:id` | Admin | Edit question |
| DELETE | `/api/admin/questions/:id` | Admin | Delete question |
| PUT | `/api/admin/options/:id` | Admin | Edit option text/weight |
| GET | `/api/admin/settings` | Admin | Get quiz_open, duration |
| PUT | `/api/admin/settings` | Admin | Update settings |
| POST | `/api/admin/reset/team/:id` | Admin | Reset one team |
| POST | `/api/admin/reset/all` | Admin | Reset all data |
| GET | `/api/admin/export/csv` | Admin (query param) | CSV export |
| GET | `/api/admin/export/questions` | Admin | JSON export |
| POST | `/api/admin/import/questions` | Admin | JSON import |

---

*Built for the HOW I MET YOUR MURDERER mystery event. Good luck, investigators.*
