const express = require('express');
const router  = express.Router();

function getDurationMs(db) {
  const s = db.prepare("SELECT value FROM settings WHERE key = 'quiz_duration_minutes'").get();
  const mins = parseFloat(s ? s.value : (process.env.QUIZ_DURATION_MINUTES || '40'));
  return mins * 60 * 1000;
}

// PUT /api/answers  – upsert a single answer
router.put('/', (req, res) => {
  const db    = req.app.locals.db;
  const token = req.headers['x-team-token'];
  if (!token) return res.status(401).json({ error: 'No token' });

  const team = db.prepare('SELECT * FROM teams WHERE token = ?').get(token);
  if (!team) return res.status(401).json({ error: 'Invalid token' });

  const attempt = db.prepare('SELECT * FROM attempts WHERE team_id = ?').get(team.id);
  if (!attempt)                     return res.status(404).json({ error: 'No attempt' });
  if (attempt.status === 'submitted') return res.status(403).json({ error: 'Already submitted' });

  // Enforce time limit
  const durationMs = getDurationMs(db);
  const expired    = Date.now() - new Date(attempt.started_at).getTime() > durationMs;
  if (expired) return res.status(403).json({ error: 'Time expired' });

  const { question_id, option_id, flagged, time_spent_sec } = req.body;
  if (!question_id) return res.status(400).json({ error: 'question_id required' });

  // Validate question is active
  const q = db.prepare('SELECT id FROM questions WHERE id = ? AND active = 1').get(question_id);
  if (!q) return res.status(400).json({ error: 'Invalid question' });

  // Validate option belongs to this question (if provided)
  if (option_id) {
    const opt = db.prepare('SELECT id FROM options WHERE id = ? AND question_id = ?').get(option_id, question_id);
    if (!opt) return res.status(400).json({ error: 'Invalid option for this question' });
  }

  db.prepare(`
    INSERT INTO answers (attempt_id, question_id, option_id, flagged, answered_at, time_spent_sec)
    VALUES (?, ?, ?, ?, datetime('now'), ?)
    ON CONFLICT(attempt_id, question_id) DO UPDATE SET
      option_id      = excluded.option_id,
      flagged        = excluded.flagged,
      answered_at    = excluded.answered_at,
      time_spent_sec = excluded.time_spent_sec
  `).run(
    attempt.id,
    question_id,
    option_id      || null,
    flagged        ? 1 : 0,
    time_spent_sec || 0
  );

  res.json({ ok: true });
});

// PUT /api/answers/batch  – upsert many answers at once (useful for offline sync)
router.put('/batch', (req, res) => {
  const db    = req.app.locals.db;
  const token = req.headers['x-team-token'];
  if (!token) return res.status(401).json({ error: 'No token' });

  const team = db.prepare('SELECT * FROM teams WHERE token = ?').get(token);
  if (!team) return res.status(401).json({ error: 'Invalid token' });

  const attempt = db.prepare('SELECT * FROM attempts WHERE team_id = ?').get(team.id);
  if (!attempt)                     return res.status(404).json({ error: 'No attempt' });
  if (attempt.status === 'submitted') return res.status(403).json({ error: 'Already submitted' });

  const durationMs = getDurationMs(db);
  const expired    = Date.now() - new Date(attempt.started_at).getTime() > durationMs;
  if (expired) return res.status(403).json({ error: 'Time expired' });

  const { answers } = req.body;
  if (!Array.isArray(answers)) return res.status(400).json({ error: 'answers array required' });

  const upsert = db.prepare(`
    INSERT INTO answers (attempt_id, question_id, option_id, flagged, answered_at, time_spent_sec)
    VALUES (?, ?, ?, ?, datetime('now'), ?)
    ON CONFLICT(attempt_id, question_id) DO UPDATE SET
      option_id      = excluded.option_id,
      flagged        = excluded.flagged,
      answered_at    = excluded.answered_at,
      time_spent_sec = excluded.time_spent_sec
  `);

  const batchInsert = db.transaction((rows) => {
    for (const row of rows) {
      if (!row.question_id) continue;
      const q = db.prepare('SELECT id FROM questions WHERE id = ? AND active = 1').get(row.question_id);
      if (!q) continue;
      if (row.option_id) {
        const opt = db.prepare('SELECT id FROM options WHERE id = ? AND question_id = ?')
          .get(row.option_id, row.question_id);
        if (!opt) continue;
      }
      upsert.run(
        attempt.id,
        row.question_id,
        row.option_id      || null,
        row.flagged        ? 1 : 0,
        row.time_spent_sec || 0
      );
    }
  });

  batchInsert(answers);
  res.json({ ok: true });
});

module.exports = router;
