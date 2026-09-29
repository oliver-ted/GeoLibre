# check=skip=SecretsUsedInArgOrEnv
# Hugging Face Docker Space image for Geoverse.
#
# Builds the web app from source (the GitHub repository below, not the Space's
# own files) and serves it with nginx on port 7860 as UID 1000, which is how
# Hugging Face runs Docker Spaces. The optional Python sidecar (format
# conversion, Whitebox, raster tools) runs alongside it, as in the upstream
# image. Copy this file to the root of the Space repository as `Dockerfile`.
#
# The runtime stage mirrors the repository's own Dockerfile. The differences are
# all about running unprivileged: port 7860, a pid file and Basic Auth password
# file under /tmp, and UID 1000 owning the few paths the entrypoint and nginx
# write at startup.

# ---------------------------------------------------------------------------
# Build stage: download the source and produce the static web build.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS build

ARG GEOVERSE_REPO=oliver-ted/GeoLibre
ARG GEOVERSE_REF=main

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# JupyterLite (the Notebook panel) is generated at build time with the
# `jupyter lite` CLI, installed into its own virtualenv.
ENV VIRTUAL_ENV=/opt/jupyterlite
RUN python3 -m venv "$VIRTUAL_ENV"
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# ADD re-downloads a remote URL on every build and only reuses the cache when
# the bytes are unchanged, so a new commit on the branch always rebuilds from
# here. (A `git clone` layer would stay cached and keep serving old code.)
ADD https://codeload.github.com/${GEOVERSE_REPO}/tar.gz/refs/heads/${GEOVERSE_REF} /tmp/source.tar.gz
WORKDIR /app
RUN tar -xzf /tmp/source.tar.gz --strip-components=1 -C /app && rm /tmp/source.tar.gz

RUN npm ci
RUN pip install --no-cache-dir -r apps/geolibre-desktop/jupyterlite/requirements.txt

# Optional keys baked into the web build (the upstream image is built with its
# own). Hugging Face passes Space *variables* to the build as build args, so
# setting one in the Space settings enables that feature; empty leaves it off.
# Both end up in the public JavaScript bundle (every VITE_ value does), so they
# are browser-facing client IDs, never private secrets.
ARG VITE_GEE_OAUTH_CLIENT_ID=
ARG VITE_MAPILLARY_ACCESS_TOKEN=
ENV VITE_GEE_OAUTH_CLIENT_ID=${VITE_GEE_OAUTH_CLIENT_ID} \
    VITE_MAPILLARY_ACCESS_TOKEN=${VITE_MAPILLARY_ACCESS_TOKEN}

# Same build configuration the repository's Dockerfile uses by default.
ENV GEOLIBRE_APP_BASE=/ \
    VITE_GEOLENS_DEFAULT_URL=same-origin \
    GEOLIBRE_JUPYTERLITE_REQUIRED=1
RUN npm run build
RUN test -f apps/geolibre-desktop/dist/jupyterlite/lab/index.html \
  || (echo "ERROR: dist/jupyterlite is missing." && exit 1)

# ---------------------------------------------------------------------------
# Runtime stage: nginx + the Python sidecar, unprivileged, on port 7860.
# ---------------------------------------------------------------------------
FROM python:3.12-slim-bookworm AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends nginx libexpat1 openssl \
  && rm -rf /var/lib/apt/lists/* \
  && rm -f /etc/nginx/sites-enabled/default

# Hugging Face runs the container as UID 1000 and recommends a matching user
# with a home directory (the sidecar and pip caches write under $HOME).
RUN useradd -m -u 1000 user
ENV HOME=/home/user

COPY --from=build /app/backend/geolibre_server /opt/geolibre_server
RUN pip install --no-cache-dir /opt/geolibre_server \
  && pip install --no-cache-dir "duckdb>=1.1.0" "rio-cogeo>=5.0.0" \
  && pip install --no-cache-dir "freestiler>=0.1.0" "whitebox-workflows>=2.0.2"

ENV GEOLIBRE_CONVERSION_PYTHON=/usr/local/bin/python \
    WBW_EXTERNAL_PYTHON=/usr/local/bin/python \
    GEOLIBRE_CONVERSION_ROOTS=/data

COPY --from=build /app/docker/nginx.conf /etc/nginx/nginx.conf.template
COPY --from=build /app/docker/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY --from=build /app/apps/geolibre-desktop/dist /usr/share/nginx/html

# Adapt the upstream files for an unprivileged user. Each edit is checked, so an
# upstream change that moves one of these lines fails the build loudly instead
# of producing an image that crashes on start.
RUN set -e \
  && chmod +x /usr/local/bin/entrypoint.sh \
  # nginx: listen on 7860 (an unprivileged user cannot bind port 80).
  && sed -i 's/^    listen 80;$/    listen 7860;/' /etc/nginx/nginx.conf.template \
  && grep -q '^    listen 7860;$' /etc/nginx/nginx.conf.template \
  # nginx: the pid file goes to /tmp, and drop `user` (only valid as root).
  && sed -i -e 's#^pid /run/nginx.pid;#pid /tmp/nginx.pid;#' -e '/^user www-data;/d' /etc/nginx/nginx.conf \
  && grep -q '^pid /tmp/nginx.pid;' /etc/nginx/nginx.conf \
  # entrypoint: keep the optional Basic Auth password file somewhere UID 1000
  # can create it, and skip the root-only chown.
  && sed -i \
       -e 's#^HTPASSWD=/etc/nginx/.htpasswd$#HTPASSWD=/tmp/geolibre-htpasswd#' \
       -e 's#auth_basic_user_file /etc/nginx/.htpasswd;#auth_basic_user_file /tmp/geolibre-htpasswd;#' \
       -e '/^  chown root:www-data "\$HTPASSWD"$/d' \
       -e 's#^  chmod 640 "\$HTPASSWD"$#  chmod 600 "$HTPASSWD"#' \
       /usr/local/bin/entrypoint.sh \
  && grep -q '^HTPASSWD=/tmp/geolibre-htpasswd$' /usr/local/bin/entrypoint.sh \
  && grep -q 'auth_basic_user_file /tmp/geolibre-htpasswd;' /usr/local/bin/entrypoint.sh \
  && ! grep -q 'chown root:www-data' /usr/local/bin/entrypoint.sh \
  && grep -q '^  chmod 600 "\$HTPASSWD"$' /usr/local/bin/entrypoint.sh \
  # Default snippets the entrypoint rewrites on every start.
  && printf '# Basic Auth disabled (GEOLIBRE_AUTH_USER/GEOLIBRE_AUTH_PASSWORD not set).\n' > /etc/nginx/geolibre-auth.conf \
  && printf '# AI proxy disabled (GEOLIBRE_AI_URL not set).\n' > /etc/nginx/geolibre-ai-proxy.conf \
  # Hand UID 1000 exactly the paths written at startup.
  && mkdir -p /data \
  && chown -R 1000:1000 /etc/nginx/conf.d /var/lib/nginx /var/log/nginx /data \
  && chown 1000:1000 /etc/nginx/geolibre-auth.conf /etc/nginx/geolibre-ai-proxy.conf \
       /usr/share/nginx/html/geolibre-runtime-config.js

USER 1000
WORKDIR /home/user
EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:7860/healthz', timeout=4).status==200 else 1)" || exit 1

CMD ["/usr/local/bin/entrypoint.sh"]
