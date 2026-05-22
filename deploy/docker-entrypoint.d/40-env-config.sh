#!/bin/sh
set -eu

API_URL="${REACT_APP_API_URL:-${VITE_API_URL:-https://deployment.hse-llm-project-2026.ru}}"
SECURITY_API_URL="${REACT_APP_SECURITY_API_URL:-${VITE_SECURITY_API_URL:-https://audit.hse-llm-project-2026.ru}}"
PROMETHEUS_URL="${REACT_APP_PROMETHEUS_URL:-${VITE_PROMETHEUS_URL:-/prometheus}}"
API_BEARER_TOKEN="${REACT_APP_API_BEARER_TOKEN:-${VITE_API_BEARER_TOKEN:-}}"
ESCAPED_API_URL="$(printf '%s' "${API_URL}" | sed 's/\\/\\\\/g; s/"/\\"/g')"
ESCAPED_SECURITY_API_URL="$(printf '%s' "${SECURITY_API_URL}" | sed 's/\\/\\\\/g; s/"/\\"/g')"
ESCAPED_PROMETHEUS_URL="$(printf '%s' "${PROMETHEUS_URL}" | sed 's/\\/\\\\/g; s/"/\\"/g')"
ESCAPED_API_BEARER_TOKEN="$(printf '%s' "${API_BEARER_TOKEN}" | sed 's/\\/\\\\/g; s/"/\\"/g')"

cat > /usr/share/nginx/html/env-config.js <<EOF
window.__APP_CONFIG__ = {
  API_URL: "${ESCAPED_API_URL}",
  SECURITY_API_URL: "${ESCAPED_SECURITY_API_URL}",
  PROMETHEUS_URL: "${ESCAPED_PROMETHEUS_URL}",
  API_BEARER_TOKEN: "${ESCAPED_API_BEARER_TOKEN}"
};
EOF
