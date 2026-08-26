'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'app.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_encrypted TEXT NOT NULL,
  client_id TEXT,
  username TEXT,
  avatar_url TEXT,
  prefix TEXT NOT NULL DEFAULT '!',
  status TEXT NOT NULL DEFAULT 'stopped',
  last_error TEXT,
  autostart INTEGER NOT NULL DEFAULT 0,
  moderation_enabled INTEGER NOT NULL DEFAULT 0,
  welcome_enabled INTEGER NOT NULL DEFAULT 0,
  welcome_channel_id TEXT,
  welcome_message TEXT NOT NULL DEFAULT 'Bienvenue {user} sur **{server}** ! 🎉',
  leave_enabled INTEGER NOT NULL DEFAULT 0,
  leave_channel_id TEXT,
  leave_message TEXT NOT NULL DEFAULT '{username} a quitté **{server}**. 👋',
  total_commands_run INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bot_id INTEGER NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  trigger TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'prefix' CHECK (type IN ('prefix', 'slash')),
  response_type TEXT NOT NULL DEFAULT 'text' CHECK (response_type IN ('text', 'embed')),
  description TEXT NOT NULL DEFAULT '',
  response TEXT NOT NULL,
  embed_title TEXT NOT NULL DEFAULT '',
  embed_color TEXT NOT NULL DEFAULT '#5865F2',
  cooldown_seconds INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  uses_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bots_user ON bots(user_id);
CREATE INDEX IF NOT EXISTS idx_commands_bot ON commands(bot_id);
`);

// --- Migration "à la volée" pour les bases créées par une version antérieure ---
// (ALTER TABLE ... ADD COLUMN est idempotent ici : on ignore l'erreur si la colonne existe déjà.)
function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn('bots', 'username', 'TEXT');
ensureColumn('bots', 'avatar_url', 'TEXT');
ensureColumn('bots', 'autostart', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('bots', 'moderation_enabled', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('bots', 'welcome_enabled', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('bots', 'welcome_channel_id', 'TEXT');
ensureColumn('bots', 'welcome_message', "TEXT NOT NULL DEFAULT 'Bienvenue {user} sur **{server}** ! 🎉'");
ensureColumn('bots', 'leave_enabled', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('bots', 'leave_channel_id', 'TEXT');
ensureColumn('bots', 'leave_message', "TEXT NOT NULL DEFAULT '{username} a quitté **{server}**. 👋'");
ensureColumn('bots', 'total_commands_run', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('bots', 'started_at', 'TEXT');
ensureColumn('commands', 'response_type', "TEXT NOT NULL DEFAULT 'text'");
ensureColumn('commands', 'embed_title', "TEXT NOT NULL DEFAULT ''");
ensureColumn('commands', 'embed_color', "TEXT NOT NULL DEFAULT '#5865F2'");
ensureColumn('commands', 'cooldown_seconds', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('commands', 'uses_count', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('commands', 'last_used_at', 'TEXT');

module.exports = db;
