#!/usr/bin/env bash
set -euo pipefail

# Boots the web bundle from a freshly cloned checkout and proves the bundled
# literature-search MCP server mounts and a keyless session can be created.
# This is exactly the README Quick Start a first-time Windows user follows;
# the OS-specific shell/sandbox layers are exercised by the existing Windows CI
# lanes, while this lane proves the product delta (git submodule, build chain,
# MCP path, web boot) on a clean machine. session.create performs no model
# call, so a dummy DEEPSEEK_API_KEY is never used.

cd "$(dirname "$0")/.."

port=3090
log_file="$(mktemp)"
response_file="$(mktemp)"
server_pid=""

cleanup() {
  if [[ -n "$server_pid" ]] && kill -0 "$server_pid" 2>/dev/null; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
  rm -f "$log_file" "$response_file"
}
trap cleanup EXIT

pnpm dsh web --patch dev.cordis.yml >"$log_file" 2>&1 &
server_pid=$!

# 1. Wait for the MCP server's stdio banner (server.ts prints it once the child
#    process is up). failOnStartupError: true means a failed mount crashes boot.
deadline=$((SECONDS + 240))
while (( SECONDS < deadline )); do
  if grep -q "literature-search-mcp running on stdio" "$log_file"; then
    echo "MCP server mounted (banner found in boot log)"
    break
  fi
  if ! kill -0 "$server_pid" 2>/dev/null; then
    echo "::error::web server exited before the MCP banner appeared" >&2
    echo "--- boot log (tail) ---" >&2
    tail -n 60 "$log_file" >&2 || true
    exit 1
  fi
  sleep 2
done

if ! grep -q "literature-search-mcp running on stdio" "$log_file"; then
  echo "::error::MCP banner not found in boot log after ${deadline}s" >&2
  echo "--- boot log (tail) ---" >&2
  tail -n 60 "$log_file" >&2 || true
  exit 1
fi

# 2. Wait for the HTTP endpoint, then create a session via the wire
#    client-request envelope. A connection failure means the server is still
#    booting (keep polling); a 200 with an error result is a permanent failure
#    (fail now). session.create performs no model call.
created=""
deadline=$((SECONDS + 240))
while (( SECONDS < deadline )); do
  response="$(curl -s -w $'\n%{http_code}' -X POST "http://127.0.0.1:${port}/api/session.create" \
    -H 'content-type: application/json' \
    -d '{"type":"client-request","rpcId":"fresh-clone-smoke","method":"session.create","payload":{}}' || true)"
  code="${response##*$'\n'}"
  body="${response%$'\n'*}"
  if [[ "$code" == "200" ]]; then
    printf '%s' "$body" >"$response_file"
    if created="$(node -e '
        const fs = require("node:fs")
        const body = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
        if (!body.result || body.result.ok !== true) process.exit(3)
        if (!body.result.value || typeof body.result.value.sessionId !== "string" || !body.result.value.sessionId) process.exit(4)
        process.stdout.write(body.result.value.sessionId)
      ' "$response_file")"; then
      break
    fi
    echo "::error::session.create returned an error result" >&2
    echo "--- response ---" >&2
    cat "$response_file" >&2 || true
    echo "--- boot log (tail) ---" >&2
    tail -n 60 "$log_file" >&2 || true
    exit 1
  fi
  if ! kill -0 "$server_pid" 2>/dev/null; then
    echo "::error::web server exited before the HTTP endpoint answered" >&2
    echo "--- boot log (tail) ---" >&2
    tail -n 60 "$log_file" >&2 || true
    exit 1
  fi
  sleep 2
done

if [[ -z "$created" ]]; then
  echo "::error::session.create did not return a session id within ${deadline}s" >&2
  echo "--- boot log (tail) ---" >&2
  tail -n 60 "$log_file" >&2 || true
  exit 1
fi

echo "created session ${created}"
echo "fresh-clone smoke passed"
