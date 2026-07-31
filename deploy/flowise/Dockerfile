# syntax=docker/dockerfile:1.7

FROM flowiseai/flowise:3.1.4@sha256:3922767afb52a5777759fd8b28a3c9eee864daea96018a791f2429eae2a76571
USER root
COPY deploy/flowise/patch-flowise-3.1.4.mjs /tmp/patch-flowise-3.1.4.mjs
RUN node /tmp/patch-flowise-3.1.4.mjs \
  && rm -f /tmp/patch-flowise-3.1.4.mjs
USER node
