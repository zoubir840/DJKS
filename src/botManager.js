'use strict';

const { EventEmitter } = require('events');
const { Client, GatewayIntentBits, Partials, REST, Routes, ActivityType } = require('discord.js');
const db = require('./db');
const { decrypt } = require('./crypto');

const MAX_LOG_LINES = 300;

/**
 * Gère le cycle de vie de tous les bots Discord actifs pour ce process :
 * démarrage, arrêt, exécution des commandes personnalisées et journalisation
 * en direct (diffusée au tableau de bord via Server-Sent Events).
 */
class BotManager extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(0);
    /** @type {Map<number, { client: Client, logs: Array<{ts:number, level:string, message:string}> }>} */
    this.instances = new Map();
  }

  isRunning(botId) {
    return this.instances.has(Number(botId));
  }

  getLogs(botId) {
    const inst = this.instances.get(Number(botId));
    return inst ? inst.logs : [];
  }

  _log(botId, level, message) {
    botId = Number(botId);
    let inst = this.instances.get(botId);
    const entry = { ts: Date.now(), level, message };
    if (inst) {
      inst.logs.push(entry);
      if (inst.logs.length > MAX_LOG_LINES) inst.logs.shift();
    }
    this.emit('log', { botId, entry });
  }

  _setStatus(botId, status, lastError = null) {
    db.prepare('UPDATE bots SET status = ?, last_error = ? WHERE id = ?').run(status, lastError, botId);
    this.emit('status', { botId: Number(botId), status });
  }

  buildResponse(template, ctx) {
    return String(template)
      .replaceAll('{user}', ctx.userMention || '')
      .replaceAll('{username}', ctx.username || '')
      .replaceAll('{server}', ctx.serverName || '')
      .replaceAll('{membercount}', ctx.memberCount != null ? String(ctx.memberCount) : '');
  }

  async start(botId) {
    botId = Number(botId);
    if (this.instances.has(botId)) return { ok: true, alreadyRunning: true };

    const bot = db.prepare('SELECT * FROM bots WHERE id = ?').get(botId);
    if (!bot) throw new Error('Bot introuvable');

    let token;
    try {
      token = decrypt(bot.token_encrypted);
    } catch (err) {
      this._setStatus(botId, 'error', 'Impossible de déchiffrer le token (ENCRYPTION_KEY a peut-être changé).');
      throw new Error('Impossible de déchiffrer le token du bot.');
    }

    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
      partials: [Partials.Channel],
    });

    // On enregistre l'instance tout de suite pour éviter les démarrages concurrents,
    // les logs sont bufferisés dès la connexion.
    this.instances.set(botId, { client, logs: [] });
    this._setStatus(botId, 'starting', null);
    this._log(botId, 'info', 'Connexion à Discord en cours…');

    client.once('clientReady', async (c) => {
      this._log(botId, 'success', `Connecté en tant que ${c.user.tag}`);
      db.prepare('UPDATE bots SET client_id = ? WHERE id = ?').run(c.user.id, botId);
      c.user.setPresence({ activities: [{ name: `${bot.prefix}help`, type: ActivityType.Listening }], status: 'online' });

      // Enregistrement des commandes slash auprès de Discord
      const slashCommands = db
        .prepare("SELECT * FROM commands WHERE bot_id = ? AND type = 'slash' AND enabled = 1")
        .all(botId);
      if (slashCommands.length) {
        try {
          const rest = new REST({ version: '10' }).setToken(token);
          await rest.put(Routes.applicationCommands(c.user.id), {
            body: slashCommands.map((cmd) => ({
              name: cmd.trigger,
              description: cmd.description || 'Commande personnalisée',
            })),
          });
          this._log(botId, 'info', `${slashCommands.length} commande(s) slash enregistrée(s) auprès de Discord.`);
        } catch (err) {
          this._log(botId, 'error', `Échec de l'enregistrement des commandes slash : ${err.message}`);
        }
      }

      this._setStatus(botId, 'online', null);
    });

    client.on('messageCreate', async (message) => {
      try {
        if (message.author.bot) return;
        const currentBot = db.prepare('SELECT * FROM bots WHERE id = ?').get(botId);
        if (!currentBot) return;
        const prefix = currentBot.prefix || '!';
        if (!message.content.startsWith(prefix)) return;

        const withoutPrefix = message.content.slice(prefix.length).trim();
        const [triggerRaw] = withoutPrefix.split(/\s+/);
        const trigger = (triggerRaw || '').toLowerCase();
        if (!trigger) return;

        if (trigger === 'help') {
          const cmds = db
            .prepare("SELECT * FROM commands WHERE bot_id = ? AND enabled = 1 ORDER BY trigger")
            .all(botId);
          const lines = cmds.map((c) => `**${prefix}${c.trigger}** — ${c.description || 'Sans description'}`);
          await message.reply(lines.length ? lines.join('\n') : "Aucune commande n'est configurée pour ce bot.");
          this._log(botId, 'info', `${message.author.tag} a utilisé ${prefix}help`);
          return;
        }

        const cmd = db
          .prepare("SELECT * FROM commands WHERE bot_id = ? AND type = 'prefix' AND enabled = 1 AND lower(trigger) = ?")
          .get(botId, trigger);
        if (!cmd) return;

        const reply = this.buildResponse(cmd.response, {
          userMention: `<@${message.author.id}>`,
          username: message.author.username,
          serverName: message.guild ? message.guild.name : '',
          memberCount: message.guild ? message.guild.memberCount : null,
        });
        await message.reply(reply);
        this._log(botId, 'info', `${message.author.tag} a déclenché "${prefix}${trigger}"`);
      } catch (err) {
        this._log(botId, 'error', `Erreur sur un message : ${err.message}`);
      }
    });

    client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;
      try {
        const cmd = db
          .prepare("SELECT * FROM commands WHERE bot_id = ? AND type = 'slash' AND enabled = 1 AND lower(trigger) = ?")
          .get(botId, interaction.commandName.toLowerCase());
        if (!cmd) {
          await interaction.reply({ content: 'Commande inconnue.', ephemeral: true });
          return;
        }
        const reply = this.buildResponse(cmd.response, {
          userMention: `<@${interaction.user.id}>`,
          username: interaction.user.username,
          serverName: interaction.guild ? interaction.guild.name : '',
          memberCount: interaction.guild ? interaction.guild.memberCount : null,
        });
        await interaction.reply(reply);
        this._log(botId, 'info', `${interaction.user.tag} a utilisé /${interaction.commandName}`);
      } catch (err) {
        this._log(botId, 'error', `Erreur sur une interaction : ${err.message}`);
      }
    });

    client.on('error', (err) => {
      this._log(botId, 'error', `Erreur client : ${err.message}`);
    });

    client.on('shardDisconnect', () => {
      this._log(botId, 'warn', 'Déconnecté de Discord.');
    });

    try {
      await client.login(token);
    } catch (err) {
      this.instances.delete(botId);
      const message = this._friendlyLoginError(err);
      this._log(botId, 'error', `Échec de connexion : ${message}`);
      this._setStatus(botId, 'error', message);
      throw new Error(message);
    }

    return { ok: true };
  }

  _friendlyLoginError(err) {
    const msg = String(err && err.message ? err.message : err);
    if (/An invalid token was provided/i.test(msg) || /TOKEN_INVALID/i.test(msg)) {
      return 'Token invalide. Vérifie que tu as bien copié le token du bot depuis le portail développeur Discord.';
    }
    if (/disallowed intents/i.test(msg)) {
      return "Intents non autorisés : active « MESSAGE CONTENT INTENT » dans l'onglet Bot du portail développeur Discord.";
    }
    return msg;
  }

  async stop(botId) {
    botId = Number(botId);
    const inst = this.instances.get(botId);
    if (!inst) {
      this._setStatus(botId, 'stopped', null);
      return { ok: true, alreadyStopped: true };
    }
    try {
      await inst.client.destroy();
    } finally {
      this.instances.delete(botId);
      this._log(botId, 'info', 'Bot arrêté.');
      this._setStatus(botId, 'stopped', null);
    }
    return { ok: true };
  }

  async stopAll() {
    const ids = Array.from(this.instances.keys());
    await Promise.all(ids.map((id) => this.stop(id).catch(() => {})));
  }
}

module.exports = new BotManager();
