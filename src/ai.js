'use strict';

const Anthropic = require('@anthropic-ai/sdk');

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5';
const CHAT_MAX_TOKENS = 700;
const GENERATE_MAX_TOKENS = 800;
const DISCORD_MESSAGE_LIMIT = 2000;

let client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function friendlyError(err) {
  if (err instanceof Anthropic.AuthenticationError) {
    return "Clé API Anthropic invalide côté serveur. Vérifie ANTHROPIC_API_KEY.";
  }
  if (err instanceof Anthropic.RateLimitError) {
    return 'Trop de requêtes IA en ce moment, réessaie dans un instant.';
  }
  if (err instanceof Anthropic.APIError) {
    return `Erreur IA (${err.status || '?'}) : ${err.message}`;
  }
  return `Erreur IA : ${err.message}`;
}

/**
 * Discussion avec l'assistant IA du bot (persona personnalisable par serveur).
 * `history` est une liste de { role: 'user'|'assistant', content: string },
 * la plus récente en dernier. Retourne du texte prêt à envoyer sur Discord
 * (tronqué à la limite de Discord).
 */
async function chat(persona, history, userMessage) {
  const anthropic = getClient();
  if (!anthropic) throw new Error("L'IA n'est pas configurée sur ce serveur (ANTHROPIC_API_KEY manquante).");

  const messages = [...history, { role: 'user', content: userMessage }];

  let response;
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: CHAT_MAX_TOKENS,
      system: `${persona}\n\nTu réponds dans un salon Discord : reste concis (quelques phrases maximum), utilise le markdown Discord si utile, n'utilise jamais plus de ${DISCORD_MESSAGE_LIMIT} caractères.`,
      messages,
    });
  } catch (err) {
    throw new Error(friendlyError(err));
  }

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  const safeText = text || "Je n'ai pas de réponse à ça pour le moment.";
  return safeText.length > DISCORD_MESSAGE_LIMIT ? `${safeText.slice(0, DISCORD_MESSAGE_LIMIT - 1)}…` : safeText;
}

/**
 * Génère la configuration d'une commande Discord à partir d'une description
 * en langage naturel. Retourne un objet strictement conforme au schéma
 * attendu par le formulaire de création de commande du site.
 */
async function generateCommand(description, botContext) {
  const anthropic = getClient();
  if (!anthropic) throw new Error("L'IA n'est pas configurée sur ce serveur (ANTHROPIC_API_KEY manquante).");

  const system = `Tu configures des commandes pour un bot Discord "sur mesure" à partir d'une description en langage naturel.
Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, sans balises markdown, correspondant exactement à ce schéma :
{
  "trigger": string (un seul mot, minuscules, lettres/chiffres/tirets/underscores uniquement, sans le préfixe),
  "type": "prefix" ou "slash",
  "description": string (courte, pour l'aide de la commande),
  "response_type": "text" ou "embed",
  "response": string (le texte de la réponse ; peut utiliser {user}, {username}, {server}, {membercount}),
  "embed_title": string (vide si response_type = "text"),
  "embed_color": string (couleur hexadécimale style "#5865F2", vide si response_type = "text"),
  "cooldown_seconds": number (0 à 3600, 0 si non pertinent)
}
Le préfixe de ce bot est "${botContext.prefix}". Choisis "slash" seulement si la description mentionne explicitement une commande slash, sinon "prefix". Sois créatif mais reste fidèle à la demande.`;

  let response;
  try {
    response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: GENERATE_MAX_TOKENS,
      system,
      messages: [{ role: 'user', content: description }],
    });
  } catch (err) {
    throw new Error(friendlyError(err));
  }

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  const jsonText = extractJson(text);
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new Error("L'IA a renvoyé une réponse inattendue. Réessaie avec une description un peu différente.");
  }

  return normalizeGeneratedCommand(parsed);
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) return text.slice(start, end + 1);
  return text;
}

function normalizeGeneratedCommand(raw) {
  const trigger = String(raw.trigger || '')
    .toLowerCase()
    .trim()
    .replace(/^[!/]/, '')
    .replace(/[^a-z0-9_-]/g, '-')
    .slice(0, 32);
  const type = raw.type === 'slash' ? 'slash' : 'prefix';
  const responseType = raw.response_type === 'embed' ? 'embed' : 'text';
  const cooldown = Math.min(Math.max(parseInt(raw.cooldown_seconds, 10) || 0, 0), 3600);
  const color = /^#[0-9a-fA-F]{6}$/.test(raw.embed_color || '') ? raw.embed_color : '#5865F2';

  return {
    trigger: trigger || 'commande',
    type,
    description: String(raw.description || '').slice(0, 200),
    response_type: responseType,
    response: String(raw.response || '').slice(0, 1800),
    embed_title: String(raw.embed_title || '').slice(0, 200),
    embed_color: color,
    cooldown_seconds: cooldown,
  };
}

module.exports = { isConfigured, chat, generateCommand, MODEL };
