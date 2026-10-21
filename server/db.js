const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

function initDb() {
  const dataDir = process.env.DATA_DIR || path.join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const db = new Database(path.join(dataDir, 'quiz.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      members_json TEXT NOT NULL,
      route INTEGER NOT NULL CHECK(route BETWEEN 1 AND 5),
      token TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      position INTEGER NOT NULL,
      section TEXT NOT NULL,
      sdg TEXT NOT NULL,
      text TEXT NOT NULL,
      code TEXT,
      multiplier REAL NOT NULL DEFAULT 1,
      explanation TEXT,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      label TEXT NOT NULL CHECK(label IN ('A','B','C','D')),
      text TEXT NOT NULL,
      weight INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id INTEGER UNIQUE NOT NULL REFERENCES teams(id),
      started_at TEXT NOT NULL,
      submitted_at TEXT,
      score REAL DEFAULT 0,
      tab_switches INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress','submitted'))
    );

    CREATE TABLE IF NOT EXISTS answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempt_id INTEGER NOT NULL REFERENCES attempts(id),
      question_id INTEGER NOT NULL REFERENCES questions(id),
      option_id INTEGER REFERENCES options(id),
      flagged INTEGER DEFAULT 0,
      answered_at TEXT,
      time_spent_sec REAL DEFAULT 0,
      UNIQUE(attempt_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Default settings
  const duration = process.env.QUIZ_DURATION_MINUTES || '40';
  db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('quiz_open', 'true')`).run();
  db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('quiz_duration_minutes', ?)`).run(duration);

  return db;
}

module.exports = { initDb };
