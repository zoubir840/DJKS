'use strict';

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  next();
}

function attachUser(db) {
  return (req, res, next) => {
    if (req.session.userId) {
      req.user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(req.session.userId) || null;
      if (!req.user) req.session.userId = null;
    } else {
      req.user = null;
    }
    res.locals.user = req.user;
    next();
  };
}

module.exports = { requireAuth, attachUser };
