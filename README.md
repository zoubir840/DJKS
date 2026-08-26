# DJKS Bots

Site web pour créer et gérer des bots Discord **sans écrire de code** :
crée un compte, colle le token de ton bot, ajoute des commandes en quelques
clics, démarre-le et suis son activité en direct — tout depuis le tableau
de bord. Un assistant IA (Claude) peut générer des commandes à ta place et
discuter directement avec tes membres, sur mesure pour ton serveur.

## Fonctionnalités

### Compte & sécurité
- 🔐 Comptes utilisateurs (inscription / connexion, mots de passe hashés avec bcrypt)
- 🛡️ Protection CSRF sur tous les formulaires, en-têtes de sécurité (Helmet), limitation du taux de requêtes sur la connexion/inscription et sur l'IA
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

### 🤖 Intelligence artificielle (Claude), sur mesure par bot
- **Assistant IA conversationnel** : répond quand on le mentionne ou via un mot-clé
  dédié (`!ai <message>` par défaut, personnalisable), avec un peu de mémoire de
  conversation par salon. **Personnalité 100 % personnalisable** par bot (rôle,
  ton, règles du serveur…) — c'est ce qui la rend « sur mesure » pour chaque
  serveur plutôt que générique.
- **Générateur de commandes par IA** : décris ce que tu veux en français
  ("une commande qui souhaite un joyeux anniversaire"), l'IA remplit le
  formulaire de création de commande (déclencheur, réponse, embed, cooldown…) —
  tu vérifies et tu valides.
- **Garde-fous coûts** : cooldown par utilisateur, quota quotidien de messages
  IA configurable par bot, limite de tokens par réponse. L'IA reste
  entièrement optionnelle : sans clé API, le reste du site fonctionne
  normalement (juste ces deux fonctions sont désactivées, avec message clair).

### Créateur de commandes sans code
- commandes préfixées (`!bonjour`) et commandes **slash** (`/bonjour`, auto-enregistrées sur Discord)
- réponses en **texte simple** ou en **embed** (titre + couleur personnalisables)
- **réponses aléatoires multiples** : sépare plusieurs variantes par `|||`, une est tirée au hasard à chaque déclenchement
- **cooldown** configurable par commande (anti-spam)
- **rôle requis** optionnel pour restreindre une commande à certains membres
- variables dans les réponses : `{user}`, `{username}`, `{server}`, `{membercount}`
- activer/désactiver/supprimer une commande, `!help` auto-généré
- compteur d'utilisations et date de dernière utilisation par commande

### Fonctionnalités intégrées (activables en un clic)
- 🛠️ **Modération** : `!kick`, `!ban`, `!clear`, avec vérification des permissions Discord de l'utilisateur et du bot avant chaque action
- 👋 **Message de bienvenue** envoyé dans un salon au choix quand un membre rejoint
- 🚪 **Message de départ** envoyé dans un salon au choix quand un membre part
- 🎭 **Rôle automatique** attribué à chaque nouveau membre
- 🚫 **Anti-spam / mots interdits** : suppression automatique des messages contenant un mot de la liste
- 🧾 **Salon de logs de modération** : les actions (kick/ban/clear/anti-spam) sont journalisées sur Discord, pas seulement sur le site
- 🎛️ **Menus de rôles à boutons** : publie un message avec des boutons Discord — chaque membre clique pour obtenir ou retirer un rôle, sans réaction ni commande à taper. Gérable entièrement depuis le site (ajout/suppression de rôles, republication en un clic)

## Démarrage rapide

```bash
npm install
cp .env.example .env
# édite .env : SESSION_SECRET et ENCRYPTION_KEY (voir instructions dans le fichier)
# optionnel : ANTHROPIC_API_KEY pour activer l'assistant IA et le générateur de commandes
npm start
```

Le site est disponible sur `http://localhost:3000`. En production, définis
`NODE_ENV=production` pour activer les cookies de session sécurisés (HTTPS).

## Créer un bot Discord à connecter au site

1. Va sur le [portail développeur Discord](https://discord.com/developers/applications) et clique sur **New Application**.
2. Dans l'onglet **Bot**, clique sur **Reset Token** et copie le token (garde-le secret !).
3. Toujours dans l'onglet **Bot**, active **MESSAGE CONTENT INTENT** et **SERVER MEMBERS INTENT** (nécessaires pour les commandes préfixées, l'anti-spam, le rôle automatique et les messages de bienvenue/départ).
4. Sur le site, clique sur **+ Nouveau bot**, donne-lui un nom, colle le token et choisis un préfixe — le token est vérifié immédiatement auprès de Discord.
5. Ouvre la page du bot et clique sur **+ Inviter sur un serveur** (lien généré automatiquement avec les permissions nécessaires, y compris la gestion des rôles pour les menus à boutons).
6. Ajoute des commandes (ou génère-les avec l'IA), active la modération, l'anti-spam, le rôle automatique ou l'assistant IA si besoin, puis clique sur **▶ Démarrer**.

Pour trouver l'ID d'un salon ou d'un rôle Discord : active le **Mode
développeur** dans Discord (Paramètres → Avancés), puis clic droit sur le
salon/rôle → **Copier l'ID**.

## Activer l'IA (optionnel)

1. Récupère une clé API sur [console.anthropic.com](https://console.anthropic.com/settings/keys).
2. Ajoute `ANTHROPIC_API_KEY=sk-ant-...` dans `.env` puis redémarre le serveur.
3. Sur la page d'un bot : configure l'**Assistant IA** (personnalité, mot déclencheur, quota quotidien) et/ou utilise le **générateur de commandes IA** au-dessus du formulaire de création de commande.

Modèle utilisé par défaut : `claude-opus-5` (modifiable via `ANTHROPIC_MODEL`
dans `.env`, par exemple `claude-haiku-4-5` pour réduire les coûts sur un bot
à fort trafic).

## Architecture

```
server.js               Point d'entrée Express : routes, sessions, CSRF, SSE
src/db.js                Base SQLite (better-sqlite3) + schéma + migrations légères
src/crypto.js             Chiffrement AES-256-GCM des tokens
src/csrf.js                 Protection CSRF (jeton par session)
src/auth.js                  Middlewares d'authentification
src/ai.js                     Intégration Claude (chat assistant + générateur de commandes)
src/botManager.js               Cycle de vie des instances discord.js : démarrage/arrêt,
                                  commandes, modération, IA, menus de rôles, bienvenue/
                                  départ/rôle auto, anti-spam, logs, invitation
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
