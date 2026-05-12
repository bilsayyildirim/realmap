#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting RealMap Setup...${NC}"

# Check if nvm is installed
if [ ! -d "$HOME/.nvm" ]; then
    echo -e "${BLUE}📦 Installing nvm...${NC}"
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
    [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
fi

# Load nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

# Install and use Node.js v20.16.0
echo -e "${BLUE}📦 Setting up Node.js v20.16.0...${NC}"
nvm install 20.16.0
nvm use 20.16.0
nvm alias default 20.16.0

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo -e "${BLUE}📦 Installing pnpm...${NC}"
    npm install -g pnpm
fi

# Check if .env exists, if not create from example
if [ ! -f .env ]; then
    echo -e "${BLUE}📝 Creating .env from example...${NC}"
    cp .env.example .env
fi

# Install dependencies
echo -e "${BLUE}📦 Installing dependencies...${NC}"
pnpm install

# Build the project
echo -e "${BLUE}🏗️  Building the project...${NC}"
pnpm build

# Check if data directory exists
if [ ! -d "data" ]; then
    echo -e "${BLUE}📁 Creating data directory...${NC}"
    mkdir -p data
fi

# Check if required data files exist
if [ ! -f "data/cities.geojson" ] || [ ! -f "data/boundaries.geojson" ]; then
    echo -e "${BLUE}⚠️  Please ensure you have the following files in the data directory:${NC}"
    echo -e "   - data/cities.geojson"
    echo -e "   - data/boundaries.geojson"
    echo -e "${BLUE}   You can copy them from your source or download them.${NC}"
    exit 1
fi

# Stop any running containers
echo -e "${BLUE}🛑 Stopping any running containers...${NC}"
docker-compose down

# Start services
echo -e "${BLUE}🚀 Starting services...${NC}"
docker-compose up -d elasticsearch

# Wait for Elasticsearch to be healthy
echo -e "${BLUE}⏳ Waiting for Elasticsearch to be healthy...${NC}"
until curl -s http://localhost:9200/_cluster/health | grep -q '"status":"green"\|"status":"yellow"'; do
    echo -n "."
    sleep 2
done
echo -e "\n${GREEN}✅ Elasticsearch is healthy!${NC}"

# Run the seeder
echo -e "${BLUE}🌱 Running the seeder...${NC}"
docker-compose up seeder

# Start Kibana
echo -e "${BLUE}📊 Starting Kibana...${NC}"
docker-compose up -d kibana

echo -e "${GREEN}✨ Setup complete!${NC}"
echo -e "${BLUE}You can now access:${NC}"
echo -e "  - Frontend: http://localhost:3000"
echo -e "  - Kibana: http://localhost:5601"
echo -e "  - Elasticsearch: http://localhost:9200"
echo -e "\n${BLUE}To view logs:${NC}"
echo -e "  docker-compose logs -f"
echo -e "\n${BLUE}To stop all services:${NC}"
echo -e "  docker-compose down"

# Add helpful message about Node.js version
echo -e "\n${BLUE}Note:${NC}"
echo -e "  Node.js v20.16.0 is now set as your default version."
echo -e "  You can verify this by running: ${GREEN}node -v${NC}"
