const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

// POST /api/teams  – register a new team
router.post('/', (req, res) => {
  const db = req.app.locals.db;
  const { name, members, route } = req.body;

  if (!name || !members || !route) {
    return res.status(400).json({ error: 'name, members and route are required' });
  }
  if (typeof name !== 'string' || name.trim().length === 0) {
    return res.status(400).json({ error: 'Invalid team name' });
  }
  if (!Array.isArray(members) || members.length < 2 || members.length > 4) {
    return res.status(400).json({ error: 'Team must have 2-4 members' });
  }
  if (![1, 2, 3, 4, 5].includes(Number(route))) {
    return res.status(400).json({ error: 'Route must be 1-5' });
  }

  const token = uuidv4();
  try {
    const result = db.prepare(
      'INSERT INTO teams (name, members_json, route, token) VALUES (?, ?, ?, ?)'
    ).run(name.trim(), JSON.stringify(members), Number(route), token);

    res.json({ id: result.lastInsertRowid, name: name.trim(), token });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Team name already taken' });
    }
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
