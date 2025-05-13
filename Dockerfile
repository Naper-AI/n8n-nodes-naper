FROM n8nio/n8n:latest

USER root

RUN chown node:node /usr/local/lib/node_modules

USER node

