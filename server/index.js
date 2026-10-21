require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const { initDb } = require('./db');
const { seedQuestions } = require('./seed');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Initialize DB
const db = initDb();
seedQuestions(db);

// Make db available to all routes
app.locals.db = db;

// Routes
app.use('/api/teams', require('./routes/teams'));
app.use('/api/attempts', require('./routes/attempts'));
app.use('/api/questions', require('./routes/questions'));
app.use('/api/answers', require('./routes/answers'));
app.use('/api/events', require('./routes/events'));
app.use('/api/admin', require('./routes/admin'));

// SPA fallback for admin
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Quiz app: http://localhost:${PORT}`);
  console.log(`Admin:    http://localhost:${PORT}/admin`);
});
