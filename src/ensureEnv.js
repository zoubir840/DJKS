'use strict';

// Fait en sorte que `npm start` marche tout de suit après `npm install`,
// sans étape manuelle : si aucun .env n'existe, on en crée un à partir de
// .env.example avec des clés générées automatiquement (SESSION_SECRET,
// ENCRYPTION_KEY). Ne touche jamais à un .env déjà présent.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');
const EXAMPLE_PATH = path.join(ROOT, '.env.example');

function ensureEnv() {
  if (fs.existsSync(ENV_PATH)) return;
  if (!fs.existsSync(EXAMPLE_PATH)) return;

  let content = fs.readFileSync(EXAMPLE_PATH, 'utf8');
  content = content
    .replace('change-moi-en-une-longue-chaine-aleatoire', crypto.randomBytes(32).toString('hex'))
    .replace('change-moi-64-caracteres-hexadecimaux-generes-avec-crypto-random', crypto.randomBytes(32).toString('hex'));

  fs.writeFileSync(ENV_PATH, content, { mode: 0o600 });
  console.log('[setup] Aucun .env trouvé : un fichier .env a été créé avec des clés générées automatiquement.');
  console.log('[setup] IA (optionnelle) : bash deploy/install-ollama.sh (gratuit, sans clé) ou GROQ_API_KEY dans .env (gratuit).');
}

module.exports = { ensureEnv };
