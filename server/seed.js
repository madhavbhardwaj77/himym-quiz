const path = require('path');
const fs = require('fs');

function seedQuestions(db) {
  const count = db.prepare('SELECT COUNT(*) as c FROM questions').get().c;
  if (count > 0) return;

  const jsonPath = path.join(__dirname, '../data/questions.json');
  if (!fs.existsSync(jsonPath)) return;

  const questions = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

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
  console.log('✓ Seeded ' + questions.length + ' questions from questions.json (Total credits: 10,000)');
}

module.exports = { seedQuestions };
