#!/bin/bash
set -euo pipefail

KUBECONFIG_PATH="${KUBECONFIG_PATH:-/home/oleg/Documents/hse-llm-project/cluster-config/llm_proj_talos/kubeconfig}"
NAMESPACE="${NAMESPACE:-hse-llm-project}"
RELEASE_NAME="${RELEASE_NAME:-frontend}"
DELETE_NAMESPACE="${DELETE_NAMESPACE:-false}"

log() {
  echo "[frontend] $*"
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "[frontend] ERROR: command not found: $1" >&2
    exit 1
  }
}

log "Starting deletion"
log "Namespace: $NAMESPACE | Release: $RELEASE_NAME"
log "Delete namespace: $DELETE_NAMESPACE"
log "Kubeconfig: $KUBECONFIG_PATH"

log "Checking required commands..."
need_cmd helm
need_cmd kubectl
log "Commands OK"

[[ -f "$KUBECONFIG_PATH" ]] || {
  echo "[frontend] ERROR: kubeconfig not found: $KUBECONFIG_PATH" >&2
  exit 1
}

export KUBECONFIG="$KUBECONFIG_PATH"

log "Removing Helm release if it exists..."
if helm status "$RELEASE_NAME" -n "$NAMESPACE" >/dev/null 2>&1; then
  helm uninstall "$RELEASE_NAME" -n "$NAMESPACE"
else
  log "Release '$RELEASE_NAME' not found, deleting orphan resources by label"
  kubectl delete deployment,service,configmap,ingress,serviceaccount -n "$NAMESPACE" \
    -l "app.kubernetes.io/instance=$RELEASE_NAME" \
    --ignore-not-found=true
fi

if [[ "$DELETE_NAMESPACE" == "true" ]]; then
  log "Removing namespace '$NAMESPACE'..."
  kubectl delete namespace "$NAMESPACE" --ignore-not-found=true
  log "Waiting for namespace deletion..."
  kubectl wait --for=delete "namespace/$NAMESPACE" --timeout=180s >/dev/null 2>&1 || true
  log "Done: release and namespace removed"
else
  log "Done: release removed (namespace kept)"
fi
