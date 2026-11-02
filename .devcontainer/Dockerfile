FROM mirror.gcr.io/library/golang:1.26-trixie AS go
FROM mirror.gcr.io/library/node:26-trixie-slim AS node

FROM mcr.microsoft.com/devcontainers/base:trixie

COPY --from=go /usr/local/go /usr/local/go
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

RUN apt-get update \
 && apt-get install -y --no-install-recommends make curl \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /home/vscode/go \
 && chown -R vscode:vscode /home/vscode/go

ENV GOPATH=/home/vscode/go \
    PATH=/usr/local/go/bin:/home/vscode/go/bin:${PATH}
