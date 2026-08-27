#!/usr/bin/env bash
# Installe TOUT en une seule commande sur un serveur Debian/Ubuntu fraîchement
# provisionné, sans rien cloner à la main au préalable : le site, son
# service systemd permanent, ET l'IA locale gratuite (Ollama).
#
# Utilisation, depuis un terminal SSH sur le serveur :
#
#   bash <(curl -fsSL https://raw.githubusercontent.com/zoubir840/DJKS/claude/discord-bot-management-site-o5vtwp/deploy/bootstrap.sh)
#
# (adapte l'URL si tu utilises ton propre fork / une branche différente —
# voir DJKS_REPO_URL et DJKS_BRANCH ci-dessous)
#
# Relance-le sans risque à tout moment : il met juste à jour le dépôt et
# les services existants plutôt que de tout recréer.

set -euo pipefail

REPO_URL="${DJKS_REPO_URL:-https://github.com/zoubir840/DJKS.git}"
BRANCH="${DJKS_BRANCH:-claude/discord-bot-management-site-o5vtwp}"
TARGET_DIR="${DJKS_DIR:-$HOME/djks-bots}"
OLLAMA_MODEL="${DJKS_OLLAMA_MODEL:-llama3.2:3b}"

echo "=================================================="
echo " DJKS Bots — installation complète en une commande"
echo "=================================================="
echo ""

# --- 1. git ---------------------------------------------------------------
if ! command -v git >/dev/null 2>&1; then
  echo "==> Installation de git..."
  sudo apt-get update -qq
  sudo apt-get install -y git
fi

# --- 2. Récupération du code -----------------------------------------------
if [ -d "$TARGET_DIR/.git" ]; then
  echo "==> Dépôt déjà présent dans $TARGET_DIR, mise à jour..."
  git -C "$TARGET_DIR" fetch origin "$BRANCH"
  git -C "$TARGET_DIR" checkout "$BRANCH"
  git -C "$TARGET_DIR" pull --ff-only origin "$BRANCH"
else
  echo "==> Clonage du dépôt dans $TARGET_DIR (branche $BRANCH)..."
  git clone --branch "$BRANCH" "$REPO_URL" "$TARGET_DIR"
fi

cd "$TARGET_DIR"

# --- 3. Le site (Node.js, dépendances, .env, service systemd permanent) ---
bash deploy/install-vps.sh

# --- 4. L'IA locale gratuite, sans aucune clé (Ollama) ---------------------
echo ""
bash deploy/install-ollama.sh "$OLLAMA_MODEL"

echo ""
echo "=================================================="
echo " 🎉 Tout est installé et configuré."
echo "=================================================="
echo ""
echo "Dossier du site   : $TARGET_DIR"
echo "Service du site   : sudo systemctl status djks-bots"
echo "Service Ollama    : sudo systemctl status ollama"
echo "Logs en direct    : sudo journalctl -u djks-bots -f"
echo ""
echo "Pour activer le panneau d'administration, ajoute une ligne ADMIN_CODE"
echo "dans $TARGET_DIR/.env puis : sudo systemctl restart djks-bots"
