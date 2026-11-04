#!/bin/sh
# Throwaway certificates for the end-to-end stack, made inside the stack (the postgres image has openssl) and kept in the
# `pgcerts` volume, so no tool is needed on the host. Test-only; never reuse them. Mirrors the production layout of
# docs/sync.md, "Database access": one CA, a server certificate, and a client certificate whose common name is the role.
#
# The files are made in a work directory on the same volume with their final permissions and then renamed into place, so a
# service that starts early (podman-compose does not wait for depends_on conditions) never reads a half-made file.
set -eu
# Several services depend on this one and the runtime may start it again for each of them; a second run would replace the CA
# that PostgreSQL has already loaded, so do nothing once the last file exists.
[ -e /certs/pg_hba.conf ] && exit 0
work=/certs/.work
rm -rf "$work" && mkdir "$work" && cd "$work"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj "/CN=e2e-ca" -keyout ca.key -out ca.crt 2>/dev/null

issue() { # name common-name usage [san]
	openssl req -newkey rsa:2048 -nodes -subj "/CN=$2" -keyout "$1.key" -out "$1.csr" 2>/dev/null
	printf 'extendedKeyUsage=%s\n%s\n' "$3" "${4:+subjectAltName=$4}" >"$1.ext"
	openssl x509 -req -in "$1.csr" -CA ca.crt -CAkey ca.key -CAcreateserial -days 1 -extfile "$1.ext" -out "$1.crt" 2>/dev/null
}
issue server postgres serverAuth DNS:postgres
issue client harper_sync clientAuth
# A certificate from the same CA with the wrong common name: PostgreSQL must refuse it for the role harper_sync.
issue wrongcn someone_else clientAuth

# PostgreSQL requires its private key to be 0600 and owned by the server's user. The sync service runs as another user and has
# to read the client key, which is acceptable in a throwaway volume.
chown 999:999 server.key
chmod 600 server.key
chmod 644 client.key wrongcn.key ca.crt

# TLS and a client certificate for the role (common name must equal it); everything else, including plain TCP, is refused.
cat >pg_hba.conf <<'HBA'
local all all trust
hostssl harper harper_sync all cert
host all all all reject
HBA

# Last: the files the services wait for.
for f in ca.crt server.crt server.key client.crt client.key wrongcn.crt wrongcn.key pg_hba.conf; do mv "$f" "/certs/$f"; done
cd / && rm -rf "$work"
