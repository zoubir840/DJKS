# DJKS Bots

Site web pour créer et gérer des bots Discord **sans écrire de code** :
crée un compte, colle le token de ton bot, ajoute des commandes en quelques
clics, démarre-le et suis son activité en direct — tout depuis le tableau
de bord.

## Fonctionnalités

- 🔐 Comptes utilisateurs (inscription / connexion, mots de passe hashés avec bcrypt)
- 🤖 Ajout de plusieurs bots Discord par compte (token chiffré en base, AES-256-GCM)
- ▶️/■ Démarrage / arrêt d'un bot en un clic depuis le site (le bot tourne dans le process du serveur)
- 🧩 Créateur de commandes sans code :
  - commandes préfixées (`!bonjour`)
  - commandes slash (`/bonjour`, enregistrées automatiquement auprès de Discord)
  - variables dans les réponses : `{user}`, `{username}`, `{server}`, `{membercount}`
  - activation / désactivation / suppression d'une commande
  - `!help` généré automatiquement à partir des commandes actives
- 📜 Logs en direct (connexion, erreurs, commandes déclenchées) via Server-Sent Events
- ⚙️ Changement du préfixe, du nom et du token à tout moment

## Démarrage rapide

```bash
npm install
cp .env.example .env
# édite .env : SESSION_SECRET et ENCRYPTION_KEY (voir instructions dans le fichier)
npm start
```

Le site est disponible sur `http://localhost:3000`.

## Créer un bot Discord à connecter au site

1. Va sur le [portail développeur Discord](https://discord.com/developers/applications) et clique sur **New Application**.
2. Dans l'onglet **Bot**, clique sur **Reset Token** et copie le token (garde-le secret !).
3. Toujours dans l'onglet **Bot**, active **MESSAGE CONTENT INTENT** (nécessaire pour les commandes préfixées).
4. Dans **OAuth2 → URL Generator**, coche les scopes `bot` et `applications.commands`, choisis les permissions voulues, puis ouvre le lien généré pour inviter le bot sur ton serveur.
5. Sur le site, clique sur **+ Nouveau bot**, donne-lui un nom, colle le token et choisis un préfixe.
6. Ouvre la page du bot, ajoute des commandes puis clique sur **▶ Démarrer**.

## Architecture

```
server.js          Point d'entrée Express : routes, sessions, SSE
src/db.js           Base SQLite (better-sqlite3) + schéma (users, bots, commands)
src/crypto.js        Chiffrement AES-256-GCM des tokens
src/auth.js           Middlewares d'authentification
src/botManager.js      Cycle de vie des instances discord.js (start/stop/logs)
views/*.ejs             Pages du site (EJS + CSS fait main, thème sombre)
public/                 CSS / JS statiques (dont le client SSE des logs)
```

Chaque bot démarré tourne comme une instance `discord.js` dans le process
Node du serveur (pas de conteneurs séparés). Les logs sont bufferisés en
mémoire par bot et diffusés en direct au navigateur via Server-Sent Events.
Si le serveur redémarre, les bots doivent être relancés manuellement depuis
le tableau de bord.

## Variables d'environnement

Voir `.env.example`. En production, définis absolument `SESSION_SECRET` et
`ENCRYPTION_KEY` avec des valeurs aléatoires et stables — sans quoi tokens
et sessions ne survivent pas à un redémarrage.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
