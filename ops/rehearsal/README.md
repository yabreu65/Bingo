# M5.10 isolated rehearsal

This Compose project is a disposable local rehearsal environment. It has a named resource prefix so its containers, volumes, and network cannot be confused with other projects.

## Local validation before a public hostname exists

Use a temporary environment file outside the repository:

```bash
cd /Users/yoryiabreu/proyectos/bingo-bailable

ENV_FILE="$(mktemp /tmp/bingo-m59-env.XXXXXX)"
MONGO_PASSWORD="$(openssl rand -hex 32)"
JWT_SECRET_VALUE="$(openssl rand -hex 32)"
cat > "$ENV_FILE" <<EOF
BINGO_ACCESS_MODE=local
FRONTEND_URL=http://127.0.0.1:8080
ALLOWED_ORIGINS=http://127.0.0.1:8080
TRUST_PROXY_HOPS=0
VITE_BACKEND_URL=same-origin
VITE_SHAREABLE_ORIGIN=http://127.0.0.1:8080
FRONTEND_PORT=8080
MONGO_ROOT_USERNAME=bingo_m59
MONGO_ROOT_PASSWORD=$MONGO_PASSWORD
JWT_SECRET=$JWT_SECRET_VALUE
EOF

docker compose --env-file "$ENV_FILE" \
  -f ops/rehearsal/docker-compose.yml config --quiet

docker compose --env-file "$ENV_FILE" \
  -f ops/rehearsal/docker-compose.yml \
  --project-name bingo-m59-rehearsal up --build -d
```

Verify only the loopback origin:

```bash
curl -fsS http://127.0.0.1:8080/health
docker compose --env-file "$ENV_FILE" \
  -f ops/rehearsal/docker-compose.yml \
  --project-name bingo-m59-rehearsal ps
```

The MongoDB and Node ports are private to the Compose network. Only Nginx is bound to `127.0.0.1:8080`.

## Public configuration after explicit authorization

Do not open a tunnel until the local rehearsal passes. After the approved Quick Tunnel returns an HTTPS hostname, replace the placeholder in `ops/rehearsal/.env.example` and create a temporary `.env` outside Git. The same exact origin must be used in `FRONTEND_URL`, `ALLOWED_ORIGINS`, and `VITE_SHAREABLE_ORIGIN`; wildcards and localhost are invalid in public mode.

Rebuild the frontend after changing the Vite origin:

```bash
docker compose --env-file "$ENV_FILE" \
  -f ops/rehearsal/docker-compose.yml \
  --project-name bingo-m59-rehearsal build frontend
```

The tunnel must target only `http://127.0.0.1:8080`. It must never target MongoDB, the backend port, or the loopback media port.

## Synthetic LOCAL_TV media

Use only the versioned fixtures in `e2e/fixtures/media`. Keep the media service on `127.0.0.1` and pass the exact public HTTPS origin as `--allow-origin` when the TV page is opened from that origin. Do not mount `bingo-react/public/music` into a public container.

## Stop and remove only rehearsal resources

```bash
docker compose --env-file "$ENV_FILE" \
  -f ops/rehearsal/docker-compose.yml \
  --project-name bingo-m59-rehearsal down
```

Do not add `--volumes` until the rehearsal data has been reviewed. If the owner explicitly approves deleting only these named resources, use `down --volumes` and verify that the names are exactly `bingo_m59_mongo_data`, `bingo_m59_uploads`, and `bingo_m59_logs`. Never use `docker volume prune`.

Remove the temporary environment file only after the rehearsal is closed. Never print it or include it in an artifact.
