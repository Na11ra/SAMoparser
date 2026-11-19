FROM node:22.13.1-alpine AS build
WORKDIR /app
COPY services/web/package.json services/web/package-lock.json ./
RUN npm ci
COPY services/web ./
RUN npm run build

FROM nginx:1.27.3-alpine
RUN addgroup -S -g 10001 sam && adduser -S -D -H -u 10001 -G sam sam \
    && sed -i 's/user  nginx;/user  sam;/' /etc/nginx/nginx.conf
COPY services/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
RUN chown -R sam:sam /var/cache/nginx /var/log/nginx /etc/nginx /usr/share/nginx/html \
    && touch /var/run/nginx.pid && chown sam:sam /var/run/nginx.pid
USER sam
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -q -O - http://127.0.0.1:8080/health >/dev/null || exit 1
