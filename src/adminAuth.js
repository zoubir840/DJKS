'use strict';

const crypto = require('crypto');

// Accès admin par simple code (PIN), indépendant des comptes utilisateurs —
// pratique pour l'exploitant du site. Défini via ADMIN_CODE dans .env ;
// si absent, la section admin est simplement désactivée (404 partout).
function isAdminConfigured() {
  return Boolean(process.env.ADMIN_CODE);
}

// Comparaison à temps constant (via un hash de longueur fixe, pour éviter
// tout problème de longueur différente entre le code attendu et la saisie)
// afin de ne pas fuiter d'information via le temps de réponse.
function codeMatches(input) {
  const expected = String(process.env.ADMIN_CODE || '');
  if (!expected) return false;
  const given = String(input || '');
  const a = crypto.createHash('sha256').update(expected).digest();
  const b = crypto.createHash('sha256').update(given).digest();
  return crypto.timingSafeEqual(a, b);
}

function requireAdmin(req, res, next) {
  if (!isAdminConfigured()) {
    return res.status(404).render('error', {
      code: 404,
      title: 'Page introuvable',
      message: "Cette page n'existe pas.",
    });
  }
  if (!req.session.isAdmin) {
    return res.redirect('/admin');
  }
  next();
}

module.exports = { isAdminConfigured, codeMatches, requireAdmin };
