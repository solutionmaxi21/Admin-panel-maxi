# syntax=docker/dockerfile:1
# ============================================================
# MaxiStore — Frontend Next.js (sortie standalone)
# ============================================================
# Point d'entree unique de l'application : sert le storefront,
# et proxifie /api + /uploads vers le backend Express (rewrites).
# ============================================================

# ---- Stage 1 : dependances ----------------------------------
FROM node:22-alpine AS deps

# libc6-compat est requis par les binaires natifs de Next.js (SWC)
RUN apk add --no-cache libc6-compat

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- Stage 2 : build ----------------------------------------
FROM node:22-alpine AS builder

RUN apk add --no-cache libc6-compat

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Les rewrites de next.config.mjs sont evalues au build : cette valeur est
# donc figee dans l'image. Le nom du service Compose est stable.
ARG BACKEND_URL=http://backend:3001
ENV BACKEND_URL=$BACKEND_URL

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# ---- Stage 3 : runtime --------------------------------------
FROM node:22-alpine AS runner

RUN apk add --no-cache libc6-compat

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Utilisateur non-root
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs nextjs

# Assets statiques et service worker PWA generes au build
COPY --from=builder /app/public ./public

# Sortie standalone : embarque uniquement les modules reellement utilises
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/').then(r=>{if(!r.ok)throw new Error();process.exit(0)}).catch(()=>process.exit(1));"

CMD ["node", "server.js"]
