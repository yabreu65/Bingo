FROM node:22-alpine@sha256:025b8e975a61d94e33abeafaad1255ef44e4898cf1a1b6446860009c72e6d284 AS build

WORKDIR /app
ARG VITE_BACKEND_URL=same-origin
ARG VITE_SHAREABLE_ORIGIN=
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL
ENV VITE_SHAREABLE_ORIGIN=$VITE_SHAREABLE_ORIGIN

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine@sha256:62223d644fa234c3a1cc785ee14242ec47a77364226f1c811d2f669f96dc2ac8 AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1/ || exit 1
