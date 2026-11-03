# ─────────────────────────────────────────────────────────────────────────────
# vado bene? — Next.js 15 standalone
# Multi-stage: deps → builder → runner su node:20-slim.
# MAI alpine: sharp non gira su musl.
# Le NEXT_PUBLIC_* sono inlineate nel bundle a build time (stage builder):
# senza build-args il client parte senza Supabase/PostHog. I secret server-side
# (ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY, ...) passano a runtime via
# env_file/environment — MAI come build args.
# ─────────────────────────────────────────────────────────────────────────────

FROM node:20-slim AS deps

# Rete aziendale con TLS interception: il download di pnpm via corepack fallisce
# con SELF_SIGNED_CERT_IN_CHAIN. Come Autopilot: bypass solo negli stadi di
# build; il runner resta pulito. Rimuovere in ambienti di rete puliti.
ENV NODE_TLS_REJECT_UNAUTHORIZED=0

# corepack legge la versione da "packageManager" in package.json (pnpm@9.15.9)
RUN corepack enable

WORKDIR /app

# Solo i manifest: le modifiche ai sorgenti non invalidano la cache di install.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# sharp compila via onlyBuiltDependencies in pnpm-workspace.yaml.
RUN pnpm install --frozen-lockfile

# ─── Builder ─────────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

# Stesso bypass della rete aziendale (solo build-time, vedi sopra).
ENV NODE_TLS_REJECT_UNAUTHORIZED=0

RUN corepack enable

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

COPY . .

# NEXT_PUBLIC_* inlineate nel bundle a build time (passate come build-args).
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY \
    NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

# output: "standalone" (next.config.ts) produce .next/standalone
RUN pnpm build

# ─── Runner ──────────────────────────────────────────────────────────────────
FROM node:20-slim AS runner

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nextjs \
    && useradd --system --uid 1001 --gid nextjs --home-dir /app nextjs

WORKDIR /app

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

RUN chown -R nextjs:nextjs /app

USER nextjs

EXPOSE 3000

# node:20-slim non include curl (quello di Autopilot lo installa via apt):
# healthcheck con node fetch, zero dipendenze extra.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
