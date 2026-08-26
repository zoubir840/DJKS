'use strict';

const crypto = require('crypto');

/**
 * Protection CSRF légère basée sur un jeton par session (pattern
 * synchronizer token). Un jeton est généré à la première visite et exposé
 * à toutes les vues via res.locals.csrfToken ; chaque formulaire POST doit
 * le renvoyer dans un champ caché `_csrf`.
 */
function ensureToken(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(24).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

function verifyToken(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const sent = req.body && req.body._csrf;
  if (!sent || sent !== req.session.csrfToken) {
    return res.status(403).render('error', {
      code: 403,
      title: 'Requête invalide',
      message: 'Ta session a expiré ou le formulaire est invalide. Recharge la page et réessaie.',
      user: req.user || null,
    });
  }
  next();
}

module.exports = { ensureToken, verifyToken };
