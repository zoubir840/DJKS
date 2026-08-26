#!/usr/bin/env bash
# Installe une IA 100% GRATUITE et SANS AUCUNE CLÉ pour DJKS Bots : Ollama,
# qui fait tourner un modèle en local sur ce serveur (aucun compte, aucune
# carte bancaire, aucune limite d'usage — juste les ressources de ta machine).
#
#   bash deploy/install-ollama.sh [modele]
#
# Sans argument, installe llama3.2:3b (~2 Go, un bon compromis qualité/
# ressources pour un petit VPS, testé et validé pour ce projet). Tu peux
# choisir un autre modèle Ollama en argument, par ex :
#   bash deploy/install-ollama.sh qwen2.5:3b
#   bash deploy/install-ollama.sh phi3:mini
#
# Recommandé : au moins 4 Go de RAM libres. Sur un VPS avec moins de RAM,
# les réponses seront lentes voire impossibles (le modèle sera "OOM-killé").
# Si ton VPS est petit, préfère plutôt Groq (gratuit aussi, mais dans le
# cloud) : voir la section IA du README.

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODEL="${1:-llama3.2:3b}"

echo "==> Installation d'Ollama (IA locale gratuite, sans clé)..."
if ! command -v ollama >/dev/null 2>&1; then
  curl -fsSL https://ollama.com/install.sh | sh
else
  echo "==> Ollama déjà installé : $(ollama -v 2>&1 | head -1)"
fi

echo "==> Démarrage du service Ollama..."
sudo systemctl enable --now ollama >/dev/null 2>&1 || true

echo "==> Téléchargement du modèle ${MODEL} (peut prendre quelques minutes)..."
ollama pull "$MODEL"

cd "$APP_DIR"
if [ ! -f .env ]; then
  node -e "require('./src/ensureEnv').ensureEnv()"
fi

if grep -q '^OLLAMA_MODEL=' .env; then
  sed -i "s/^OLLAMA_MODEL=.*/OLLAMA_MODEL=${MODEL}/" .env
else
  printf '\nOLLAMA_MODEL=%s\n' "$MODEL" >> .env
fi

echo ""
echo "✅ Ollama est prêt avec le modèle ${MODEL}, et .env a été mis à jour."
echo "   (OLLAMA_MODEL a la priorité sur GROQ_API_KEY et ANTHROPIC_API_KEY"
echo "   s'ils sont aussi définis — voir src/ai.js)"
echo ""
if systemctl is-active --quiet djks-bots 2>/dev/null; then
  echo "==> Redémarrage du service djks-bots pour prendre en compte le changement..."
  sudo systemctl restart djks-bots
  echo "✅ Fait. L'assistant IA et le générateur de commandes utilisent maintenant Ollama."
else
  echo "Redémarre le site (ou relance deploy/install-vps.sh) pour appliquer le changement."
fi
