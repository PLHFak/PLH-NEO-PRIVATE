#!/bin/bash
# Double-clic : arrête le serveur NEO Bureau.
pkill -f "node server.mjs" && echo "NEO Bureau arrêté." || echo "NEO Bureau n'était pas lancé."
