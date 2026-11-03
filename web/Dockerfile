# Vroomate has no npm dependencies, so the image is just Node plus the app.
FROM node:22-alpine
WORKDIR /app
COPY . .
ENV NODE_ENV=production \
    PORT=3000 \
    VROOMATE_DB=/data/vroomate.db \
    VROOMATE_UPLOADS=/data/uploads \
    VROOMATE_BACKUP_DIR=/data/backups \
    VROOMATE_BACKUP=1
# Database, photos and backups live on a mounted disk so they survive redeploys.
# Runs as root because hosted disks are usually mounted root-owned; the app itself needs no other privileges.
RUN mkdir -p /data
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
