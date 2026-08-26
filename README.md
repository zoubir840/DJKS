# DJKS Bots

Site web pour créer et gérer des bots Discord **sans écrire de code** :
crée un compte, colle le token de ton bot, ajoute des commandes en quelques
clics, démarre-le et suis son activité en direct — tout depuis le tableau
de bord.

## Fonctionnalités

### Compte & sécurité
- 🔐 Comptes utilisateurs (inscription / connexion, mots de passe hashés avec bcrypt)
- 🛡️ Protection CSRF sur tous les formulaires, en-têtes de sécurité (Helmet), limitation du taux de requêtes sur la connexion/inscription
- 🗄️ Sessions persistantes en base (survivent à un redémarrage du serveur)
- ⚙️ Page « Mon compte » : changement de mot de passe, suppression de compte
- 🔑 Tokens Discord chiffrés en base (AES-256-GCM), jamais réaffichés en clair
- ✅ Validation du token auprès de l'API Discord dès l'ajout du bot (avant même de le démarrer)

### Gestion des bots
- 🤖 Plusieurs bots Discord par compte, avec avatar et pseudo Discord affichés
- ▶️/■ Démarrage / arrêt en un clic (le bot tourne réellement via `discord.js` dans le serveur)
- 🔁 Redémarrage automatique des bots au redémarrage du serveur (si tu ne les as pas arrêtés toi-même)
- 🔗 Lien d'invitation généré automatiquement pour ajouter le bot à un serveur
- 🌐 Liste des serveurs où le bot est présent, mise à jour en direct
- 📜 Logs en direct (connexion, erreurs, commandes déclenchées) via Server-Sent Events
- 📊 Statistiques : nombre de commandes, exécutions totales, serveurs, durée en ligne

### Créateur de commandes sans code
- commandes préfixées (`!bonjour`) et commandes **slash** (`/bonjour`, auto-enregistrées sur Discord)
- réponses en **texte simple** ou en **embed** (titre + couleur personnalisables)
- **cooldown** configurable par commande (anti-spam)
- variables dans les réponses : `{user}`, `{username}`, `{server}`, `{membercount}`
- activer/désactiver/supprimer une commande, `!help` auto-généré
- compteur d'utilisations et date de dernière utilisation par commande

### Fonctionnalités intégrées (activables en un clic)
- 🛠️ **Modération** : `!kick`, `!ban`, `!clear`, avec vérification des permissions Discord de l'utilisateur et du bot avant chaque action
- 👋 **Message de bienvenue** envoyé dans un salon au choix quand un membre rejoint
- 🚪 **Message de départ** envoyé dans un salon au choix quand un membre part

## Démarrage rapide

```bash
npm install
cp .env.example .env
# édite .env : SESSION_SECRET et ENCRYPTION_KEY (voir instructions dans le fichier)
npm start
```

Le site est disponible sur `http://localhost:3000`. En production, définis
`NODE_ENV=production` pour activer les cookies de session sécurisés (HTTPS).

## Créer un bot Discord à connecter au site

1. Va sur le [portail développeur Discord](https://discord.com/developers/applications) et clique sur **New Application**.
2. Dans l'onglet **Bot**, clique sur **Reset Token** et copie le token (garde-le secret !).
3. Toujours dans l'onglet **Bot**, active **MESSAGE CONTENT INTENT** et **SERVER MEMBERS INTENT** (nécessaires pour les commandes préfixées et les messages de bienvenue/départ).
4. Sur le site, clique sur **+ Nouveau bot**, donne-lui un nom, colle le token et choisis un préfixe — le token est vérifié immédiatement auprès de Discord.
5. Ouvre la page du bot et clique sur **+ Inviter sur un serveur** (lien généré automatiquement avec les permissions nécessaires).
6. Ajoute des commandes, active la modération ou les messages de bienvenue/départ si besoin, puis clique sur **▶ Démarrer**.

## Architecture

```
server.js               Point d'entrée Express : routes, sessions, CSRF, SSE
src/db.js                Base SQLite (better-sqlite3) + schéma + migrations légères
src/crypto.js             Chiffrement AES-256-GCM des tokens
src/csrf.js                 Protection CSRF (jeton par session)
src/auth.js                  Middlewares d'authentification
src/botManager.js              Cycle de vie des instances discord.js : démarrage/arrêt,
                                 commandes, modération, bienvenue/départ, logs, invitation
views/*.ejs                      Pages du site (EJS + CSS fait main, thème sombre)
public/                            CSS / JS statiques (dont le client SSE des logs)
```

Chaque bot démarré tourne comme une instance `discord.js` dans le process
Node du serveur (pas de conteneurs séparés). Les logs sont bufferisés en
mémoire par bot et diffusés en direct au navigateur via Server-Sent Events.
Si le serveur redémarre, les bots que tu n'avais pas arrêtés toi-même
redémarrent automatiquement (colonne `autostart`).

## Variables d'environnement

Voir `.env.example`. En production, définis absolument `SESSION_SECRET` et
`ENCRYPTION_KEY` avec des valeurs aléatoires et stables — sans quoi tokens
et sessions ne survivent pas à un redémarrage.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
