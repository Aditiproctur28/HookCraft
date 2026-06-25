# ───────────────────────────────────────────────────────────────────────────
#  HookCraft backend image
#  Node + Remotion (headless Chromium) + Remotion's bundled ffmpeg/ffprobe.
#
#  IMPORTANT design notes:
#   • Debian (glibc) base is REQUIRED. Remotion's compositor binary and the
#     headless Chrome it drives do NOT run on Alpine/musl.
#   • The backend BUNDLES the Remotion compositions from frontend/src at render
#     time (see backend/services/renderService.js), so the image must contain
#     BOTH backend and frontend source + their node_modules.
#   • ffmpeg/ffprobe ship inside @remotion/compositor-* (installed with npm),
#     so no system ffmpeg is needed.
#   • fonts-noto provides Devanagari glyphs for the Hindi caption support.
#
#  Build context must be the REPO ROOT:  docker build -t hookcraft .
# ───────────────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim

# System libraries the headless Chromium needs, plus fonts for captions
# (fonts-noto / fonts-noto-cjk cover Hindi + a wide glyph range).
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libgbm1 \
    libasound2 libxrandr2 libxkbcommon0 libxfixes3 libxcomposite1 \
    libxdamage1 libpango-1.0-0 libcairo2 libcups2 libxshmfence1 \
    fonts-liberation fonts-noto fonts-noto-cjk ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Install dependencies first, so Docker can cache this layer when only
#    source code (not package.json) changes. ──
# Backend deps include @remotion/renderer, @remotion/bundler and the bundled
# ffmpeg compositor.
COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

# Frontend deps are required because the backend bundles the Remotion
# compositions out of frontend/src at render time.
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install

# ── Copy application source ──
COPY backend ./backend
COPY frontend ./frontend

# Pre-download the exact Chromium build Remotion uses, so the first render in
# production isn't delayed by a large download.
RUN cd backend && npx remotion browser ensure

ENV NODE_ENV=production
ENV PORT=3001
# Render scratch directory inside the container (must be writable).
ENV REMOTION_TEMP_DIR=/tmp/render-temp

EXPOSE 3001
WORKDIR /app/backend
CMD ["node", "server.js"]
