#!/usr/bin/env bash
# Sauvegarde logique de la base Isabelle (pg_dump, format « custom » compressé).
#
#   DATABASE_URL_BACKUP="postgres://backup_user:...@hote:5432/base" \
#   BACKUP_DIR=/var/backups/isabelle RETENTION_DAYS=30 \
#   ./scripts/backup-postgres.sh
#
# DATABASE_URL_BACKUP doit désigner un rôle capable de lire TOUTES les lignes
# malgré la RLS (propriétaire des tables ou rôle dédié avec BYPASSRLS) : sans
# cela pg_dump s'arrête avec une erreur de RLS, ce qui est le comportement
# voulu pour le rôle applicatif. Ne jamais utiliser le rôle de l'application.
#
# Le fichier contient des données de santé : dossier en accès restreint
# (chmod 700), copie hors site chiffrée (voir README, section Sauvegarde).
set -euo pipefail

: "${DATABASE_URL_BACKUP:?Renseigner DATABASE_URL_BACKUP}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

fichier="$BACKUP_DIR/isabelle_$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --no-owner --no-privileges --file "$fichier" "$DATABASE_URL_BACKUP"

# Vérifie que l'archive est lisible avant de purger les anciennes.
pg_restore --list "$fichier" > /dev/null

find "$BACKUP_DIR" -name 'isabelle_*.dump' -type f -mtime "+$RETENTION_DAYS" -delete
echo "Sauvegarde OK : $fichier ($(du -h "$fichier" | cut -f1))"
