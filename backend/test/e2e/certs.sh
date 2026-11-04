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
# ECDSA P-256 keys; the CA may only sign end-entity certificates (pathlen 0) and the others cannot sign anything.
key() { openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out "$1"; }

key ca.key
openssl req -x509 -new -key ca.key -days 1 -subj "/CN=e2e-ca" -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
	-addext "keyUsage=critical,keyCertSign,cRLSign" -out ca.crt

issue() { # name common-name extended-key-usage [subjectAltName]
	key "$1.key"
	openssl req -new -key "$1.key" -subj "/CN=$2" -out "$1.csr"
	printf 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=%s\n%s\n' "$3" "${4:+subjectAltName=$4}" >"$1.ext"
	openssl x509 -req -in "$1.csr" -CA ca.crt -CAkey ca.key -CAcreateserial -days 1 -extfile "$1.ext" -out "$1.crt" 2>/dev/null
}
# The server certificate also names localhost, so tests on the host (published port) can use sslmode=verify-full.
issue server postgres serverAuth DNS:postgres,DNS:localhost,IP:127.0.0.1
issue client harper_sync clientAuth
issue admin harper_admin clientAuth
# A certificate from the same CA with the wrong common name: PostgreSQL must refuse it for the role harper_sync.
issue wrongcn someone_else clientAuth

# PostgreSQL requires its private key to be 0600 and owned by the server's user. The sync service runs as another user and has
# to read the client key, which is acceptable in a throwaway volume.
chown 999:999 server.key
chmod 600 server.key
chmod 644 client.key admin.key wrongcn.key ca.crt

# TLS and a client certificate for the role (common name must equal it), for the sync and the admin role; everything else, including plain TCP, is refused.
cat >pg_hba.conf <<'HBA'
local all all trust
hostssl harper harper_sync all cert
hostssl harper harper_admin all cert
host all all all reject
HBA

# Last: the files the services wait for.
for f in ca.crt server.crt server.key client.crt client.key admin.crt admin.key wrongcn.crt wrongcn.key pg_hba.conf; do mv "$f" "/certs/$f"; done
cd / && rm -rf "$work"
