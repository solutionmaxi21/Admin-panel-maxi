#!/bin/sh
set -e

# ============================================================
# MaxiStore Backend — Docker Entrypoint
# Waits for PostgreSQL then starts the Node.js server
# ============================================================

echo "🚀 MaxiStore Backend starting..."
echo "   Environment: ${NODE_ENV:-development}"
echo "   Port: ${PORT:-3001}"

# ---- Wait for PostgreSQL to be ready ----
if [ -n "$DATABASE_URL" ]; then
    # Extract host and port from DATABASE_URL
    # Format: postgresql://user:pass@host:port/dbname
    DB_HOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:]*\):.*|\1|p')
    DB_PORT=$(echo "$DATABASE_URL" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')

    if [ -z "$DB_HOST" ]; then
        DB_HOST="postgres"
    fi
    if [ -z "$DB_PORT" ]; then
        DB_PORT="5432"
    fi

    echo "⏳ Waiting for PostgreSQL at ${DB_HOST}:${DB_PORT}..."

    MAX_RETRIES=30
    RETRY_COUNT=0

    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        if node -e "
            const net = require('net');
            const socket = new net.Socket();
            socket.setTimeout(2000);
            socket.on('connect', () => { socket.destroy(); process.exit(0); });
            socket.on('timeout', () => { socket.destroy(); process.exit(1); });
            socket.on('error', () => { process.exit(1); });
            socket.connect(${DB_PORT}, '${DB_HOST}');
        " 2>/dev/null; then
            echo "✅ PostgreSQL is ready!"
            break
        fi

        RETRY_COUNT=$((RETRY_COUNT + 1))
        echo "   Attempt ${RETRY_COUNT}/${MAX_RETRIES} - PostgreSQL not ready, retrying in 2s..."
        sleep 2
    done

    if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
        echo "❌ Could not connect to PostgreSQL after ${MAX_RETRIES} attempts. Exiting."
        exit 1
    fi
fi

# ---- Start the application ----
# Si une commande est passee (via `command:` dans docker-compose.yml), on
# l'execute au lieu du serveur. Cela permet de reutiliser cette meme image pour
# des taches one-shot, notamment le service `schema` qui applique la chaine de
# migrations avant le demarrage de l'API.
if [ "$#" -gt 0 ]; then
    echo "🟢 Running: $*"
    exec "$@"
fi

echo "🟢 Starting Node.js server..."
exec node server.js
