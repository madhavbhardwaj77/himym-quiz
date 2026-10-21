const express = require('express');
const router = express.Router();

// POST /api/events  — log anti-cheat events
router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const token = req.headers['x-team-token'];
  if (!token) return res.status(401).json({ error: 'No token' });

  const team = db.prepare('SELECT * FROM teams WHERE token = ?').get(token);
  if (!team) return res.status(401).json({ error: 'Invalid token' });

  const attempt = db.prepare('SELECT * FROM attempts WHERE team_id = ?').get(team.id);
  if (!attempt || attempt.status === 'submitted') {
    return res.json({ ok: true, strikes: attempt ? attempt.tab_switches : 0 });
  }

  const { type } = req.body;
  const trackedTypes = [
    'tab_switch',
    'blur',
    'fullscreen_exit',
    'copy',
    'paste',
    'cut',
    'context_menu',
    'shortcut_attempt',
    'devtools_open',
    'refresh_attempt',
    'page_reload',
    'page_unload'
  ];

  let newCount = attempt.tab_switches || 0;
  if (trackedTypes.includes(type)) {
    db.prepare('UPDATE attempts SET tab_switches = tab_switches + 1 WHERE id = ?').run(attempt.id);
    newCount += 1;
  }

  res.json({ ok: true, strikes: newCount });
});

module.exports = router;
