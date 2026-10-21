const express = require('express');
const router = express.Router();
const { adminAuth } = require('../middleware/auth');

// POST /api/admin/login
router.post('/login', (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  if (password !== adminPassword) {
    return res.status(401).json({ error: 'Wrong password' });
  }
  const token = Buffer.from(adminPassword).toString('base64');
  res.json({ token });
});

// All routes below require admin authentication
router.use(adminAuth);

// GET /api/admin/leaderboard
router.get('/leaderboard', (req, res) => {
  const db = req.app.locals.db;
  const teams = db.prepare(`
    SELECT t.id, t.name, t.route, t.members_json, t.created_at,
           a.id as attempt_id, a.started_at, a.submitted_at, a.score, a.tab_switches, a.status,
           CASE WHEN a.submitted_at IS NOT NULL
                THEN ROUND((julianday(a.submitted_at) - julianday(a.started_at)) * 86400)
                ELSE NULL END as time_taken_sec
    FROM teams t
    LEFT JOIN attempts a ON a.team_id = t.id
    ORDER BY COALESCE(a.score, -1) DESC,
             CASE WHEN a.submitted_at IS NOT NULL THEN julianday(a.submitted_at) ELSE 999999 END ASC,
             t.id ASC
  `).all();

  res.json(teams.map(t => ({
    ...t,
    members: JSON.parse(t.members_json || '[]'),
    status: t.status || 'not_started'
  })));
});

// GET /api/admin/teams/:id
router.get('/teams/:id', (req, res) => {
  const db = req.app.locals.db;
  const team = db.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.id);
  if (!team) return res.status(404).json({ error: 'Not found' });

  const attempt = db.prepare('SELECT * FROM attempts WHERE team_id = ?').get(team.id);
  let answers = [];
  if (attempt) {
    const rawAnswers = db.prepare('SELECT * FROM answers WHERE attempt_id = ?').all(attempt.id);
    answers = rawAnswers.map(a => {
      const q = db.prepare('SELECT id, position, section, text, multiplier FROM questions WHERE id = ?').get(a.question_id);
      const opt = a.option_id ? db.prepare('SELECT id, label, text, weight FROM options WHERE id = ?').get(a.option_id) : null;
      const weightEarned = opt && q ? (opt.weight * q.multiplier) : 0;
      return {
        ...a,
        question: q,
        selectedOption: opt,
        weightEarned
      };
    });
  }

  res.json({
    team: { ...team, members: JSON.parse(team.members_json || '[]') },
    attempt,
    answers
  });
});

// GET /api/admin/questions
router.get('/questions', (req, res) => {
  const db = req.app.locals.db;
  const questions = db.prepare('SELECT * FROM questions ORDER BY position ASC, id ASC').all();
  const result = questions.map(q => ({
    ...q,
    options: db.prepare('SELECT * FROM options WHERE question_id = ? ORDER BY label ASC').all(q.id)
  }));
  res.json(result);
});

// POST /api/admin/questions
router.post('/questions', (req, res) => {
  const db = req.app.locals.db;
  const { position, section, sdg, text, code, multiplier, explanation, options } = req.body;
  if (!text || !section || !sdg) {
    return res.status(400).json({ error: 'text, section, sdg required' });
  }

  const maxPos = db.prepare('SELECT MAX(position) as m FROM questions').get().m || 0;
  const targetPos = position || maxPos + 1;

  const insertQ = db.prepare(`
    INSERT INTO questions (position, section, sdg, text, code, multiplier, explanation, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `);

  const insertOpt = db.prepare(`
    INSERT INTO options (question_id, label, text, weight)
    VALUES (?, ?, ?, ?)
  `);

  const doInsert = db.transaction(() => {
    const result = insertQ.run(
      targetPos,
      section,
      sdg,
      text,
      code || null,
      multiplier !== undefined ? multiplier : 1,
      explanation || null
    );
    const newId = result.lastInsertRowid;

    if (options && Array.isArray(options)) {
      for (const opt of options) {
        insertOpt.run(newId, opt.label, opt.text, opt.weight || 0);
      }
    }
    return newId;
  });

  const id = doInsert();
  res.json({ id });
});

// PUT /api/admin/questions/:id
router.put('/questions/:id', (req, res) => {
  const db = req.app.locals.db;
  const { position, section, sdg, text, code, multiplier, explanation, active } = req.body;

  const current = db.prepare('SELECT * FROM questions WHERE id = ?').get(req.params.id);
  if (!current) return res.status(404).json({ error: 'Question not found' });

  db.prepare(`
    UPDATE questions SET
      position = COALESCE(?, position),
      section = COALESCE(?, section),
      sdg = COALESCE(?, sdg),
      text = COALESCE(?, text),
      code = ?,
      multiplier = COALESCE(?, multiplier),
      explanation = COALESCE(?, explanation),
      active = COALESCE(?, active)
    WHERE id = ?
  `).run(
    position !== undefined ? position : current.position,
    section !== undefined ? section : current.section,
    sdg !== undefined ? sdg : current.sdg,
    text !== undefined ? text : current.text,
    code !== undefined ? (code || null) : current.code,
    multiplier !== undefined ? multiplier : current.multiplier,
    explanation !== undefined ? explanation : current.explanation,
    active !== undefined ? active : current.active,
    req.params.id
  );

  res.json({ ok: true });
});

// DELETE /api/admin/questions/:id
router.delete('/questions/:id', (req, res) => {
  const db = req.app.locals.db;
  db.prepare('DELETE FROM options WHERE question_id = ?').run(req.params.id);
  db.prepare('DELETE FROM answers WHERE question_id = ?').run(req.params.id);
  db.prepare('DELETE FROM questions WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// PUT /api/admin/questions/:id/reorder
router.put('/questions/:id/reorder', (req, res) => {
  const db = req.app.locals.db;
  const { newPosition } = req.body;
  const q = db.prepare('SELECT * FROM questions WHERE id = ?').get(req.params.id);
  if (!q) return res.status(404).json({ error: 'Not found' });

  const oldPos = q.position;
  const doReorder = db.transaction(() => {
    if (newPosition > oldPos) {
      db.prepare('UPDATE questions SET position = position - 1 WHERE position > ? AND position <= ?').run(oldPos, newPosition);
    } else {
      db.prepare('UPDATE questions SET position = position + 1 WHERE position >= ? AND position < ?').run(newPosition, oldPos);
    }
    db.prepare('UPDATE questions SET position = ? WHERE id = ?').run(newPosition, req.params.id);
  });
  doReorder();
  res.json({ ok: true });
});

// PUT /api/admin/options/:id
router.put('/options/:id', (req, res) => {
  const db = req.app.locals.db;
  const { text, weight } = req.body;
  const opt = db.prepare('SELECT * FROM options WHERE id = ?').get(req.params.id);
  if (!opt) return res.status(404).json({ error: 'Option not found' });

  db.prepare(`
    UPDATE options SET
      text = COALESCE(?, text),
      weight = COALESCE(?, weight)
    WHERE id = ?
  `).run(
    text !== undefined ? text : opt.text,
    weight !== undefined ? weight : opt.weight,
    req.params.id
  );

  res.json({ ok: true });
});

// GET /api/admin/settings
router.get('/settings', (req, res) => {
  const db = req.app.locals.db;
  const settings = db.prepare('SELECT * FROM settings').all();
  const obj = {};
  for (const s of settings) obj[s.key] = s.value;
  res.json(obj);
});

// PUT /api/admin/settings
router.put('/settings', (req, res) => {
  const db = req.app.locals.db;
  const { quiz_open, quiz_duration_minutes } = req.body;
  if (quiz_open !== undefined) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('quiz_open', ?)").run(String(quiz_open));
  }
  if (quiz_duration_minutes !== undefined) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('quiz_duration_minutes', ?)").run(String(quiz_duration_minutes));
  }
  res.json({ ok: true });
});

// POST /api/admin/reset/team/:id
router.post('/reset/team/:id', (req, res) => {
  const db = req.app.locals.db;
  const attempt = db.prepare('SELECT id FROM attempts WHERE team_id = ?').get(req.params.id);
  if (attempt) {
    db.prepare('DELETE FROM answers WHERE attempt_id = ?').run(attempt.id);
    db.prepare('DELETE FROM attempts WHERE id = ?').run(attempt.id);
  }
  res.json({ ok: true });
});

// POST /api/admin/reset/all
router.post('/reset/all', (req, res) => {
  const db = req.app.locals.db;
  const { confirm } = req.body;
  if (confirm !== 'RESET_ALL') {
    return res.status(400).json({ error: 'Confirmation required: must type RESET_ALL' });
  }
  const doReset = db.transaction(() => {
    db.exec('DELETE FROM answers; DELETE FROM attempts; DELETE FROM teams;');
  });
  doReset();
  res.json({ ok: true });
});

// GET /api/admin/export/csv
router.get('/export/csv', (req, res) => {
  const db = req.app.locals.db;
  const teams = db.prepare(`
    SELECT t.name, t.members_json, t.route,
           COALESCE(a.score, 0) as score,
           COALESCE(a.score, 0) as credits,
           CASE WHEN a.submitted_at IS NOT NULL
                THEN ROUND((julianday(a.submitted_at) - julianday(a.started_at)) * 86400)
                ELSE NULL END as time_taken_sec,
           COALESCE(a.tab_switches, 0) as tab_switches,
           COALESCE(a.status, 'not_started') as status
    FROM teams t
    LEFT JOIN attempts a ON a.team_id = t.id
    ORDER BY t.name ASC
  `).all();

  const rows = [
    'Team Name,Members,Route,Score,Credits,Time Taken (s),Tab Switches,Status'
  ];
  for (const t of teams) {
    const members = JSON.parse(t.members_json || '[]').join(' | ');
    const safeName = String(t.name).replace(/"/g, '""');
    const safeMembers = String(members).replace(/"/g, '""');
    rows.push(`"${safeName}","${safeMembers}",${t.route},${t.score},${t.credits},${t.time_taken_sec || ''},${t.tab_switches},${t.status}`);
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="quiz-results.csv"');
  res.send(rows.join('\r\n'));
});

// GET /api/admin/export/questions
router.get('/export/questions', (req, res) => {
  const db = req.app.locals.db;
  const questions = db.prepare('SELECT * FROM questions ORDER BY position ASC').all();
  const result = questions.map(q => ({
    ...q,
    options: db.prepare('SELECT id, label, text, weight FROM options WHERE question_id = ? ORDER BY label ASC').all(q.id)
  }));
  res.json(result);
});

// POST /api/admin/import/questions
router.post('/import/questions', (req, res) => {
  const db = req.app.locals.db;
  const { questions, replace } = req.body;
  if (!Array.isArray(questions)) {
    return res.status(400).json({ error: 'questions array required' });
  }

  const insertQ = db.prepare(`
    INSERT INTO questions (position, section, sdg, text, code, multiplier, explanation, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertOpt = db.prepare(`
    INSERT INTO options (question_id, label, text, weight)
    VALUES (?, ?, ?, ?)
  `);

  const doImport = db.transaction(() => {
    if (replace) {
      db.exec('DELETE FROM answers; DELETE FROM options; DELETE FROM questions;');
    }
    for (const q of questions) {
      const result = insertQ.run(
        q.position,
        q.section,
        q.sdg,
        q.text,
        q.code || null,
        q.multiplier !== undefined ? q.multiplier : 1,
        q.explanation || null,
        q.active !== undefined ? q.active : 1
      );
      const qId = result.lastInsertRowid;
      if (q.options && Array.isArray(q.options)) {
        for (const opt of q.options) {
          insertOpt.run(qId, opt.label, opt.text, opt.weight || 0);
        }
      }
    }
  });

  doImport();
  res.json({ ok: true, imported: questions.length });
});

module.exports = router;
