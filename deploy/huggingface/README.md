---
title: Geoverse
emoji: 🌍
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
pinned: false
---

# Geoverse on Hugging Face Spaces

This folder holds the two files a Hugging Face **Docker Space** needs to run
Geoverse built from this repository's `main` branch:

- `Dockerfile`: downloads `oliver-ted/GeoLibre@main` from GitHub, builds the
  web app, and serves it with nginx on port 7860 as UID 1000. The optional
  Python sidecar (conversion, Whitebox and raster tools) runs alongside it.
- `README.md` (this file): its YAML header tells Hugging Face to use Docker
  and port 7860.

Copy both to the **root** of the Space repository, replacing the Space's
existing `Dockerfile` and `README.md`. The Space needs no other files; the
source code comes from GitHub at build time.

## Updating the Space

A push to GitHub does not rebuild the Space. After changing `main`, open the
Space's **Settings** and click **Factory rebuild**. The build downloads the
current `main` every time, so new commits are picked up.

## Optional settings (Space → Settings → Variables and secrets)

| Name | Kind | Effect |
| --- | --- | --- |
| `VITE_GEE_OAUTH_CLIENT_ID` | variable (build time) | Enables Google Earth Engine sign-in. |
| `VITE_MAPILLARY_ACCESS_TOKEN` | variable (build time) | Enables the Mapillary layer. |
| `GEOLIBRE_DISABLE_SIDECAR` | variable | Set to `1` to turn off the Python sidecar. |
| `GEOLIBRE_AUTH_USER` / `GEOLIBRE_AUTH_PASSWORD` | secrets | Password-protects the whole app (HTTP Basic Auth). |

Build-time variables only take effect after a **Factory rebuild**.
