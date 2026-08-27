#!/usr/bin/env bash
# Installe et lance DJKS Bots sur un VPS Ubuntu/Debian, en une commande :
#
#   bash deploy/install-vps.sh
#
# - Installe Node.js 22 si absent (via NodeSource, nécessite sudo)
# - Installe les outils de compilation si besoin (build-essential, requis
#   par better-sqlite3 sur les systèmes sans binaire précompilé, fréquent
#   sur Debian minimal)
# - Installe les dépendances npm
# - Crée .env automatiquement (clés générées) s'il n'existe pas déjà
# - Configure un service systemd qui garde le site en ligne en permanence
#   (redémarrage automatique en cas de crash, et au reboot du serveur)
#
# Relance-le sans risque à tout moment (par ex. après un `git pull`) : il ne
# touche jamais à un .env existant et remet juste le service à jour.

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="djks-bots"
RUN_USER="${SUDO_USER:-$(whoami)}"

echo "==> DJKS Bots — installation dans $APP_DIR (utilisateur : $RUN_USER)"

# --- 1. Node.js ---------------------------------------------------------
NODE_MAJOR_OK=0
if command -v node >/dev/null 2>&1; then
  CURRENT_MAJOR="$(node -v | sed 's/^v//' | cut -d. -f1)"
  [ "$CURRENT_MAJOR" -ge 20 ] && NODE_MAJOR_OK=1
fi

if [ "$NODE_MAJOR_OK" -eq 0 ]; then
  echo "==> Installation de Node.js 22 (sudo requis)..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
  echo "==> Node.js installé : $(node -v)"
else
  echo "==> Node.js déjà présent : $(node -v)"
fi

# --- 2. Outils de compilation (nécessaires pour better-sqlite3) ----------
# Debian minimal en particulier n'a souvent ni make ni g++ préinstallés :
# better-sqlite3 doit alors compiler son module natif et npm install échoue
# avec "node-gyp ... not found: make" sans ça.
if ! command -v make >/dev/null 2>&1 || ! command -v g++ >/dev/null 2>&1; then
  echo "==> Installation des outils de compilation (build-essential, python3)..."
  sudo apt-get update -qq
  sudo apt-get install -y build-essential python3
else
  echo "==> Outils de compilation déjà présents."
fi

# --- 3. Dépendances --------------------------------------------------------
cd "$APP_DIR"
echo "==> Installation des dépendances npm..."
npm install --omit=dev

# --- 4. .env (généré automatiquement au premier démarrage si absent) -----
if [ ! -f .env ]; then
  node -e "require('./src/ensureEnv').ensureEnv()"
  echo "    -> Pour l'IA (optionnel) : bash deploy/install-ollama.sh (gratuit, sans clé) ou GROQ_API_KEY dans .env (gratuit)."
else
  echo "==> .env déjà présent, inchangé."
fi

# --- 5. Service systemd (démarrage auto + redémarrage sur crash) ---------
echo "==> Configuration du service systemd ($SERVICE_NAME)..."
NODE_BIN="$(command -v node)"

sudo tee "/etc/systemd/system/${SERVICE_NAME}.service" > /dev/null <<EOF
[Unit]
Description=DJKS Bots — site de gestion de bots Discord
After=network.target

[Service]
Type=simple
User=${RUN_USER}
WorkingDirectory=${APP_DIR}
ExecStart=${NODE_BIN} ${APP_DIR}/server.js
EnvironmentFile=${APP_DIR}/.env
Restart=on-failure
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME" >/dev/null
sudo systemctl restart "$SERVICE_NAME"

PORT="$(grep -E '^PORT=' .env | cut -d= -f2)"
PORT="${PORT:-3000}"
PUBLIC_IP="$(curl -s -4 --max-time 3 ifconfig.me || echo '<IP_DU_VPS>')"

echo ""
echo "✅ DJKS Bots tourne en continu (redémarre seul en cas de crash ou de reboot)."
echo ""
echo "Site accessible sur : http://${PUBLIC_IP}:${PORT}"
echo "(ouvre le port si besoin : sudo ufw allow ${PORT}/tcp)"
echo ""
echo "Commandes utiles :"
echo "  sudo systemctl status  ${SERVICE_NAME}     # état du service"
echo "  sudo systemctl restart ${SERVICE_NAME}     # redémarrer"
echo "  sudo systemctl stop    ${SERVICE_NAME}     # arrêter"
echo "  sudo journalctl -u ${SERVICE_NAME} -f       # logs en direct"
echo ""
echo "Pour du HTTPS avec un nom de domaine, vois deploy/Caddyfile.example."
