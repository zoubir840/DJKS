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
- 🌗 Thème clair / sombre soigné (dégradés de marque, ombres, cartes qui se soulèvent au survol, fond ambiant), mémorisé par navigateur (icône en haut de page)
- 🛠️ **Panneau d'administration** protégé par un code d'accès (voir plus bas) : vue sur tous les comptes et bots, suspension/suppression de compte, arrêt d'un bot à distance, statistiques globales du serveur

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
- **modifier** une commande existante (déclencheur, réponse, embed, cooldown, rôle requis…)
- **dupliquer** une commande en un clic (créée désactivée, à renommer)
- **aperçu en direct** de la réponse pendant la saisie (avec valeurs d'exemple)
- **export / import** de tes commandes en JSON (sauvegarde, ou pour les recopier sur un autre bot)

### Fonctionnalités intégrées (activables en un clic)
- 🛠️ **Modération** : `!kick`, `!ban`, `!clear`, `!mute`/`!unmute` (timeout Discord natif), avec vérification des permissions Discord de l'utilisateur et du bot avant chaque action
- ⚠️ **Avertissements** : `!warn`, `!warnings`, `!clearwarnings`, avec **sanction automatique** (expulsion ou bannissement) configurable après N avertissements
- 👋 **Message de bienvenue** envoyé dans un salon au choix quand un membre rejoint
- 🚪 **Message de départ** envoyé dans un salon au choix quand un membre part
- 🎭 **Rôle automatique** attribué à chaque nouveau membre
- 🛡️ **Auto-modération** : mots interdits, liens d'invitation Discord, spam de mentions, excès de MAJUSCULES — chaque filtre activable indépendamment, suppression automatique du message
- 🧾 **Salon de logs de modération** : toutes les actions (kick/ban/clear/warn/mute/auto-modération) sont journalisées sur Discord, pas seulement sur le site
- 🎛️ **Menus de rôles à boutons** : publie un message avec des boutons Discord — chaque membre clique pour obtenir ou retirer un rôle, sans réaction ni commande à taper. Gérable entièrement depuis le site (ajout/suppression de rôles, republication en un clic)
- 🏆 **Système de niveaux (XP)** : les membres gagnent de l'XP en discutant (cooldown anti-farm configurable), `!rank` et `!leaderboard` intégrés, annonce de passage de niveau dans un salon au choix, classement visible et réinitialisable depuis le site
- ⭐ **Starboard** : republie automatiquement un message dans un salon dédié dès qu'il atteint un nombre de réactions choisi (emoji et seuil configurables)
- 📊 **Sondages** : crée une question à choix multiples (2 à 10 options) depuis le site, publie-la en un clic — le bot poste l'embed et réagit avec les emojis numérotés
- 🔌 **Webhooks entrants** : génère un lien unique par bot ; un simple appel HTTP POST (JSON) depuis un autre service (GitHub, IFTTT, un script maison…) poste un message dans le salon de ton choix, avec un modèle personnalisable (`{message}`, `{title}`, `{url}`, `{json}`)
- 🔎 **Commandes « mot-clé »** : en plus des commandes à préfixe classiques, une commande peut se déclencher dès que son mot apparaît n'importe où dans un message, sans préfixe
- 📅 **Annonces programmées** : un message envoyé automatiquement à intervalle régulier dans un salon, activable/désactivable, sans rien coder
- 🎁 **Giveaways** : crée un concours (lot, nombre de gagnants, durée), publie-le en un clic — le bot poste l'embed, gère la participation par réaction 🎉 et tire au sort le(s) gagnant(s) automatiquement à la fin (ou immédiatement depuis le site)

## Démarrage rapide (local)

```bash
npm install
npm start
```

C'est tout : si aucun `.env` n'existe, `npm start` en crée un automatiquement
avec des clés (`SESSION_SECRET`, `ENCRYPTION_KEY`) générées aléatoirement.
Le site est disponible sur `http://localhost:3000`. Pour activer l'IA
(facultatif, gratuite), voir plus bas. En production, mets
`NODE_ENV=production` dans `.env` pour activer les cookies de session
sécurisés (HTTPS requis devant).

## Lancer sur un serveur Debian/Ubuntu — TOUT en une seule commande

Sur un serveur fraîchement provisionné, connecté en SSH, **sans rien cloner
au préalable** :

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/zoubir840/DJKS/claude/discord-bot-management-site-o5vtwp/deploy/bootstrap.sh)
```

Une seule commande, et c'est fini : elle installe git si besoin, clone le
dépôt, installe Node.js et les dépendances, génère `.env` automatiquement,
configure le **service systemd** qui garde le site en ligne en permanence
(redémarre seul en cas de crash ou de reboot), **et** installe l'IA locale
gratuite (Ollama) avec un modèle déjà choisi. À la fin, elle affiche l'URL
du site et les commandes utiles.

Relance-la à tout moment sans risque (par ex. pour mettre à jour) : elle ne
recrée rien inutilement, juste `git pull` + mise à jour des services.
Adapte le dépôt/la branche avec les variables `DJKS_REPO_URL` /
`DJKS_BRANCH` si tu utilises ton propre fork.

### Étape par étape (si tu préfères, ou si le dépôt est déjà cloné)

```bash
git clone <url-de-ton-fork> djks-bots && cd djks-bots
bash deploy/install-vps.sh       # le site + service systemd permanent
bash deploy/install-ollama.sh    # l'IA locale, gratuite, sans clé (optionnel)
```

`install-vps.sh` peut être relancé sans risque après un `git pull` pour
mettre à jour le service. Pour du HTTPS avec un nom de domaine, voir
`deploy/Caddyfile.example`.

## Déployer via Docker (voir plus bas)

Une image Docker prête à l'emploi est aussi publiée automatiquement par
GitHub Actions — utile sur Railway/Render/Fly ou tout hébergeur à
conteneurs. Détails dans la section [Déploiement](#déploiement) plus bas.

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

## Activer l'IA (optionnel, gratuit)

Trois options, essayées automatiquement dans cet ordre — la première trouvée
configurée l'emporte :

### Option 1 — 100% gratuite, SANS AUCUNE CLÉ ni compte (Ollama, en local)

```bash
bash deploy/install-ollama.sh
```

Installe [Ollama](https://ollama.com) et un petit modèle (`llama3.2:3b` par
défaut, ~2 Go) qui tourne directement sur ton serveur — aucun compte, aucune
carte bancaire, aucune limite d'usage. **Testé et validé pour ce projet**
(chat et générateur de commandes fonctionnent). Recommandé avec au moins
4 Go de RAM libres sur le serveur ; les réponses sont plus lentes qu'avec
une API cloud (quelques secondes) et un peu moins fines qu'un grand modèle,
mais totalement gratuites et privées. Choisis un autre modèle en argument
(`bash deploy/install-ollama.sh qwen2.5:3b`) si tu veux essayer autre chose.

### Option 2 — gratuite, avec une clé API (Groq, dans le cloud)

1. Crée un compte gratuit et une clé sur [console.groq.com/keys](https://console.groq.com/keys) (aucune carte bancaire requise).
2. Ajoute `GROQ_API_KEY=gsk_...` dans `.env` puis redémarre le serveur.

Plus rapide qu'Ollama et ne consomme aucune ressource sur ton serveur, mais
nécessite une inscription et une connexion Internet vers Groq.

### Option 3 — payante (Claude / Anthropic)

Pour qui veut la meilleure qualité de réponse et a déjà une clé : ajoute
`ANTHROPIC_API_KEY=sk-ant-...` dans `.env` (utilisée seulement si les deux
options ci-dessus sont vides). Modèle par défaut `claude-opus-5`,
modifiable via `ANTHROPIC_MODEL`.

### Une fois configuré

Sur la page d'un bot : configure l'**Assistant IA** (personnalité, mot
déclencheur, quota quotidien) et/ou utilise le **générateur de commandes
IA** au-dessus du formulaire de création de commande. Le fournisseur actif
est affiché directement dans cette section.

## Panneau d'administration (optionnel)

Une section `/admin` (icône 🛠️ en haut de chaque page) donne une vue sur
**tout le site**, indépendamment des comptes utilisateurs : nombre de
comptes et de bots, bots en ligne, commandes exécutées, usage de l'IA,
version de Node et mémoire utilisée — plus la liste de tous les comptes
(suspendre/réactiver/supprimer) et de tous les bots (arrêt à distance).

Désactivée par défaut (page 404). Pour l'activer, ajoute dans `.env` :

```
ADMIN_CODE=ton-code-ici
```

puis redémarre le site. Les tentatives de connexion à `/admin` sont
limitées à 8 par 15 minutes pour freiner le brute-force, mais **un code
court (ex. "123") reste rapide à deviner** même avec cette limite — préfère
au moins 6-8 caractères pour un déploiement réellement exposé sur
Internet. Ce code n'est lié à aucun compte : quiconque le connaît a accès
à l'administration, garde-le aussi confidentiel qu'un mot de passe.

## Architecture

```
server.js               Point d'entrée Express : routes, sessions, CSRF, SSE, admin
src/ensureEnv.js          Génère .env automatiquement au premier lancement s'il est absent
src/db.js                  Base SQLite (better-sqlite3) + schéma + migrations légères
src/crypto.js                Chiffrement AES-256-GCM des tokens
src/csrf.js                   Protection CSRF (jeton par session)
src/auth.js                    Middlewares d'authentification des comptes
src/adminAuth.js                 Middleware d'accès au panneau d'administration (par code)
src/ai.js                          Intégration IA : Ollama / Groq / Claude (chat + générateur)
src/botManager.js                    Cycle de vie des instances discord.js : démarrage/arrêt,
                                       commandes, modération, IA, menus de rôles, bienvenue/
                                       départ/rôle auto, anti-spam, logs, invitation
views/*.ejs                             Pages du site (EJS + CSS fait main, thèmes clair/sombre)
public/js/theme.js, site.js               Bascule de thème (mémorisée par navigateur)
public/                                     CSS / JS statiques (dont le client SSE des logs)
deploy/bootstrap.sh                   Installation TOTALE en une commande (clone + site + IA locale)
deploy/install-vps.sh                   Installation + service systemd du site seul
deploy/install-ollama.sh                  IA locale 100% gratuite et sans clé (Ollama)
deploy/Caddyfile.example                    Reverse proxy HTTPS optionnel (nom de domaine)
```

Chaque bot démarré tourne comme une instance `discord.js` dans le process
Node du serveur (pas de conteneurs séparés). Les logs sont bufferisés en
mémoire par bot et diffusés en direct au navigateur via Server-Sent Events.
Si le serveur redémarre, les bots que tu n'avais pas arrêtés toi-même
redémarrent automatiquement (colonne `autostart`).

## Déploiement

**Important à savoir :** GitHub seul ne peut pas héberger ce site. GitHub
Pages ne sert que du HTML/CSS/JS statique — ce projet a besoin d'un process
Node qui tourne en continu, d'une base SQLite persistante et de connexions
WebSocket ouvertes vers Discord. Ce que fait ce dépôt via GitHub Actions :

1. **CI** (`.github/workflows/ci.yml`) : à chaque push, installe les
   dépendances, vérifie la syntaxe et démarre le serveur pour confirmer
   qu'il répond.
2. **Publication Docker** (`.github/workflows/docker-publish.yml`) : à
   chaque push sur `main` (ou déclenchement manuel depuis l'onglet
   *Actions*), construit une image Docker prête à l'emploi et la publie sur
   le **GitHub Container Registry** :
   `ghcr.io/<ton-compte>/<ton-repo>:latest`

Cette image est ensuite déployable en une commande sur n'importe quel
hébergeur qui exécute des conteneurs Docker.

### Option A — sur ton propre serveur / VPS (Docker)

```bash
docker run -d \
  --name djks-bots \
  -p 3000:3000 \
  -e SESSION_SECRET=... \
  -e ENCRYPTION_KEY=... \
  -e GROQ_API_KEY=... \
  -v djks-data:/app/data \
  ghcr.io/<ton-compte>/<ton-repo>:latest
```

(`GROQ_API_KEY` est optionnel, pour l'IA gratuite — voir la section
« Activer l'IA » plus haut. Ollama n'est pas utilisable
depuis ce conteneur sans installation supplémentaire ; pour l'option 100%
sans clé, préfère `deploy/install-vps.sh` + `deploy/install-ollama.sh`
directement sur le serveur.)

Ou avec `docker-compose.yml` (fourni à la racine du projet) :

```bash
cp .env.example .env   # puis édite les valeurs
docker compose up -d
```

Mets `NODE_ENV=production` dans `.env` **seulement** si un reverse proxy
(Nginx, Caddy, Traefik…) termine le HTTPS devant le conteneur — sinon les
cookies de session « secure » empêcheront la connexion. Par défaut l'image
tourne en mode non-sécurisé (HTTP simple), pratique pour tester rapidement.

### Option B — sur une plateforme qui déploie depuis GitHub (le plus simple pour une URL publique)

Des hébergeurs comme **Railway**, **Render** ou **Fly.io** peuvent connecter
ton dépôt GitHub directement (ils détectent le `Dockerfile` automatiquement)
ou tirer l'image publiée sur `ghcr.io` ci-dessus. Ils gèrent le HTTPS pour
toi, donc `NODE_ENV=production` fonctionne directement. Dans tous les cas,
il te faudra :
- définir les variables d'environnement `SESSION_SECRET`, `ENCRYPTION_KEY`
  (et `GROQ_API_KEY`, gratuit, si tu veux l'IA — Ollama n'est pas adapté à
  ce type de plateforme sans GPU/RAM dédiée ; `ADMIN_CODE` si tu veux le
  panneau d'administration),
- attacher un **volume/disque persistant** sur `/app/data` (sinon la base
  SQLite — donc tes comptes et bots — repart de zéro à chaque redéploiement).

## Variables d'environnement

Voir `.env.example`. En production, définis absolument `SESSION_SECRET` et
`ENCRYPTION_KEY` avec des valeurs aléatoires et stables — sans quoi tokens
et sessions ne survivent pas à un redémarrage.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
