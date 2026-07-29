# ---------- Stage 1: build the React frontend ----------
FROM node:20-bookworm-slim AS frontend

WORKDIR /app/frontend
COPY frontend/package.json ./

# @emergentbase/visual-edits is a dev-only tarball from Emergent's asset host and
# is never loaded in a production build (craco.config.js gates it on NODE_ENV).
# Dropping it here keeps the install from depending on that host being up.
RUN node -e "const p=require('./package.json'); delete p.devDependencies['@emergentbase/visual-edits']; require('fs').writeFileSync('package.json', JSON.stringify(p,null,2))"

RUN yarn install --network-timeout 600000

COPY frontend/ ./
# Restore the stripped package.json edit after the source copy overwrites it.
RUN node -e "const p=require('./package.json'); delete p.devDependencies['@emergentbase/visual-edits']; require('fs').writeFileSync('package.json', JSON.stringify(p,null,2))"

# Same-origin deploy: API calls resolve to /api on whatever host serves this.
ENV REACT_APP_BACKEND_URL=""
ENV GENERATE_SOURCEMAP=false
ENV CI=false
RUN yarn build

# ---------- Stage 2: FastAPI runtime serving API + build ----------
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY --from=frontend /app/frontend/build ./static

EXPOSE 8000
# Render (and most PaaS) inject $PORT; default to 8000 for plain `docker run`.
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}"]
