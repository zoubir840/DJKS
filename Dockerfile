# --- Étape de build : installe les dépendances (better-sqlite3 a besoin de
#     python3/make/g++ pour se compiler si aucun binaire précompilé n'est
#     disponible pour la plateforme cible) ---
FROM node:22-slim AS builder
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- Image finale : légère, sans outils de compilation ---
FROM node:22-slim AS runtime
WORKDIR /app

# NODE_ENV=production active les cookies de session "secure" (HTTPS
# uniquement). Ne le mets à "production" que si le conteneur est servi
# derrière un reverse proxy qui termine le TLS (Railway/Render/Fly le font
# automatiquement) — sinon la connexion échouera en boucle. Voir le README.
ENV NODE_ENV=development

RUN groupadd -r djks && useradd -r -g djks djks

COPY --from=builder /app/node_modules ./node_modules
COPY . .

RUN mkdir -p /app/data && chown -R djks:djks /app
VOLUME ["/app/data"]

USER djks
EXPOSE 3000

CMD ["node", "server.js"]
