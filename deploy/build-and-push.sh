#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKERHUB_USERNAME="${DOCKERHUB_USERNAME:-awesomecosmonaut}"
IMAGE_NAME="${IMAGE_NAME:-frontend}"
IMAGE_REPOSITORY="${IMAGE_REPOSITORY:-$DOCKERHUB_USERNAME/$IMAGE_NAME}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
IMAGE="${IMAGE_REPOSITORY}:${IMAGE_TAG}"

log() {
  echo "[frontend] $*"
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "[frontend] ERROR: command not found: $1" >&2
    exit 1
  }
}

log "Building and pushing frontend image"
log "Image: $IMAGE"

log "Checking required commands..."
need_cmd docker
log "Commands OK"

log "Docker build..."
docker build -f "$SCRIPT_DIR/Dockerfile" -t "$IMAGE" "$SCRIPT_DIR/.."

log "Docker push..."
docker push "$IMAGE"

log "Done: $IMAGE pushed to registry"
