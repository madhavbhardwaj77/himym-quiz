const express = require('express');
const router  = express.Router();

/**
 * Seeded Fisher-Yates shuffle.
 * Uses a simple LCG so the same seed always produces the same order,
 * giving every team a consistent (but team-unique) option order.
 */
function seededShuffle(arr, seed) {
  const a = [...arr];
  let s = seed >>> 0; // treat as unsigned 32-bit
  for (let i = a.length - 1; i > 0; i--) {
    s = Math.imul(s, 1664525) + 1013904223 | 0;
    const j = Math.abs(s) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getDurationMs(db) {
  const s = db.prepare("SELECT value FROM settings WHERE key = 'quiz_duration_minutes'").get();
  const mins = parseFloat(s ? s.value : (process.env.QUIZ_DURATION_MINUTES || '40'));
  return mins * 60 * 1000;
}

function autoSubmit(db, attempt) {
  const answers = db.prepare('SELECT * FROM answers WHERE attempt_id = ?').all(attempt.id);
  let score = 0;
  for (const answer of answers) {
    if (answer.option_id) {
      const opt = db.prepare('SELECT weight FROM options WHERE id = ?').get(answer.option_id);
      const q   = db.prepare('SELECT multiplier FROM questions WHERE id = ?').get(answer.question_id);
      if (opt && q) score += opt.weight * q.multiplier;
    }
  }
  db.prepare('UPDATE attempts SET status = ?, submitted_at = ?, score = ? WHERE id = ?')
    .run('submitted', new Date().toISOString(), score, attempt.id);
  return score;
}

// GET /api/questions
router.get('/', (req, res) => {
  const db    = req.app.locals.db;
  const token = req.headers['x-team-token'];
  if (!token) return res.status(401).json({ error: 'No token' });

  const team = db.prepare('SELECT * FROM teams WHERE token = ?').get(token);
  if (!team) return res.status(401).json({ error: 'Invalid token' });

  const attempt = db.prepare('SELECT * FROM attempts WHERE team_id = ?').get(team.id);
  if (!attempt) return res.status(403).json({ error: 'Start attempt first' });

  const durationMs = getDurationMs(db);
  const startedAt  = new Date(attempt.started_at).getTime();
  const expired    = Date.now() - startedAt > durationMs;

  if (expired && attempt.status === 'in_progress') {
    autoSubmit(db, attempt);
    // Re-fetch updated attempt
    const updated = db.prepare('SELECT * FROM attempts WHERE id = ?').get(attempt.id);
    Object.assign(attempt, updated);
  }

  const questions = db.prepare(
    'SELECT id, position, section, sdg, text, code, multiplier FROM questions WHERE active = 1 ORDER BY position'
  ).all();

  const result = questions.map(q => {
    const rawOptions = db.prepare(
      'SELECT id, label, text FROM options WHERE question_id = ? ORDER BY label'
    ).all(q.id);
    // Deterministic per-team shuffle
    const seed     = (team.id * 1000 + q.id) >>> 0;
    const shuffled = seededShuffle(rawOptions, seed);
    return { ...q, options: shuffled };
  });

  // Existing answers for this attempt (so frontend can restore state)
  const existingAnswers = db.prepare(
    'SELECT question_id, option_id, flagged, time_spent_sec FROM answers WHERE attempt_id = ?'
  ).all(attempt.id);

  const answersMap = {};
  for (const a of existingAnswers) {
    answersMap[a.question_id] = {
      option_id:     a.option_id,
      flagged:       a.flagged,
      time_spent_sec: a.time_spent_sec
    };
  }

  res.json({
    questions: result,
    answers: answersMap,
    attempt: {
      startedAt:   attempt.started_at,
      status:      attempt.status,
      durationMs,
      tabSwitches: attempt.tab_switches || 0,
      score:       attempt.score || 0
    }
  });
});

module.exports = router;
