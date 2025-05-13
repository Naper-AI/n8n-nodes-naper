#!/bin/sh
set -e

# Install dependencies, compile and link
echo "Installing dependencies..."
cd /home/node/app
npm install
npm run compile
npm link

# Link custom lib to n8n
echo "Linking custom lib to n8n..."
cd /home/node/.n8n
mkdir -p nodes
cd nodes
npm link @naper/n8n-nodes

# Start n8n
echo "Starting n8n..."
node /usr/local/lib/node_modules/n8n/bin/n8n start 