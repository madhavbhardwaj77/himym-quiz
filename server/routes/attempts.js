const express = require('express');
const router = express.Router();

function getTeam(db, token) {
  return db.prepare('SELECT * FROM teams WHERE token = ?').get(token);
}

function getDurationMs(db) {
  const setting = db.prepare("SELECT value FROM settings WHERE key = 'quiz_duration_minutes'").get();
  const mins = parseFloat(setting ? setting.value : (process.env.QUIZ_DURATION_MINUTES || '40'));
  return mins * 60 * 1000;
}

function calcScore(db, attemptId) {
  const answers = db.prepare('SELECT * FROM answers WHERE attempt_id = ?').all(attemptId);
  let score = 0;
  for (const answer of answers) {
    if (answer.option_id) {
      const opt = db.prepare('SELECT weight FROM options WHERE id = ?').get(answer.option_id);
      const q   = db.prepare('SELECT multiplier FROM questions WHERE id = ?').get(answer.question_id);
      if (opt && q) score += opt.weight * q.multiplier;
    }
  }
  return score;
}

// POST /api/attempts/start
router.post('/start', (req, res) => {
  const db    = req.app.locals.db;
  const token = req.headers['x-team-token'];
  if (!token) return res.status(401).json({ error: 'No token' });

  const quizOpen = db.prepare("SELECT value FROM settings WHERE key = 'quiz_open'").get();
  if (!quizOpen || quizOpen.value !== 'true') {
    return res.status(403).json({ error: 'Quiz is not open' });
  }

  const team = getTeam(db, token);
  if (!team) return res.status(401).json({ error: 'Invalid token' });

  const existing = db.prepare('SELECT * FROM attempts WHERE team_id = ?').get(team.id);
  if (existing) {
    return res.json({
      attemptId:   existing.id,
      startedAt:   existing.started_at,
      status:      existing.status,
      durationMs:  getDurationMs(db),
      tabSwitches: existing.tab_switches || 0,
      score:       existing.score || 0
    });
  }

  const now    = new Date().toISOString();
  const result = db.prepare(
    'INSERT INTO attempts (team_id, started_at, status) VALUES (?, ?, ?)'
  ).run(team.id, now, 'in_progress');

  res.json({
    attemptId:  result.lastInsertRowid,
    startedAt:  now,
    status:     'in_progress',
    durationMs: getDurationMs(db)
  });
});

// POST /api/attempts/submit
router.post('/submit', (req, res) => {
  const db    = req.app.locals.db;
  const token = req.headers['x-team-token'];
  if (!token) return res.status(401).json({ error: 'No token' });

  const team = getTeam(db, token);
  if (!team) return res.status(401).json({ error: 'Invalid token' });

  const attempt = db.prepare('SELECT * FROM attempts WHERE team_id = ?').get(team.id);
  if (!attempt) return res.status(404).json({ error: 'No attempt found' });

  if (attempt.status === 'submitted') {
    return res.json({ score: attempt.score, alreadySubmitted: true });
  }

  const score       = calcScore(db, attempt.id);
  const submittedAt = new Date().toISOString();
  const timeTaken   = Math.round(
    (new Date(submittedAt) - new Date(attempt.started_at)) / 1000
  );

  db.prepare(
    'UPDATE attempts SET status = ?, submitted_at = ?, score = ? WHERE id = ?'
  ).run('submitted', submittedAt, score, attempt.id);

  res.json({ score, credits: score, timeTaken });
});

// GET /api/attempts/me  – current attempt status
router.get('/me', (req, res) => {
  const db    = req.app.locals.db;
  const token = req.headers['x-team-token'];
  if (!token) return res.status(401).json({ error: 'No token' });

  const team = getTeam(db, token);
  if (!team) return res.status(401).json({ error: 'Invalid token' });

  const attempt = db.prepare('SELECT * FROM attempts WHERE team_id = ?').get(team.id);
  if (!attempt) {
    return res.json({
      status: 'not_started',
      durationMs: getDurationMs(db)
    });
  }

  res.json({
    attemptId:    attempt.id,
    startedAt:    attempt.started_at,
    submittedAt:  attempt.submitted_at,
    status:       attempt.status,
    score:        attempt.score,
    tabSwitches:  attempt.tab_switches,
    durationMs:   getDurationMs(db)
  });
});

module.exports = router;
