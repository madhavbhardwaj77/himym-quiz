function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  const password = process.env.ADMIN_PASSWORD || 'admin123';

  // Simple token: base64 of password
  const expectedToken = Buffer.from(password).toString('base64');

  if (token !== expectedToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

module.exports = { adminAuth };
