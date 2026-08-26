'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const db = require('./src/db');
const { encrypt, decrypt, maskToken } = require('./src/crypto');
const { requireAuth, attachUser } = require('./src/auth');
const botManager = require('./src/botManager');

const app = express();
const PORT = process.env.PORT || 3000;

const STATUS_LABELS = {
  online: 'En ligne',
  starting: 'Démarrage…',
  stopped: 'Arrêté',
  error: 'Erreur',
};

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    name: 'djks.sid',
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 24 * 30 },
  })
);

app.use(attachUser(db));

// --- Flash messages simples via la session ---
app.use((req, res, next) => {
  const flash = req.session.flash || null;
  req.session.flash = null;
  res.locals.flash = flash;
  req.setFlash = (type, message) => {
    req.session.flash = { [type]: message };
  };
  next();
});

app.use((req, res, next) => {
  res.locals.statusLabels = STATUS_LABELS;
  next();
});

// --------------------------------------------------------------------------
// Pages publiques
// --------------------------------------------------------------------------

app.get('/', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('landing');
});

app.get('/register', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('register', { flash: res.locals.flash });
});

app.post('/register', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const { password, password2 } = req.body;

  if (!email || !password || !password2) {
    req.setFlash('error', 'Merci de remplir tous les champs.');
    return res.redirect('/register');
  }
  if (password.length < 8) {
    req.setFlash('error', 'Le mot de passe doit contenir au moins 8 caractères.');
    return res.redirect('/register');
  }
  if (password !== password2) {
    req.setFlash('error', 'Les mots de passe ne correspondent pas.');
    return res.redirect('/register');
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    req.setFlash('error', 'Un compte existe déjà avec cet email.');
    return res.redirect('/register');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const info = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, passwordHash);
  req.session.userId = info.lastInsertRowid;
  res.redirect('/dashboard');
});

app.get('/login', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('login', { flash: res.locals.flash });
});

app.post('/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const { password } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const ok = user ? await bcrypt.compare(password || '', user.password_hash) : false;
  if (!ok) {
    req.setFlash('error', 'Email ou mot de passe incorrect.');
    return res.redirect('/login');
  }
  req.session.userId = user.id;
  res.redirect('/dashboard');
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// --------------------------------------------------------------------------
// Tableau de bord
// --------------------------------------------------------------------------

app.get('/dashboard', requireAuth, (req, res) => {
  const bots = db
    .prepare(
      `SELECT b.*, (SELECT COUNT(*) FROM commands c WHERE c.bot_id = b.id) AS command_count
       FROM bots b WHERE b.user_id = ? ORDER BY b.created_at DESC`
    )
    .all(req.user.id);
  res.render('dashboard', { bots, flash: res.locals.flash });
});

function loadOwnedBot(req, res) {
  const bot = db.prepare('SELECT * FROM bots WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!bot) {
    res.status(404).render('landing');
    return null;
  }
  return bot;
}

app.get('/bots/new', requireAuth, (req, res) => {
  res.render('bot_new', { flash: res.locals.flash });
});

app.post('/bots', requireAuth, (req, res) => {
  const name = String(req.body.name || '').trim();
  const token = String(req.body.token || '').trim();
  const prefix = String(req.body.prefix || '!').trim() || '!';

  if (!name || !token) {
    req.setFlash('error', 'Le nom et le token sont obligatoires.');
    return res.redirect('/bots/new');
  }

  const info = db
    .prepare('INSERT INTO bots (user_id, name, token_encrypted, prefix) VALUES (?, ?, ?, ?)')
    .run(req.user.id, name, encrypt(token), prefix);

  req.setFlash('success', 'Bot ajouté ! Tu peux maintenant le démarrer.');
  res.redirect(`/bots/${info.lastInsertRowid}`);
});

app.get('/bots/:id', requireAuth, (req, res) => {
  const bot = loadOwnedBot(req, res);
  if (!bot) return;
  const commands = db.prepare('SELECT * FROM commands WHERE bot_id = ? ORDER BY created_at DESC').all(bot.id);
  const token = decrypt(bot.token_encrypted);
  res.render('bot_detail', {
    bot,
    commands,
    maskedToken: maskToken(token),
    logs: botManager.getLogs(bot.id),
    flash: res.locals.flash,
  });
});

app.get('/bots/:id/token', requireAuth, (req, res) => {
  const bot = loadOwnedBot(req, res);
  if (!bot) return;
  res.render('bot_token', { bot, flash: res.locals.flash });
});

app.post('/bots/:id/token', requireAuth, (req, res) => {
  const bot = loadOwnedBot(req, res);
  if (!bot) return;
  const token = String(req.body.token || '').trim();
  if (!token) {
    req.setFlash('error', 'Le token ne peut pas être vide.');
    return res.redirect(`/bots/${bot.id}/token`);
  }
  db.prepare('UPDATE bots SET token_encrypted = ? WHERE id = ?').run(encrypt(token), bot.id);
  req.setFlash('success', 'Token mis à jour. Redémarre le bot pour l\'appliquer.');
  res.redirect(`/bots/${bot.id}`);
});

app.post('/bots/:id/settings', requireAuth, (req, res) => {
  const bot = loadOwnedBot(req, res);
  if (!bot) return;
  const name = String(req.body.name || '').trim() || bot.name;
  const prefix = String(req.body.prefix || '').trim() || bot.prefix;
  db.prepare('UPDATE bots SET name = ?, prefix = ? WHERE id = ?').run(name, prefix, bot.id);
  req.setFlash('success', 'Paramètres enregistrés.');
  res.redirect(`/bots/${bot.id}`);
});

app.post('/bots/:id/delete', requireAuth, async (req, res) => {
  const bot = loadOwnedBot(req, res);
  if (!bot) return;
  await botManager.stop(bot.id).catch(() => {});
  db.prepare('DELETE FROM bots WHERE id = ?').run(bot.id);
  req.setFlash('success', 'Bot supprimé.');
  res.redirect('/dashboard');
});

app.post('/bots/:id/start', requireAuth, async (req, res) => {
  const bot = loadOwnedBot(req, res);
  if (!bot) return;
  try {
    await botManager.start(bot.id);
  } catch (err) {
    req.setFlash('error', err.message);
  }
  res.redirect(`/bots/${bot.id}`);
});

app.post('/bots/:id/stop', requireAuth, async (req, res) => {
  const bot = loadOwnedBot(req, res);
  if (!bot) return;
  await botManager.stop(bot.id).catch(() => {});
  res.redirect(`/bots/${bot.id}`);
});

// --- Flux de logs en direct (Server-Sent Events) ---
app.get('/bots/:id/stream', requireAuth, (req, res) => {
  const bot = db.prepare('SELECT id FROM bots WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!bot) return res.status(404).end();

  const botId = Number(bot.id);
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();

  const onLog = ({ botId: id, entry }) => {
    if (id !== botId) return;
    res.write(`event: log\ndata: ${JSON.stringify(entry)}\n\n`);
  };
  const onStatus = ({ botId: id, status }) => {
    if (id !== botId) return;
    res.write(`event: status\ndata: ${JSON.stringify({ status })}\n\n`);
  };

  botManager.on('log', onLog);
  botManager.on('status', onStatus);

  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    botManager.off('log', onLog);
    botManager.off('status', onStatus);
  });
});

// --------------------------------------------------------------------------
// Commandes
// --------------------------------------------------------------------------

app.post('/bots/:id/commands', requireAuth, (req, res) => {
  const bot = loadOwnedBot(req, res);
  if (!bot) return;

  const type = req.body.type === 'slash' ? 'slash' : 'prefix';
  const trigger = String(req.body.trigger || '').trim().toLowerCase().replace(/^\/|^!/, '');
  const description = String(req.body.description || '').trim();
  const response = String(req.body.response || '').trim();

  if (!trigger || !response) {
    req.setFlash('error', 'Le déclencheur et la réponse sont obligatoires.');
    return res.redirect(`/bots/${bot.id}`);
  }
  if (!/^[a-z0-9_-]+$/.test(trigger)) {
    req.setFlash('error', 'Le déclencheur ne peut contenir que des lettres, chiffres, - et _.');
    return res.redirect(`/bots/${bot.id}`);
  }

  db.prepare('INSERT INTO commands (bot_id, trigger, type, description, response) VALUES (?, ?, ?, ?, ?)').run(
    bot.id,
    trigger,
    type,
    description,
    response
  );
  req.setFlash('success', 'Commande ajoutée.');
  res.redirect(`/bots/${bot.id}`);
});

function loadOwnedCommand(req, res, bot) {
  const cmd = db.prepare('SELECT * FROM commands WHERE id = ? AND bot_id = ?').get(req.params.cid, bot.id);
  if (!cmd) {
    res.status(404).end();
    return null;
  }
  return cmd;
}

app.post('/bots/:id/commands/:cid/toggle', requireAuth, (req, res) => {
  const bot = loadOwnedBot(req, res);
  if (!bot) return;
  const cmd = loadOwnedCommand(req, res, bot);
  if (!cmd) return;
  db.prepare('UPDATE commands SET enabled = ? WHERE id = ?').run(cmd.enabled ? 0 : 1, cmd.id);
  res.redirect(`/bots/${bot.id}`);
});

app.post('/bots/:id/commands/:cid/delete', requireAuth, (req, res) => {
  const bot = loadOwnedBot(req, res);
  if (!bot) return;
  const cmd = loadOwnedCommand(req, res, bot);
  if (!cmd) return;
  db.prepare('DELETE FROM commands WHERE id = ?').run(cmd.id);
  req.setFlash('success', 'Commande supprimée.');
  res.redirect(`/bots/${bot.id}`);
});

// --------------------------------------------------------------------------

app.use((req, res) => {
  res.status(404).send('Page introuvable.');
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('Une erreur est survenue.');
});

const server = app.listen(PORT, () => {
  console.log(`DJKS Bots en écoute sur http://localhost:${PORT}`);
});

async function shutdown() {
  console.log('\nArrêt du serveur, extinction des bots actifs…');
  await botManager.stopAll();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
