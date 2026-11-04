#!/bin/bash
# deploy.sh - Script per aggiornare e deployare Nexus/Maxun sulla VM

echo "🚀 Inizio il deploy di Nexus..."

# 1. Scarica le ultime modifiche da GitHub
echo "📥 Scaricamento aggiornamenti da Git..."
git pull origin main

# 2. Ricostruisce e riavvia i container Docker
echo "🐳 Ricompilazione e avvio dei container Docker in background..."
docker-compose up -d --build

# 3. Pulisce eventuali immagini vecchie per non riempire il disco
echo "🧹 Pulizia immagini Docker inutilizzate..."
docker image prune -f

echo "✅ Deploy completato con successo! Il sistema è online."
