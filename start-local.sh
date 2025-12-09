#!/bin/bash
################################################################################
# Local Development Startup Script
# 
# This script starts the complete local development environment:
# - DynamoDB Local (Docker container on port 8000)
# - SAM Local API Gateway (Lambda functions on port 3001)
#
# Prerequisites:
# - Docker (Colima or Docker Engine) must be running
# - AWS CLI must be installed
# - Node.js 24.x and npm must be installed
#
# Usage:
#   ./start-local.sh
#
# To stop:
#   Press Ctrl+C (stops SAM Local)
#   Then run: docker stop dynamodb-local && docker rm dynamodb-local
################################################################################

set -e  # Exit on error

echo "🚀 Starting Family Inventory Management Backend (Local Development)"
echo ""

################################################################################
# 1. Start DynamoDB Local
################################################################################
if ! docker ps | grep -q dynamodb-local; then
    echo "📦 Starting DynamoDB Local..."
    docker run -d -p 8000:8000 --name dynamodb-local \
        amazon/dynamodb-local -jar DynamoDBLocal.jar -sharedDb
    sleep 2
    
    echo "📋 Creating DynamoDB table with dummy credentials..."
    # IMPORTANT: Use the same dummy credentials that Lambda functions will use
    # DynamoDB Local isolates tables by credentials, so table creation and
    # Lambda access must use matching credentials (local/local)
    AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local \
    aws dynamodb create-table \
        --cli-input-json file://create-local-table.json \
        --endpoint-url http://localhost:8000 \
        --region us-east-1 \
        2>/dev/null || echo "ℹ️  Table already exists"
else
    echo "✓ DynamoDB Local is already running"
fi

echo ""

################################################################################
# 2. Build Lambda Functions
################################################################################
echo "🔨 Building Lambda functions..."
npm run build  # Compile TypeScript to JavaScript
sam build      # Package Lambda artifacts

echo ""

################################################################################
# 3. Start SAM Local API Gateway
################################################################################
echo "🌐 Starting SAM Local API on port 3001..."
echo ""
echo "   📍 API Gateway:     http://localhost:3001"
echo "   📍 DynamoDB Local:  http://localhost:8000"
echo "   📍 Health Check:    http://localhost:3001/health"
echo ""
echo "   ⚙️  Lambda functions use dummy credentials (local/local)"
echo "   ⚙️  Auto-configured to use DynamoDB Local when AWS_SAM_LOCAL=true"
echo ""
echo "Press Ctrl+C to stop SAM Local"
echo ""

# Unset AWS credentials to prevent SAM from passing host credentials to containers
# Lambda functions will use dummy credentials (local/local) from env.json
unset AWS_ACCESS_KEY_ID
unset AWS_SECRET_ACCESS_KEY
unset AWS_SESSION_TOKEN
unset AWS_PROFILE

# Set Docker host for Colima (comment out if using standard Docker Engine)
export DOCKER_HOST=unix://$HOME/.colima/default/docker.sock

# Start SAM Local API Gateway
# - Port 3001: API Gateway endpoint
# - env.json: Contains AWS_SAM_LOCAL=true and dummy credentials for each function
# - docker-network bridge: Required for Lambda containers to access host.docker.internal
sam local start-api \
    --port 3001 \
    --env-vars env.json \
    --docker-network bridge
