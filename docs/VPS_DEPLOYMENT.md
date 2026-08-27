# SlayQL VPS Deployment Guide

This guide deploys the current `main` branch to the VPS serving
`https://fyp.kianlok.top`.

## Does pushing to GitHub update the VPS automatically?

The repository includes `.github/workflows/deploy-vps.yml`. After that file is
committed and its five repository secrets are configured, pushes to `main` that
change application or deployment files automatically update the VPS. A
documentation-only push does not trigger deployment. The workflow can also be
started manually from the GitHub Actions page.

The workflow pulls `main`, builds both images, recreates the Compose services,
checks the API inside its container, and then checks the public health endpoint.
It does not copy or expose `.env.production`.

## Deployment layout

The repository includes:

- `deploy/docker-compose.yml`: FastAPI (`slayql_api`) and Caddy/frontend
  (`slayql_web`).
- `deploy/Dockerfile.api`: builds and runs the FastAPI API on port `8000`.
- `deploy/Dockerfile.web`: builds the Vite frontend and serves `dist` with
  Caddy.
- `deploy/Caddyfile`: serves the SPA and proxies `/api/*` to the API with SSE
  buffering disabled.

The current VPS checkout is `/opt/slayql`. It also has an untracked,
VPS-specific `docker-compose.vps.yml` override that removes the base public
port bindings and connects `slayql_web` to the external `n8n_default` network.
The public `n8n-caddy-1` container owns ports 80/443 and proxies
`fyp.kianlok.top` to `slayql_web:80`. Every production Compose command must use
both Compose files.

Use the Docker Compose procedure below if `slayql_api` and `slayql_web` are the
containers currently serving the site. If Caddy and the API are installed as
host services instead, use the host-service procedure.

## 1. Commit and push from the development machine

Review the changes carefully. Do not add `.env`, `.env.production`,
database credentials, or generated runtime databases.

```bash
git status --short
git diff --check
git add backend/app backend/tests src docs/VPS_DEPLOYMENT.md
git commit -m "Improve agent run response latency"
git push origin main
```

The tracked `backend/data/slayql_demo.sqlite3` file may appear modified after
local tests. Include it only when its data was intentionally changed.

## 2. Identify how the VPS currently runs SlayQL

SSH into the VPS:

```bash
ssh <vps-user>@<vps-address>
```

Check Docker and host services:

```bash
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}'
docker compose ls
sudo systemctl status caddy --no-pager
sudo systemctl list-units --type=service | grep -i slayql
```

- This VPS has `slayql_api` and `slayql_web`; follow **Docker Compose
  deployment**.
- If host Caddy serves the repository's `dist` directory and a systemd service
  runs Uvicorn, follow **Host-service deployment**.
- Do not start the Compose `web` service if host Caddy already owns ports 80
  and 443 unless the existing setup deliberately routes around that conflict.

## 3. Protect production state

Before deployment, locate the application directory and check for VPS-only
changes:

```bash
cd /opt/slayql
git status --short
git branch --show-current
git rev-parse HEAD
```

The two currently expected untracked files are `docker-compose.vps.yml` and
`Caddyfile.edge.snippet`. Do not delete them during a normal deployment.

Production secrets must stay on the VPS. The deployment environment file is
ignored by Git and must not be overwritten by `git pull`:

```bash
ls -l .env.production
chmod 600 .env.production
```

It should define at least:

```env
APP_ENV=production
OPENROUTER_KEY=<production-key>
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
GEMINI_API_KEY=<production-key>
DATABASE_URL=<supabase-postgresql-uri>
BACKEND_DATABASE_SCHEMA=slayql
FIELD_ENCRYPTION_KEY=<existing-fernet-key>
```

Do not generate a new `FIELD_ENCRYPTION_KEY` during a normal deploy. Existing
encrypted data-source credentials can only be decrypted with the current key.
Rotating it requires decrypting and re-encrypting those records as a migration.

If the Compose named volume stores uploaded SQLite sources, back it up before a
high-risk deployment:

```bash
docker volume ls | grep -i slayql
mkdir -p backups
docker run --rm -v <slayql-volume-name>:/data:ro -v "$PWD/backups":/backup alpine \
  tar -czf /backup/slayql-data-before-deploy.tar.gz -C /data .
```

Supabase should have its own backup or point-in-time recovery policy. The Docker
volume backup does not back up Supabase.

## 4A. Docker Compose deployment

Use `--env-file` explicitly because `.env.production` is not loaded by every
Compose invocation automatically. Always include the VPS override after the
base file; omitting it would conflict with the existing public Caddy container.

Fetch first and inspect what will change:

```bash
cd /opt/slayql
git fetch origin
git log --oneline HEAD..origin/main
git diff --stat HEAD..origin/main
```

Update only with a fast-forward merge:

```bash
git pull --ff-only origin main
```

Validate the resolved Compose configuration without printing it, because it
contains secrets:

```bash
docker compose --env-file .env.production \
  -f deploy/docker-compose.yml \
  -f docker-compose.vps.yml config --quiet
```

Build both images. Rebuilding only the API leaves the old frontend JavaScript
running; rebuilding only the web image leaves the old backend running.

```bash
docker compose --env-file .env.production \
  -f deploy/docker-compose.yml \
  -f docker-compose.vps.yml build --pull api web

docker compose --env-file .env.production \
  -f deploy/docker-compose.yml \
  -f docker-compose.vps.yml up -d --remove-orphans
```

Check container health and logs:

```bash
docker compose --env-file .env.production \
  -f deploy/docker-compose.yml \
  -f docker-compose.vps.yml ps

docker compose --env-file .env.production \
  -f deploy/docker-compose.yml \
  -f docker-compose.vps.yml logs --tail=100 api web
```

The Compose deployment rebuilds the internal SlayQL Caddy/frontend container.
It does not need to recreate or reload `n8n-caddy-1` for an application-code
deployment because its `fyp.kianlok.top` route already targets `slayql_web:80`.

## 4B. Host-service deployment

Use this only when the VPS does not run the repository's Compose `web` service.
Preserve the existing `/etc/caddy/Caddyfile`; an application code deploy does
not require replacing a working Caddy configuration.

Update and build the frontend:

```bash
cd /opt/slayql
git fetch origin
git pull --ff-only origin main
npm ci
npm run build
```

Update the backend environment using the existing virtual environment and
restart the existing service name:

```bash
cd /opt/slayql
./.venv/bin/pip install -r backend/requirements.txt
sudo systemctl restart slayql-api
sudo systemctl status slayql-api --no-pager
sudo journalctl -u slayql-api -n 100 --no-pager
```

Reload Caddy only if its configuration or document root changed:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo systemctl status caddy --no-pager
```

The existing Caddy route should preserve `/api/*` and stream SSE without
buffering. The repository's equivalent proxy block is:

```caddyfile
handle /api/* {
    reverse_proxy 127.0.0.1:8000 {
        flush_interval -1
    }
}
```

Do not use `handle_path /api/*` unless the backend is intentionally configured
for a stripped prefix; SlayQL expects routes such as `/api/v1/agent-runs`.

## 5. Verify the live deployment

For Docker Compose, run:

```bash
docker exec slayql_api curl --fail --silent --show-error \
  http://127.0.0.1:8000/api/v1/health
curl --fail --silent --show-error https://fyp.kianlok.top/api/v1/health
curl --head https://fyp.kianlok.top
```

For a host-level API service, the equivalent internal check is:

```bash
curl --fail --silent --show-error http://127.0.0.1:8000/api/v1/health
```

Expected health fields include:

```json
{
  "status": "healthy",
  "backend_database": "supabase"
}
```

Then verify in a browser:

1. Hard-refresh `https://fyp.kianlok.top`.
2. Open Live Demo and send a greeting.
3. Send a minimal-effort SQL question.
4. Confirm the answer appears as soon as `run.completed` arrives.
5. Refresh the page and confirm the conversation was persisted.
6. Inspect the browser Network panel for one `POST /api/v1/agent-runs` request
   followed by an SSE `GET /events` request.

## 6. Rollback

Record the current commit before every deployment:

```bash
git rev-parse HEAD
```

To roll back without rewriting Git history, switch the VPS checkout to the
known-good commit and rebuild/restart using the same deployment method:

```bash
git switch --detach <known-good-commit>
docker compose --env-file .env.production \
  -f deploy/docker-compose.yml \
  -f docker-compose.vps.yml up -d --build --remove-orphans
```

After a fixed commit is pushed, return the VPS to `main`:

```bash
git switch main
git pull --ff-only origin main
docker compose --env-file .env.production \
  -f deploy/docker-compose.yml \
  -f docker-compose.vps.yml up -d --build --remove-orphans
```

Do not remove the named Docker volume during rollback. Avoid `docker compose
down -v`, because `-v` deletes persistent uploaded databases and other volume
state.

## Automatic deployment secrets

Before pushing the workflow, add these **repository secrets** under GitHub
`Settings > Secrets and variables > Actions`:

- `VPS_HOST`
- `VPS_USER`
- `VPS_PORT`
- `VPS_SSH_PRIVATE_KEY`
- `VPS_KNOWN_HOSTS`

The VPS's database URL, AI credentials, and `FIELD_ENCRYPTION_KEY` do not belong
in GitHub Actions. They remain in `/opt/slayql/.env.production`.

The workflow serializes production deployments, refuses to pull over tracked
VPS modifications, preserves untracked VPS configuration, and never removes
the persistent Docker volume. For stronger isolation, replace the current root
deployment key later with a restricted deployment user or forced SSH command.
