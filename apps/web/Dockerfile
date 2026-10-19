FROM node:24-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS build
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@11.19.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile
COPY apps/web/ apps/web/
RUN pnpm --filter web build

# Caddy entrega los archivos y termina HTTPS en un único servicio.
FROM caddy:2-alpine@sha256:d8542f48d34a9cf4e4c11a478865229840e87e4c96ea3f439101f31a5d35f75f AS runtime
# La imagen oficial asigna cap_net_bind_service al binario. Se retira para ejecutar
# con cap_drop ALL; el Compose local permite los puertos bajos sólo en su namespace.
RUN setcap -r /usr/bin/caddy && mkdir -p /data/caddy /config/caddy && chown -R 1000:1000 /data /config
COPY --from=build /workspace/apps/web/dist /srv
COPY infra/proxy/Caddyfile* /etc/caddy/
USER 1000:1000
EXPOSE 80 443
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
