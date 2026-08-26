'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const SqliteStore = require('better-sqlite3-session-store')(session);

const db = require('./src/db');
const { encrypt, decrypt, maskToken } = require('./src/crypto');
const { requireAuth, attachUser } = require('./src/auth');
const { ensureToken, verifyToken } = require('./src/csrf');
const botManager = require('./src/botManager');
const ai = require('./src/ai');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

const STATUS_LABELS = {
  online: 'En ligne',
  starting: 'Démarrage…',
  stopped: 'Arrêté',
  error: 'Erreur',
};

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);

app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https://cdn.discordapp.com'],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        connectSrc: ["'self'"],
      },
    },
  })
);

app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    store: new SqliteStore({ client: db, expired: { clear: true, intervalMs: 15 * 60 * 1000 } }),
    name: 'djks.sid',
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: IS_PROD, maxAge: 1000 * 60 * 60 * 24 * 30 },
  })
);

app.use(attachUser(db));
app.use(ensureToken);

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

app.use(verifyToken);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Trop de tentatives. Réessaie dans quelques minutes.',
});

const aiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de générations IA. Réessaie dans quelques minutes.' },
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

app.post('/register', authLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const { password, password2 } = req.body;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    req.setFlash('error', 'Merci de saisir une adresse email valide.');
    return res.redirect('/register');
  }
  if (!password || !password2) {
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
  req.session.regenerate((err) => {
    if (err) return res.redirect('/register');
    req.session.userId = info.lastInsertRowid;
    res.redirect('/dashboard');
  });
});

app.get('/login', (req, res) => {
  if (req.user) return res.redirect('/dashboard');
  res.render('login', { flash: res.locals.flash });
});

app.post('/login', authLimiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const { password } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const ok = user ? await bcrypt.compare(password || '', user.password_hash) : false;
  if (!ok) {
    req.setFlash('error', 'Email ou mot de passe incorrect.');
    return res.redirect('/login');
  }
  req.session.regenerate((err) => {
    if (err) return res.redirect('/login');
    req.session.userId = user.id;
    res.redirect('/dashboard');
  });
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// --------------------------------------------------------------------------
// Compte
// --------------------------------------------------------------------------

app.get('/account', requireAuth, (req, res) => {
  res.render('account', { flash: res.locals.flash });
});

app.post('/account/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword, newPassword2 } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

  const ok = await bcrypt.compare(currentPassword || '', user.password_hash);
  if (!ok) {
    req.setFlash('error', 'Mot de passe actuel incorrect.');
    return res.redirect('/account');
  }
  if (!newPassword || newPassword.length < 8) {
    req.setFlash('error', 'Le nouveau mot de passe doit contenir au moins 8 caractères.');
    return res.redirect('/account');
  }
  if (newPassword !== newPassword2) {
    req.setFlash('error', 'Les nouveaux mots de passe ne correspondent pas.');
    return res.redirect('/account');
  }

  const hash = await bcrypt.hash(newPassword, 12);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
  req.setFlash('success', 'Mot de passe mis à jour.');
  res.redirect('/account');
});

app.post('/account/delete', requireAuth, async (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const ok = await bcrypt.compare(req.body.password || '', user.password_hash);
  if (!ok) {
    req.setFlash('error', 'Mot de passe incorrect.');
    return res.redirect('/account');
  }

  const bots = db.prepare('SELECT id FROM bots WHERE user_id = ?').all(req.user.id);
  await Promise.all(bots.map((b) => botManager.stop(b.id).catch(() => {})));
  db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
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
    res.status(404).render('error', {
      code: 404,
      title: 'Bot introuvable',
      message: "Ce bot n'existe pas ou ne t'appartient pas.",
    });
    return null;
  }
  return bot;
}

app.get('/bots/new', requireAuth, (req, res) => {
  res.render('bot_new', { flash: res.locals.flash });
});

app.post('/bots', requireAuth, async (req, res) => {
  const name = String(req.body.name || '').trim();
  const token = String(req.body.token || '').trim();
  const prefix = String(req.body.prefix || '!').trim() || '!';

  if (!name || !token) {
    req.setFlash('error', 'Le nom et le token sont obligatoires.');
    return res.redirect('/bots/new');
  }

  let identity;
  try {
    identity = await botManager.validateToken(token);
  } catch (err) {
    req.setFlash('error', err.message);
    return res.redirect('/bots/new');
  }

  const existing = db.prepare('SELECT id FROM bots WHERE client_id = ?').get(identity.id);
  if (existing) {
    req.setFlash('error', 'Ce bot Discord est déjà enregistré sur le site.');
    return res.redirect('/bots/new');
  }

  const info = db
    .prepare(
      'INSERT INTO bots (user_id, name, token_encrypted, prefix, client_id, username, avatar_url) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(req.user.id, name, encrypt(token), prefix, identity.id, identity.username, identity.avatarUrl);

  req.setFlash('success', 'Bot ajouté ! Tu peux maintenant le démarrer.');
  res.redirect(`/bots/${info.lastInsertRowid}`);
});

app.get('/bots/:id', requireAuth, (req, res) => {
  const bot = loadOwnedBot(req, res);
  if (!bot) return;
  const commands = db.prepare('SELECT * FROM commands WHERE bot_id = ? ORDER BY created_at DESC').all(bot.id);
  const roleMenus = db.prepare('SELECT * FROM role_menus WHERE bot_id = ? ORDER BY created_at DESC').all(bot.id);
  roleMenus.forEach((menu) => {
    menu.options = db.prepare('SELECT * FROM role_menu_options WHERE role_menu_id = ? ORDER BY position, id').all(menu.id);
  });
  let maskedToken;
  try {
    maskedToken = maskToken(decrypt(bot.token_encrypted));
  } catch (err) {
    maskedToken = 'illisible (ENCRYPTION_KEY a changé)';
  }
  const today = new Date().toISOString().slice(0, 10);
  res.render('bot_detail', {
    bot,
    commands,
    roleMenus,
    aiConfigured: ai.isConfigured(),
    aiUsageToday: bot.ai_usage_date === today ? bot.ai_usage_count : 0,
    maskedToken,
    logs: botManager.getLogs(bot.id),
    guilds: botManager.getGuilds(bot.id),
    inviteUrl: bot.client_id ? botManager.inviteUrl(bot.client_id) : null,
    flash: res.locals.flash,
  });
});

app.get('/bots/:id/token', requireAuth, (req, res) => {
  const bot = loadOwnedBot(req, res);
  if (!bot) return;
  res.render('bot_token', { bot, flash: res.locals.flash });
});

app.post('/bots/:id/token', requireAuth, async (req, res) => {
  const bot = loadOwnedBot(req, res);
  if (!bot) return;
  const token = String(req.body.token || '').trim();
  if (!token) {
    req.setFlash('error', 'Le token ne peut pas être vide.');
    return res.redirect(`/bots/${bot.id}/token`);
  }

  let identity;
  try {
    identity = await botManager.validateToken(token);
  } catch (err) {
    req.setFlash('error', err.message);
    return res.redirect(`/bots/${bot.id}/token`);
  }

  db.prepare('UPDATE bots SET token_encrypted = ?, client_id = ?, username = ?, avatar_url = ? WHERE id = ?').run(
    encrypt(token),
    identity.id,
    identity.username,
    identity.avatarUrl,
    bot.id
  );
  req.setFlash('success', "Token mis à jour. Redémarre le bot pour l'appliquer.");
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

app.post('/bots/:id/moderation', requireAuth, (req, res) => {
  const bot = loadOwnedBot(req, res);
  if (!bot) return;
  const enabled = req.body.enabled === '1' ? 1 : 0;
  db.prepare('UPDATE bots SET moderation_enabled = ? WHERE id = ?').run(enabled, bot.id);
  req.setFlash('success', enabled ? 'Modération activée.' : 'Modération désactivée.');
  res.redirect(`/bots/${bot.id}`);
});

app.post('/bots/:id/welcome', requireAuth, (req, res) => {
  const bot = loadOwnedBot(req, res);
  if (!bot) return;
  const enabled = req.body.enabled ? 1 : 0;
  const channelId = String(req.body.channel_id || '').trim();
  const message = String(req.body.message || '').trim() || bot.welcome_message;
  db.prepare('UPDATE bots SET welcome_enabled = ?, welcome_channel_id = ?, welcome_message = ? WHERE id = ?').run(
    enabled,
    channelId || null,
    message,
    bot.id
  );
  req.setFlash('success', 'Message de bienvenue enregistré.');
  res.redirect(`/bots/${bot.id}`);
});

app.post('/bots/:id/leave', requireAuth, (req, res) => {
  const bot = loadOwnedBot(req, res);
  if (!bot) return;
  const enabled = req.body.enabled ? 1 : 0;
  const channelId = String(req.body.channel_id || '').trim();
  const message = String(req.body.message || '').trim() || bot.leave_message;
  db.prepare('UPDATE bots SET leave_enabled = ?, leave_channel_id = ?, leave_message = ? WHERE id = ?').run(
    enabled,
    channelId || null,
    message,
    bot.id
  );
  req.setFlash('success', 'Message de départ enregistré.');
  res.redirect(`/bots/${bot.id}`);
});

app.post('/bots/:id/autorole', requireAuth, (req, res) => {
  const bot = loadOwnedBot(req, res);
  if (!bot) return;
  const enabled = req.body.enabled ? 1 : 0;
  const roleId = String(req.body.role_id || '').trim();
  db.prepare('UPDATE bots SET autorole_enabled = ?, autorole_role_id = ? WHERE id = ?').run(enabled, roleId || null, bot.id);
  req.setFlash('success', 'Rôle automatique enregistré.');
  res.redirect(`/bots/${bot.id}`);
});

app.post('/bots/:id/antispam', requireAuth, (req, res) => {
  const bot = loadOwnedBot(req, res);
  if (!bot) return;
  const enabled = req.body.enabled ? 1 : 0;
  const words = String(req.body.banned_words || '')
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean)
    .join(', ');
  db.prepare('UPDATE bots SET antispam_enabled = ?, banned_words = ? WHERE id = ?').run(enabled, words, bot.id);
  req.setFlash('success', 'Filtre anti-spam enregistré.');
  res.redirect(`/bots/${bot.id}`);
});

app.post('/bots/:id/modlog', requireAuth, (req, res) => {
  const bot = loadOwnedBot(req, res);
  if (!bot) return;
  const channelId = String(req.body.channel_id || '').trim();
  db.prepare('UPDATE bots SET modlog_channel_id = ? WHERE id = ?').run(channelId || null, bot.id);
  req.setFlash('success', 'Salon de logs enregistré.');
  res.redirect(`/bots/${bot.id}`);
});

app.post('/bots/:id/ai', requireAuth, (req, res) => {
  const bot = loadOwnedBot(req, res);
  if (!bot) return;
  const enabled = req.body.enabled ? 1 : 0;
  const persona = String(req.body.persona || '').trim() || bot.ai_persona;
  const trigger = String(req.body.trigger || 'ai')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 20) || 'ai';
  const dailyLimit = Math.min(Math.max(parseInt(req.body.daily_limit, 10) || 150, 1), 5000);
  db.prepare('UPDATE bots SET ai_enabled = ?, ai_persona = ?, ai_trigger = ?, ai_daily_limit = ? WHERE id = ?').run(
    enabled,
    persona,
    trigger,
    dailyLimit,
    bot.id
  );
  req.setFlash('success', 'Assistant IA enregistré.');
  res.redirect(`/bots/${bot.id}`);
});

// --- Générateur de commandes par IA (retourne du JSON, consommé en AJAX) ---
app.post('/bots/:id/commands/generate', requireAuth, aiLimiter, async (req, res) => {
  const bot = db.prepare('SELECT * FROM bots WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!bot) return res.status(404).json({ error: 'Bot introuvable.' });

  const description = String((req.body && req.body.description) || '').trim();
  if (!description) return res.status(400).json({ error: 'Décris la commande que tu veux créer.' });
  if (!ai.isConfigured()) return res.status(400).json({ error: "L'IA n'est pas configurée sur ce serveur (ANTHROPIC_API_KEY manquante)." });

  try {
    const generated = await ai.generateCommand(description, { prefix: bot.prefix });
    res.json(generated);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// --------------------------------------------------------------------------
// Menus de rôles (boutons Discord)
// --------------------------------------------------------------------------

function loadOwnedRoleMenu(req, res, bot) {
  const menu = db.prepare('SELECT * FROM role_menus WHERE id = ? AND bot_id = ?').get(req.params.mid, bot.id);
  if (!menu) {
    res.status(404).end();
    return null;
  }
  return menu;
}

app.post('/bots/:id/role-menus', requireAuth, (req, res) => {
  const bot = loadOwnedBot(req, res);
  if (!bot) return;
  const channelId = String(req.body.channel_id || '').trim();
  const title = String(req.body.title || '').trim() || 'Choisis tes rôles';
  const description = String(req.body.description || '').trim() || 'Clique sur un bouton pour obtenir ou retirer le rôle correspondant.';
  if (!channelId) {
    req.setFlash('error', "L'ID du salon est obligatoire pour créer un menu de rôles.");
    return res.redirect(`/bots/${bot.id}`);
  }
  db.prepare('INSERT INTO role_menus (bot_id, channel_id, title, description) VALUES (?, ?, ?, ?)').run(bot.id, channelId, title, description);
  req.setFlash('success', 'Menu de rôles créé. Ajoute des rôles puis publie-le.');
  res.redirect(`/bots/${bot.id}`);
});

app.post('/bots/:id/role-menus/:mid/delete', requireAuth, (req, res) => {
  const bot = loadOwnedBot(req, res);
  if (!bot) return;
  const menu = loadOwnedRoleMenu(req, res, bot);
  if (!menu) return;
  db.prepare('DELETE FROM role_menus WHERE id = ?').run(menu.id);
  req.setFlash('success', 'Menu de rôles supprimé (le message Discord existant reste tel quel).');
  res.redirect(`/bots/${bot.id}`);
});

app.post('/bots/:id/role-menus/:mid/options', requireAuth, (req, res) => {
  const bot = loadOwnedBot(req, res);
  if (!bot) return;
  const menu = loadOwnedRoleMenu(req, res, bot);
  if (!menu) return;

  const label = String(req.body.label || '').trim();
  const roleId = String(req.body.role_id || '').trim();
  const emoji = String(req.body.emoji || '').trim();
  if (!label || !roleId) {
    req.setFlash('error', 'Le nom et l\'ID du rôle sont obligatoires.');
    return res.redirect(`/bots/${bot.id}`);
  }
  const count = db.prepare('SELECT COUNT(*) AS n FROM role_menu_options WHERE role_menu_id = ?').get(menu.id).n;
  if (count >= 25) {
    req.setFlash('error', 'Un menu de rôles ne peut pas dépasser 25 rôles (limite Discord).');
    return res.redirect(`/bots/${bot.id}`);
  }
  db.prepare('INSERT INTO role_menu_options (role_menu_id, label, emoji, role_id, position) VALUES (?, ?, ?, ?, ?)').run(
    menu.id,
    label.slice(0, 80),
    emoji.slice(0, 8),
    roleId,
    count
  );
  req.setFlash('success', 'Rôle ajouté au menu. Publie (ou republie) le menu pour appliquer.');
  res.redirect(`/bots/${bot.id}`);
});

app.post('/bots/:id/role-menus/:mid/options/:oid/delete', requireAuth, (req, res) => {
  const bot = loadOwnedBot(req, res);
  if (!bot) return;
  const menu = loadOwnedRoleMenu(req, res, bot);
  if (!menu) return;
  const option = db.prepare('SELECT * FROM role_menu_options WHERE id = ? AND role_menu_id = ?').get(req.params.oid, menu.id);
  if (!option) return res.status(404).end();
  db.prepare('DELETE FROM role_menu_options WHERE id = ?').run(option.id);
  req.setFlash('success', 'Rôle retiré du menu. Republie le menu pour appliquer.');
  res.redirect(`/bots/${bot.id}`);
});

app.post('/bots/:id/role-menus/:mid/publish', requireAuth, async (req, res) => {
  const bot = loadOwnedBot(req, res);
  if (!bot) return;
  const menu = loadOwnedRoleMenu(req, res, bot);
  if (!menu) return;
  try {
    await botManager.publishRoleMenu(bot.id, menu.id);
    req.setFlash('success', 'Menu de rôles publié sur Discord.');
  } catch (err) {
    req.setFlash('error', err.message);
  }
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
    db.prepare('UPDATE bots SET autostart = 1 WHERE id = ?').run(bot.id);
  } catch (err) {
    req.setFlash('error', err.message);
  }
  res.redirect(`/bots/${bot.id}`);
});

app.post('/bots/:id/stop', requireAuth, async (req, res) => {
  const bot = loadOwnedBot(req, res);
  if (!bot) return;
  await botManager.stop(bot.id).catch(() => {});
  db.prepare('UPDATE bots SET autostart = 0 WHERE id = ?').run(bot.id);
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
  const onGuilds = ({ botId: id, guilds }) => {
    if (id !== botId) return;
    res.write(`event: guilds\ndata: ${JSON.stringify({ guilds })}\n\n`);
  };

  botManager.on('log', onLog);
  botManager.on('status', onStatus);
  botManager.on('guilds', onGuilds);

  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    botManager.off('log', onLog);
    botManager.off('status', onStatus);
    botManager.off('guilds', onGuilds);
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
  const responseType = req.body.response_type === 'embed' ? 'embed' : 'text';
  const embedTitle = String(req.body.embed_title || '').trim();
  const embedColor = /^#[0-9a-fA-F]{6}$/.test(req.body.embed_color || '') ? req.body.embed_color : '#5865F2';
  const cooldown = Math.min(Math.max(parseInt(req.body.cooldown_seconds, 10) || 0, 0), 3600);
  const allowedRoleId = String(req.body.allowed_role_id || '').trim() || null;

  if (!trigger || !response) {
    req.setFlash('error', 'Le déclencheur et la réponse sont obligatoires.');
    return res.redirect(`/bots/${bot.id}`);
  }
  if (!/^[a-z0-9_-]+$/.test(trigger)) {
    req.setFlash('error', 'Le déclencheur ne peut contenir que des lettres, chiffres, - et _.');
    return res.redirect(`/bots/${bot.id}`);
  }
  if (['help', 'kick', 'ban', 'clear'].includes(trigger) || (bot.ai_enabled && trigger === (bot.ai_trigger || 'ai').toLowerCase())) {
    req.setFlash('error', `"${trigger}" est réservé (aide, modération ou assistant IA). Choisis un autre nom.`);
    return res.redirect(`/bots/${bot.id}`);
  }

  db.prepare(
    `INSERT INTO commands (bot_id, trigger, type, description, response, response_type, embed_title, embed_color, cooldown_seconds, allowed_role_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(bot.id, trigger, type, description, response, responseType, embedTitle, embedColor, cooldown, allowedRoleId);

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
  res.status(404).render('error', {
    code: 404,
    title: 'Page introuvable',
    message: "Cette page n'existe pas.",
  });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', {
    code: 500,
    title: 'Erreur serveur',
    message: "Une erreur inattendue est survenue. Réessaie dans quelques instants.",
  });
});

const server = app.listen(PORT, () => {
  console.log(`DJKS Bots en écoute sur http://localhost:${PORT}`);
  autostartBots();
});

async function autostartBots() {
  const bots = db.prepare('SELECT id, name FROM bots WHERE autostart = 1').all();
  for (const bot of bots) {
    try {
      await botManager.start(bot.id);
      console.log(`[autostart] "${bot.name}" redémarré.`);
    } catch (err) {
      console.warn(`[autostart] Échec pour "${bot.name}" : ${err.message}`);
    }
  }
}

async function shutdown() {
  console.log('\nArrêt du serveur, extinction des bots actifs…');
  await botManager.stopAll();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
