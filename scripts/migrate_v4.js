const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../data/quiz.db');
const questionsPath = path.join(__dirname, '../data/questions.json');

console.log('Connecting to database:', dbPath);
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 1. Wipe old data
console.log('Wiping old quiz data...');
db.exec(`
  DELETE FROM answers;
  DELETE FROM attempts;
  DELETE FROM options;
  DELETE FROM questions;
  DELETE FROM teams;
`);

// 2. Load questions.json
console.log('Reading questions from:', questionsPath);
const questions = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));

// 3. Seed new questions
const insertQ = db.prepare(`
  INSERT INTO questions (position, section, sdg, text, code, multiplier, explanation, active)
  VALUES (@position, @section, @sdg, @text, @code, @multiplier, @explanation, 1)
`);
const insertO = db.prepare(`
  INSERT INTO options (question_id, label, text, weight)
  VALUES (@question_id, @label, @text, @weight)
`);

const insertAll = db.transaction(() => {
  for (const q of questions) {
    const result = insertQ.run({
      position: q.position,
      section: q.section,
      sdg: q.sdg,
      text: q.text,
      code: q.code || null,
      multiplier: q.multiplier || 1,
      explanation: q.explanation || null
    });
    for (const opt of q.options) {
      insertO.run({
        question_id: result.lastInsertRowid,
        label: opt.label,
        text: opt.text,
        weight: opt.weight || 0
      });
    }
  }
});

insertAll();

// 4. Update settings
db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('quiz_open', 'true')").run();
db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('quiz_duration_minutes', '40')").run();

// 5. Verify database contents
const qCount = db.prepare('SELECT COUNT(*) as c FROM questions').get().c;
const oCount = db.prepare('SELECT COUNT(*) as c FROM options').get().c;
const settings = db.prepare('SELECT key, value FROM settings').all();

// Calculate total max score
const allQuestions = db.prepare('SELECT id, position, section, multiplier FROM questions ORDER BY position').all();
let totalCredits = 0;
for (const q of allQuestions) {
  const opts = db.prepare('SELECT weight FROM options WHERE question_id = ?').all(q.id);
  const maxW = Math.max(...opts.map(o => o.weight));
  totalCredits += maxW * q.multiplier;
}

console.log('--- Migration Verification ---');
console.log('Questions count:', qCount);
console.log('Options count:', oCount);
console.log('Settings:', settings);
console.log('Total Max Credits:', totalCredits);

if (qCount === 20 && oCount === 80 && totalCredits === 10000) {
  console.log('SUCCESS: Database successfully migrated to v4!');
} else {
  console.error('ERROR: Verification failed!');
  process.exit(1);
}

db.close();
