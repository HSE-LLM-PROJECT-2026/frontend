#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KUBECONFIG_PATH="${KUBECONFIG_PATH:-/home/oleg/Documents/hse-llm-project/cluster-config/llm_proj_talos/kubeconfig}"

export KUBECONFIG="$KUBECONFIG_PATH"
kubectl apply -f "$SCRIPT_DIR/network/httproute-frontend.yaml"
kubectl -n hse-llm-project get httproute frontend-route
