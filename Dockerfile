# Nuestro rinconcito — imagen liviana para publicar el juego.
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DATA_DIR=/data

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund

COPY server ./server
COPY shared ./shared
COPY public ./public

# Las islas se guardan acá: montá un volumen para no perderlas al actualizar.
RUN mkdir -p /data && chown -R node:node /data
VOLUME ["/data"]
USER node

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "server/index.js"]
