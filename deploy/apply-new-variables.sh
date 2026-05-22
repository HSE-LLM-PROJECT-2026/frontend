#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHART_DIR="${CHART_DIR:-$SCRIPT_DIR/helm/frontend}"
VALUES_FILE="${VALUES_FILE:-$SCRIPT_DIR/values.frontend.yaml}"
KUBECONFIG_PATH="${KUBECONFIG_PATH:-/home/oleg/Documents/hse-llm-project/cluster-config/llm_proj_talos/kubeconfig}"
NAMESPACE="${NAMESPACE:-hse-llm-project}"
RELEASE_NAME="${RELEASE_NAME:-frontend}"
DOCKERHUB_USERNAME="${DOCKERHUB_USERNAME:-awesomecosmonaut}"
IMAGE_NAME="${IMAGE_NAME:-frontend}"
IMAGE_REPOSITORY="${IMAGE_REPOSITORY:-$DOCKERHUB_USERNAME/$IMAGE_NAME}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

log() {
  echo "[frontend] $*"
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "[frontend] ERROR: command not found: $1" >&2
    exit 1
  }
}

log "Starting variables update"
log "Namespace: $NAMESPACE | Release: $RELEASE_NAME"
log "Chart dir: $CHART_DIR"
log "Values file: $VALUES_FILE"
log "Kubeconfig: $KUBECONFIG_PATH"
log "Image: $IMAGE_REPOSITORY:$IMAGE_TAG"

log "Checking required commands..."
need_cmd helm
need_cmd kubectl
log "Commands OK"

[[ -f "$KUBECONFIG_PATH" ]] || {
  echo "[frontend] ERROR: kubeconfig not found: $KUBECONFIG_PATH" >&2
  exit 1
}

[[ -d "$CHART_DIR" ]] || {
  echo "[frontend] ERROR: chart dir not found: $CHART_DIR" >&2
  exit 1
}

[[ -f "$VALUES_FILE" ]] || {
  echo "[frontend] ERROR: values file not found: $VALUES_FILE" >&2
  exit 1
}

export KUBECONFIG="$KUBECONFIG_PATH"

log "Checking that release exists..."
if ! helm status "$RELEASE_NAME" -n "$NAMESPACE" >/dev/null 2>&1; then
  echo "[frontend] ERROR: release '$RELEASE_NAME' not found in namespace '$NAMESPACE'" >&2
  echo "[frontend] Run ./deploy-from-scratch.sh first" >&2
  exit 1
fi

log "Applying new values via helm upgrade..."
helm upgrade "$RELEASE_NAME" "$CHART_DIR" \
  --namespace "$NAMESPACE" \
  -f "$VALUES_FILE" \
  --set-string image.repository="$IMAGE_REPOSITORY" \
  --set-string image.tag="$IMAGE_TAG"

log "Update finished. Current resources:"
kubectl get pods,svc,ing -n "$NAMESPACE" -l "app.kubernetes.io/instance=$RELEASE_NAME"
