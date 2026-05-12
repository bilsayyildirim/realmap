#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}📦 Setting Node.js v20.16.0 as default...${NC}"

# Install if not already installed
nvm install 20.16.0

# Set as default
nvm alias default 20.16.0

# Use the version
nvm use 20.16.0

echo -e "${GREEN}✅ Node.js v20.16.0 is now set as your default version${NC}"
echo -e "Current version: ${GREEN}$(node -v)${NC}"
