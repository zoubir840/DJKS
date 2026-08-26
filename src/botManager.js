'use strict';

const { EventEmitter } = require('events');
const {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  ActivityType,
  EmbedBuilder,
  PermissionFlagsBits,
  PermissionsBitField,
} = require('discord.js');
const db = require('./db');
const { decrypt } = require('./crypto');

const MAX_LOG_LINES = 300;
const COOLDOWN_HIT_MESSAGE_TTL = 4000;

// Permissions demandées lors de l'invitation d'un bot sur un serveur :
// de quoi envoyer des messages, des embeds, réagir, et modérer si besoin
// (l'admin du serveur peut toujours ajuster les rôles ensuite).
const INVITE_PERMISSIONS = new PermissionsBitField([
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AddReactions,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
]).bitfield.toString();

function defaultAvatarUrl(discordId) {
  const index = Number((BigInt(discordId) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

/**
 * Vérifie un token Discord auprès de l'API REST (sans ouvrir de connexion
 * gateway) et retourne l'identité du bot. Sert à valider un token à l'ajout
 * ou au changement, avant même de démarrer le bot.
 */
async function validateToken(token) {
  const res = await fetch('https://discord.com/api/v10/users/@me', {
    headers: { Authorization: `Bot ${token}` },
  });
  if (res.status === 401) {
    throw new Error('Token invalide. Vérifie que tu as bien copié le token du bot depuis le portail développeur Discord.');
  }
  if (!res.ok) {
    throw new Error(`Discord a répondu avec une erreur (HTTP ${res.status}). Réessaie dans quelques instants.`);
  }
  const data = await res.json();
  return {
    id: data.id,
    username: data.username,
    avatarUrl: data.avatar
      ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png?size=128`
      : defaultAvatarUrl(data.id),
  };
}

function inviteUrl(clientId) {
  const params = new URLSearchParams({
    client_id: clientId,
    scope: 'bot applications.commands',
    permissions: INVITE_PERMISSIONS,
  });
  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}

/**
 * Gère le cycle de vie de tous les bots Discord actifs pour ce process :
 * démarrage, arrêt, exécution des commandes personnalisées, modération
 * intégrée, messages de bienvenue/départ, et journalisation en direct
 * (diffusée au tableau de bord via Server-Sent Events).
 */
class BotManager extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(0);
    /** @type {Map<number, {client: Client, logs: Array, cooldowns: Map, cooldownNotices: Map}>} */
    this.instances = new Map();
  }

  isRunning(botId) {
    return this.instances.has(Number(botId));
  }

  getLogs(botId) {
    const inst = this.instances.get(Number(botId));
    return inst ? inst.logs : [];
  }

  getGuilds(botId) {
    const inst = this.instances.get(Number(botId));
    if (!inst || !inst.client.isReady()) return [];
    return inst.client.guilds.cache.map((g) => ({
      id: g.id,
      name: g.name,
      memberCount: g.memberCount,
      iconUrl: g.iconURL({ size: 64 }) || null,
    }));
  }

  _log(botId, level, message) {
    botId = Number(botId);
    const inst = this.instances.get(botId);
    const entry = { ts: Date.now(), level, message };
    if (inst) {
      inst.logs.push(entry);
      if (inst.logs.length > MAX_LOG_LINES) inst.logs.shift();
    }
    this.emit('log', { botId, entry });
  }

  _setStatus(botId, status, lastError = null) {
    const startedAt = status === 'online' ? new Date().toISOString() : null;
    if (status === 'online') {
      db.prepare('UPDATE bots SET status = ?, last_error = ?, started_at = ? WHERE id = ?').run(status, lastError, startedAt, botId);
    } else {
      db.prepare('UPDATE bots SET status = ?, last_error = ? WHERE id = ?').run(status, lastError, botId);
    }
    this.emit('status', { botId: Number(botId), status });
  }

  _emitGuilds(botId) {
    this.emit('guilds', { botId: Number(botId), guilds: this.getGuilds(botId) });
  }

  buildResponse(template, ctx) {
    return String(template)
      .replaceAll('{user}', ctx.userMention || '')
      .replaceAll('{username}', ctx.username || '')
      .replaceAll('{server}', ctx.serverName || '')
      .replaceAll('{membercount}', ctx.memberCount != null ? String(ctx.memberCount) : '');
  }

  _buildEmbed(cmd, text) {
    const embed = new EmbedBuilder().setDescription(text || null);
    if (cmd.embed_title) embed.setTitle(cmd.embed_title);
    if (cmd.embed_color && /^#?[0-9a-fA-F]{6}$/.test(cmd.embed_color)) {
      embed.setColor(cmd.embed_color.startsWith('#') ? cmd.embed_color : `#${cmd.embed_color}`);
    } else {
      embed.setColor('#5865F2');
    }
    return embed;
  }

  _checkCooldown(inst, cmd, userId) {
    if (!cmd.cooldown_seconds) return 0;
    const key = `${cmd.id}:${userId}`;
    const last = inst.cooldowns.get(key) || 0;
    const remaining = cmd.cooldown_seconds * 1000 - (Date.now() - last);
    if (remaining > 0) return Math.ceil(remaining / 1000);
    inst.cooldowns.set(key, Date.now());
    return 0;
  }

  _recordUsage(botId, cmdId) {
    db.prepare("UPDATE commands SET uses_count = uses_count + 1, last_used_at = datetime('now') WHERE id = ?").run(cmdId);
    db.prepare('UPDATE bots SET total_commands_run = total_commands_run + 1 WHERE id = ?').run(botId);
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
      this._setStatus(botId, 'error', "Impossible de déchiffrer le token (ENCRYPTION_KEY a peut-être changé).");
      throw new Error('Impossible de déchiffrer le token du bot.');
    }

    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
      ],
      partials: [Partials.Channel, Partials.GuildMember],
    });

    // On enregistre l'instance tout de suite pour éviter les démarrages concurrents.
    this.instances.set(botId, { client, logs: [], cooldowns: new Map(), cooldownNotices: new Map() });
    this._setStatus(botId, 'starting', null);
    this._log(botId, 'info', 'Connexion à Discord en cours…');

    client.once('clientReady', async (c) => {
      this._log(botId, 'success', `Connecté en tant que ${c.user.tag}`);
      db.prepare('UPDATE bots SET client_id = ?, username = ?, avatar_url = ? WHERE id = ?').run(
        c.user.id,
        c.user.username,
        c.user.displayAvatarURL({ size: 128 }),
        botId
      );
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

      this._log(botId, 'info', `Présent sur ${c.guilds.cache.size} serveur(s).`);
      this._emitGuilds(botId);
      this._setStatus(botId, 'online', null);
    });

    client.on('guildCreate', (g) => {
      this._log(botId, 'success', `Ajouté au serveur "${g.name}".`);
      this._emitGuilds(botId);
    });
    client.on('guildDelete', (g) => {
      this._log(botId, 'warn', `Retiré du serveur "${g.name}".`);
      this._emitGuilds(botId);
    });

    client.on('guildMemberAdd', async (member) => {
      try {
        const current = db.prepare('SELECT * FROM bots WHERE id = ?').get(botId);
        if (!current || !current.welcome_enabled || !current.welcome_channel_id) return;
        const channel = await client.channels.fetch(current.welcome_channel_id).catch(() => null);
        if (!channel || !channel.isTextBased()) return;
        const text = this.buildResponse(current.welcome_message, {
          userMention: `<@${member.id}>`,
          username: member.user.username,
          serverName: member.guild.name,
          memberCount: member.guild.memberCount,
        });
        await channel.send(text);
        this._log(botId, 'info', `Message de bienvenue envoyé pour ${member.user.tag}.`);
      } catch (err) {
        this._log(botId, 'error', `Échec du message de bienvenue : ${err.message}`);
      }
    });

    client.on('guildMemberRemove', async (member) => {
      try {
        const current = db.prepare('SELECT * FROM bots WHERE id = ?').get(botId);
        if (!current || !current.leave_enabled || !current.leave_channel_id) return;
        const channel = await client.channels.fetch(current.leave_channel_id).catch(() => null);
        if (!channel || !channel.isTextBased()) return;
        const text = this.buildResponse(current.leave_message, {
          userMention: `<@${member.id}>`,
          username: member.user.username,
          serverName: member.guild.name,
          memberCount: member.guild.memberCount,
        });
        await channel.send(text);
      } catch (err) {
        this._log(botId, 'error', `Échec du message de départ : ${err.message}`);
      }
    });

    client.on('messageCreate', async (message) => {
      try {
        if (message.author.bot || !message.guild) return;
        const currentBot = db.prepare('SELECT * FROM bots WHERE id = ?').get(botId);
        if (!currentBot) return;
        const prefix = currentBot.prefix || '!';
        if (!message.content.startsWith(prefix)) return;

        const withoutPrefix = message.content.slice(prefix.length).trim();
        const [triggerRaw, ...rest] = withoutPrefix.split(/\s+/);
        const trigger = (triggerRaw || '').toLowerCase();
        if (!trigger) return;

        if (trigger === 'help') {
          const cmds = db
            .prepare("SELECT * FROM commands WHERE bot_id = ? AND enabled = 1 ORDER BY trigger")
            .all(botId);
          const lines = cmds.map((c) => `**${prefix}${c.trigger}** — ${c.description || 'Sans description'}`);
          if (currentBot.moderation_enabled) {
            lines.push(`**${prefix}kick** @membre [raison] — Expulse un membre`);
            lines.push(`**${prefix}ban** @membre [raison] — Bannit un membre`);
            lines.push(`**${prefix}clear** [nombre] — Supprime des messages (défaut 10)`);
          }
          await message.reply(lines.length ? lines.join('\n') : "Aucune commande n'est configurée pour ce bot.");
          return;
        }

        if (currentBot.moderation_enabled && ['kick', 'ban', 'clear'].includes(trigger)) {
          await this._handleModeration(botId, trigger, message, rest);
          return;
        }

        const cmd = db
          .prepare("SELECT * FROM commands WHERE bot_id = ? AND type = 'prefix' AND enabled = 1 AND lower(trigger) = ?")
          .get(botId, trigger);
        if (!cmd) return;

        const inst = this.instances.get(botId);
        const wait = this._checkCooldown(inst, cmd, message.author.id);
        if (wait > 0) {
          await message.react('⏳').catch(() => {});
          return;
        }

        const ctx = {
          userMention: `<@${message.author.id}>`,
          username: message.author.username,
          serverName: message.guild.name,
          memberCount: message.guild.memberCount,
        };
        const text = this.buildResponse(cmd.response, ctx);
        if (cmd.response_type === 'embed') {
          await message.reply({ embeds: [this._buildEmbed(cmd, text)] });
        } else {
          await message.reply(text);
        }
        this._recordUsage(botId, cmd.id);
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

        const inst = this.instances.get(botId);
        const wait = this._checkCooldown(inst, cmd, interaction.user.id);
        if (wait > 0) {
          await interaction.reply({ content: `⏳ Patiente encore ${wait}s avant de réutiliser cette commande.`, ephemeral: true });
          return;
        }

        const ctx = {
          userMention: `<@${interaction.user.id}>`,
          username: interaction.user.username,
          serverName: interaction.guild ? interaction.guild.name : '',
          memberCount: interaction.guild ? interaction.guild.memberCount : null,
        };
        const text = this.buildResponse(cmd.response, ctx);
        if (cmd.response_type === 'embed') {
          await interaction.reply({ embeds: [this._buildEmbed(cmd, text)] });
        } else {
          await interaction.reply(text);
        }
        this._recordUsage(botId, cmd.id);
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

  async _handleModeration(botId, action, message, args) {
    const target = message.mentions.members?.first();
    const reason = args.slice(1).join(' ') || 'Aucune raison fournie';

    const requiredPerm =
      action === 'kick' ? PermissionFlagsBits.KickMembers : action === 'ban' ? PermissionFlagsBits.BanMembers : PermissionFlagsBits.ManageMessages;

    if (!message.member.permissions.has(requiredPerm)) {
      await message.reply("🚫 Tu n'as pas la permission d'utiliser cette commande.");
      return;
    }
    if (!message.guild.members.me.permissions.has(requiredPerm)) {
      await message.reply('🚫 Je n\'ai pas la permission nécessaire sur ce serveur pour faire ça.');
      return;
    }

    try {
      if (action === 'clear') {
        const amount = Math.min(Math.max(parseInt(args[0], 10) || 10, 1), 100);
        const deleted = await message.channel.bulkDelete(amount, true);
        const confirmation = await message.channel.send(`🧹 ${deleted.size} message(s) supprimé(s).`);
        setTimeout(() => confirmation.delete().catch(() => {}), 5000);
        this._log(botId, 'info', `${message.author.tag} a supprimé ${deleted.size} message(s).`);
        return;
      }

      if (!target) {
        await message.reply('Mentionne le membre concerné, ex : `kick @membre raison`.');
        return;
      }
      if (action === 'kick') {
        await target.kick(reason);
        await message.reply(`👢 **${target.user.tag}** a été expulsé. Raison : ${reason}`);
      } else if (action === 'ban') {
        await target.ban({ reason });
        await message.reply(`🔨 **${target.user.tag}** a été banni. Raison : ${reason}`);
      }
      this._log(botId, 'info', `${message.author.tag} a utilisé ${action} sur ${target?.user.tag}.`);
    } catch (err) {
      await message.reply(`❌ Action impossible : ${err.message}`);
      this._log(botId, 'error', `Échec de modération (${action}) : ${err.message}`);
    }
  }

  _friendlyLoginError(err) {
    const msg = String(err && err.message ? err.message : err);
    if (/An invalid token was provided/i.test(msg) || /TOKEN_INVALID/i.test(msg)) {
      return 'Token invalide. Vérifie que tu as bien copié le token du bot depuis le portail développeur Discord.';
    }
    if (/disallowed intents/i.test(msg)) {
      return "Intents non autorisés : active « MESSAGE CONTENT INTENT » et « SERVER MEMBERS INTENT » dans l'onglet Bot du portail développeur Discord.";
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
      this.emit('guilds', { botId, guilds: [] });
    }
    return { ok: true };
  }

  async stopAll() {
    const ids = Array.from(this.instances.keys());
    await Promise.all(ids.map((id) => this.stop(id).catch(() => {})));
  }
}

module.exports = new BotManager();
module.exports.validateToken = validateToken;
module.exports.inviteUrl = inviteUrl;
