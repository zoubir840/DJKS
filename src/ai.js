'use strict';

const Groq = require('groq-sdk');
const Anthropic = require('@anthropic-ai/sdk');

// Trois fournisseurs IA supportés, choisis automatiquement selon ce qui est
// configuré dans .env, par ordre de priorité :
//
//   1. Ollama   — 100% gratuit, ZÉRO clé/compte : un modèle tourne en local
//      (ou sur un autre serveur que tu contrôles). Activé dès que
//      OLLAMA_MODEL est défini. Voir deploy/install-ollama.sh.
//   2. Groq     — gratuit, nécessite une clé API sans carte bancaire
//      (https://console.groq.com/keys). Activé si GROQ_API_KEY est défini.
//   3. Claude   — payant (Anthropic), pour qui l'a déjà configuré.
//      Activé si ANTHROPIC_API_KEY est défini.
//
// Sans aucun des trois, l'IA est simplement désactivée (le reste du site
// continue de fonctionner normalement).
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5';
const CHAT_MAX_TOKENS = 700;
const GENERATE_MAX_TOKENS = 800;
const DISCORD_MESSAGE_LIMIT = 2000;

let groqClient = null;
let anthropicClient = null;

function activeProvider() {
  if (OLLAMA_MODEL) return 'ollama';
  if (process.env.GROQ_API_KEY) return 'groq';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return null;
}

function isConfigured() {
  return activeProvider() !== null;
}

function providerLabel() {
  const p = activeProvider();
  if (p === 'ollama') return `Ollama local (gratuit, sans clé — ${OLLAMA_MODEL})`;
  if (p === 'groq') return `Groq (gratuit — ${GROQ_MODEL})`;
  if (p === 'anthropic') return `Claude (Anthropic — ${ANTHROPIC_MODEL})`;
  return null;
}

function getGroq() {
  if (!groqClient) groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groqClient;
}

function getAnthropic() {
  if (!anthropicClient) anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return anthropicClient;
}

function friendlyError(provider, err) {
  if (provider === 'ollama') {
    if (err.code === 'ECONNREFUSED' || /fetch failed/i.test(err.message)) {
      return `Impossible de contacter Ollama sur ${OLLAMA_BASE_URL}. Vérifie qu'il tourne (service "ollama") et que le modèle "${OLLAMA_MODEL}" est installé (\`ollama pull ${OLLAMA_MODEL}\`).`;
    }
    return `Erreur Ollama : ${err.message}`;
  }

  const ErrorsNs = provider === 'groq' ? Groq : Anthropic;
  if (err instanceof ErrorsNs.AuthenticationError) {
    return provider === 'groq'
      ? 'Clé API Groq invalide côté serveur. Vérifie GROQ_API_KEY.'
      : 'Clé API Anthropic invalide côté serveur. Vérifie ANTHROPIC_API_KEY.';
  }
  if (err instanceof ErrorsNs.RateLimitError) {
    return provider === 'groq'
      ? "Quota gratuit Groq atteint pour l'instant (limite par minute/jour). Réessaie dans un instant."
      : 'Trop de requêtes IA en ce moment, réessaie dans un instant.';
  }
  if (err instanceof ErrorsNs.APIError) {
    return `Erreur IA (${err.status || '?'}) : ${err.message}`;
  }
  return `Erreur IA : ${err.message}`;
}

async function callOllama(system, messages, { json = false } = {}) {
  let res;
  try {
    res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        ...(json ? { format: 'json' } : {}),
        messages: [{ role: 'system', content: system }, ...messages],
        options: { num_predict: json ? GENERATE_MAX_TOKENS : CHAT_MAX_TOKENS },
      }),
    });
  } catch (err) {
    throw new Error(friendlyError('ollama', err));
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(friendlyError('ollama', new Error(body.error || `HTTP ${res.status}`)));
  }

  const data = await res.json();
  return data.message?.content || '';
}

async function callChat(system, messages) {
  const provider = activeProvider();
  if (!provider) throw new Error("L'IA n'est pas configurée sur ce serveur (aucun OLLAMA_MODEL, GROQ_API_KEY ni ANTHROPIC_API_KEY).");

  if (provider === 'ollama') return callOllama(system, messages);

  if (provider === 'groq') {
    try {
      const res = await getGroq().chat.completions.create({
        model: GROQ_MODEL,
        max_tokens: CHAT_MAX_TOKENS,
        messages: [{ role: 'system', content: system }, ...messages],
      });
      return res.choices[0]?.message?.content || '';
    } catch (err) {
      throw new Error(friendlyError('groq', err));
    }
  }

  try {
    const res = await getAnthropic().messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: CHAT_MAX_TOKENS,
      system,
      messages,
    });
    return res.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
  } catch (err) {
    throw new Error(friendlyError('anthropic', err));
  }
}

async function callJson(system, userText) {
  const provider = activeProvider();
  if (!provider) throw new Error("L'IA n'est pas configurée sur ce serveur (aucun OLLAMA_MODEL, GROQ_API_KEY ni ANTHROPIC_API_KEY).");

  if (provider === 'ollama') return callOllama(system, [{ role: 'user', content: userText }], { json: true });

  if (provider === 'groq') {
    try {
      const res = await getGroq().chat.completions.create({
        model: GROQ_MODEL,
        max_tokens: GENERATE_MAX_TOKENS,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userText },
        ],
      });
      return res.choices[0]?.message?.content || '';
    } catch (err) {
      throw new Error(friendlyError('groq', err));
    }
  }

  try {
    const res = await getAnthropic().messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: GENERATE_MAX_TOKENS,
      system,
      messages: [{ role: 'user', content: userText }],
    });
    return res.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
  } catch (err) {
    throw new Error(friendlyError('anthropic', err));
  }
}

/**
 * Discussion avec l'assistant IA du bot (persona personnalisable par serveur).
 * `history` est une liste de { role: 'user'|'assistant', content: string },
 * la plus récente en dernier. Retourne du texte prêt à envoyer sur Discord
 * (tronqué à la limite de Discord).
 */
async function chat(persona, history, userMessage) {
  const system = `${persona}\n\nTu réponds dans un salon Discord : reste concis (quelques phrases maximum), utilise le markdown Discord si utile, n'utilise jamais plus de ${DISCORD_MESSAGE_LIMIT} caractères.`;
  const messages = [...history, { role: 'user', content: userMessage }];

  const text = (await callChat(system, messages)).trim();
  const safeText = text || "Je n'ai pas de réponse à ça pour le moment.";
  return safeText.length > DISCORD_MESSAGE_LIMIT ? `${safeText.slice(0, DISCORD_MESSAGE_LIMIT - 1)}…` : safeText;
}

/**
 * Génère la configuration d'une commande Discord à partir d'une description
 * en langage naturel. Retourne un objet strictement conforme au schéma
 * attendu par le formulaire de création de commande du site.
 */
async function generateCommand(description, botContext) {
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

  const text = (await callJson(system, description)).trim();
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

module.exports = { isConfigured, activeProvider, providerLabel, chat, generateCommand };
