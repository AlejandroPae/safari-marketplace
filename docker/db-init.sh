#!/bin/sh
# Esquema y datos de referencia para el despliegue.
#
# El esquema se aplica siempre: es idempotente (CREATE ... IF NOT EXISTS) y
# no altera tablas existentes. El seed, solo si la base está vacía (sin filas
# en `settings`): reaplicarlo en cada despliegue resucitaría lo que el admin
# borró, devolvería `settings` al valor del mock y, con un slug o un email
# recreado, haría fallar el `INSERT` y dejaría la API sin arrancar.
#
# Las credenciales llegan por PGHOST/PGUSER/PGPASSWORD/PGDATABASE.
set -eu

psql -v ON_ERROR_STOP=1 -q -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"
psql -v ON_ERROR_STOP=1 -q -f /db/schema.sql

filas=$(psql -tAc "SELECT count(*) FROM settings")
if [ "$filas" = "0" ]; then
  psql -v ON_ERROR_STOP=1 -q -f /db/seed.sql
  echo "db-init: base vacía, seed aplicado"
else
  echo "db-init: la base ya tiene datos (settings: $filas fila/s), seed omitido"
fi

psql -v ON_ERROR_STOP=1 -q -c "VACUUM ANALYZE;"
echo "db-init: esquema al día"
