#!/bin/bash
# Double-clic : met à jour, démarre le serveur NEO Bureau (si besoin) et ouvre Chrome.
cd "$(dirname "$0")"
git pull -q 2>/dev/null
if ! curl -s -m 1 http://localhost:4321/api/status >/dev/null; then
  nohup node server.mjs > /tmp/plh-neo.log 2>&1 &
  sleep 1
fi
open -a "Google Chrome" http://localhost:4321
echo "NEO Bureau lancé. Vous pouvez fermer cette fenêtre."
