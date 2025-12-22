# Family Inventory Management System - Backend

Serverless backend API for the Family Inventory Management System built with AWS SAM, TypeScript, Lambda, and DynamoDB.

## Tech Stack

- **Runtime**: Node.js 24.x
- **Language**: TypeScript 5 (strict mode)
- **Framework**: AWS SAM (Serverless Application Model)
- **Database**: Amazon DynamoDB (single-table design)
- **Email**: Amazon SES
- **Testing**: Jest with 80% coverage target

## Infrastructure as Code (IaC) Philosophy

**⚠️ CRITICAL: Always Use template.yaml for AWS Configuration**

This project follows an **infrastructure-as-code first** approach:

- ✅ **DO**: Define all AWS resources in `template.yaml`
- ✅ **DO**: Use SAM parameters for environment-specific configuration
- ✅ **DO**: Version control all infrastructure changes
- ❌ **DON'T**: Configure AWS resources manually in the console (except for specific exceptions below)
- ❌ **DON'T**: Create IAM roles, Lambda functions, or API Gateway routes outside of `template.yaml`

### Acceptable Manual Operations

Manual AWS Console operations are ONLY allowed for:
1. **SES Domain Verification** - CloudFormation cannot initiate domain verification
2. **Third-party DNS Configuration** - Namecheap, GoDaddy, etc. DNS record management
3. **Initial Route 53 Hosted Zone Creation** - One-time setup
4. **Emergency Troubleshooting** - Must be followed by template.yaml update

All other AWS configurations (Cognito settings, IAM roles, Lambda env vars, API Gateway CORS, etc.) MUST be in `template.yaml`.

## Prerequisites

- Node.js 24.x or higher
- AWS CLI configured with appropriate credentials
- AWS SAM CLI installed ([installation guide](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html))
- Docker Engine installed and running ([installation guide](https://docs.docker.com/engine/install/))
  - **Note**: Docker Desktop is NOT supported in this environment
  - Use Docker Engine via package manager (apt, yum, homebrew)
  - Required for `sam local` commands
  - Ensure Docker daemon is running before executing local commands

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

#### Local Development (`env.json`)

The `env.json` file configures environment variables for Lambda functions in SAM Local. Each function is configured with:

```json
{
  "FunctionName": {
    "DYNAMODB_ENDPOINT": "http://host.docker.internal:8000",
    "TABLE_NAME": "InventoryTable",
    "AWS_SAM_LOCAL": "true",
    "NODE_ENV": "development",
    "LOG_LEVEL": "DEBUG",
    "AWS_ACCESS_KEY_ID": "local",
    "AWS_SECRET_ACCESS_KEY": "local"
  }
}
```

**Key Variables**:
- `AWS_SAM_LOCAL=true`: Triggers automatic local DynamoDB endpoint configuration
- `AWS_ACCESS_KEY_ID/SECRET`: Dummy credentials for DynamoDB Local
- `DYNAMODB_ENDPOINT`: Explicit endpoint (optional, auto-detected when AWS_SAM_LOCAL=true)

**Note**: The DynamoDB client automatically uses `http://host.docker.internal:8000` when `AWS_SAM_LOCAL=true`, even if `DYNAMODB_ENDPOINT` isn't set.

#### Production Deployment

For production deployment, configure parameters in `samconfig.toml` or use `--parameter-overrides`.

### 3. Local Development Setup

#### Prerequisites
- **Docker** (Colima or Docker Engine) - Required for SAM local and DynamoDB Local
- **AWS CLI** - For creating local DynamoDB tables

#### Quick Start

Use the provided startup script to run everything:

```bash
./start-local.sh
```

This script will:
1. Start DynamoDB Local in Docker (port 8000)
2. Create the InventoryTable with dummy credentials
3. Build TypeScript code
4. Build SAM artifacts  
5. Start SAM Local API (port 3001)

The API will be available at: `http://localhost:3001`

#### How Local Development Works

For local development, the backend uses **DynamoDB Local** with dummy AWS credentials to bypass IAM authentication:

- **Credentials**: `AWS_ACCESS_KEY_ID=local`, `AWS_SECRET_ACCESS_KEY=local`
- **Endpoint**: `http://host.docker.internal:8000` (from Lambda containers)
- **Auto-configuration**: When `AWS_SAM_LOCAL=true`, the DynamoDB client automatically uses the local endpoint

The DynamoDB table is created using the same dummy credentials that Lambda functions use, ensuring credential isolation in DynamoDB Local works correctly.

#### Manual Setup (Alternative)

If you prefer to start services individually:

**1. Start DynamoDB Local:**
```bash
docker run -d -p 8000:8000 --name dynamodb-local \
  amazon/dynamodb-local -jar DynamoDBLocal.jar -sharedDb
```

**2. Create the table with dummy credentials:**
```bash
AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local \
  aws dynamodb create-table \
    --cli-input-json file://create-local-table.json \
    --endpoint-url http://localhost:8000 \
    --region us-east-1
```

**⚠️ Important**: Always use the dummy credentials (`local`/`local`) when creating tables for local development. DynamoDB Local isolates tables by credentials.

**3. Build and start SAM:**
```bash
npm run build
sam build

# Unset host AWS credentials to prevent conflicts
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_PROFILE

# Set Docker host (if using Colima)
export DOCKER_HOST=unix://$HOME/.colima/default/docker.sock

# Start SAM Local with environment variables
sam local start-api --port 3001 --env-vars env.json --docker-network bridge
```

#### Verify Setup

Test the health endpoint:
```bash
curl http://localhost:3001/health
```

Test creating a family:
```bash
curl -X POST http://localhost:3001/families \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test" \
  -d '{"name":"My Family"}'
```

### 4. Run Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### 5. Stopping Local Services

```bash
# Stop SAM local (Ctrl+C in the terminal where it's running)

# Stop DynamoDB Local
docker stop dynamodb-local
docker rm dynamodb-local
```

## Development Workflow

1. Make code changes in `src/`
2. Run `npm run build` to compile TypeScript
3. Run `sam build` to update Lambda artifacts
4. SAM local will auto-reload on next request
5. Test your changes via curl or frontend

**Note**: You only need to restart SAM if you change `template.yaml`

## API Documentation

### Available Endpoints

The backend provides RESTful APIs for the following features:

#### Core Features
- **Family Management** - Create and manage family accounts
- **Inventory Items** - CRUD operations for household inventory
- **Shopping Lists** - Create and manage shopping lists
- **Notifications** - View and manage family notifications
- **Member Management** - Invite and manage family members

#### Reference Data (Feature 005)
- **Storage Locations** - Manage storage locations (pantry, garage, etc.)
- **Stores** - Manage store information (grocery stores, etc.)

### API Specifications

Detailed API specifications are available in the context repository:

- **[Reference Data API Spec](../inventory-management-context/specs/005-reference-data/contracts/api-spec.yaml)** - Storage locations and stores endpoints
- **[Shopping Lists API Spec](../inventory-management-context/specs/002-shopping-lists/contracts/api-spec.yaml)** - Shopping list management
- **[Member Management API Spec](../inventory-management-context/specs/003-member-management/contracts/api-spec.yaml)** - Family member invitations
- **[Core Inventory API Spec](../inventory-management-context/specs/001-family-inventory-mvp/contracts/api-spec.yaml)** - Family and inventory management

### Quick Reference: Reference Data Endpoints

**Storage Locations:**
- `GET /families/{familyId}/locations` - List all storage locations
- `POST /families/{familyId}/locations` - Create storage location (admin only)
- `GET /families/{familyId}/locations/{locationId}` - Get specific location
- `PUT /families/{familyId}/locations/{locationId}` - Update location (admin only)
- `DELETE /families/{familyId}/locations/{locationId}` - Delete location (admin only)
- `POST /families/{familyId}/locations/check-name` - Check name availability

**Stores:**
- `GET /families/{familyId}/stores` - List all stores
- `POST /families/{familyId}/stores` - Create store (admin only)
- `GET /families/{familyId}/stores/{storeId}` - Get specific store
- `PUT /families/{familyId}/stores/{storeId}` - Update store (admin only)
- `DELETE /families/{familyId}/stores/{storeId}` - Delete store (admin only)
- `POST /families/{familyId}/stores/check-name` - Check name availability

**Authentication:** All endpoints require JWT Bearer token via `Authorization: Bearer <token>` header.

**RBAC:** Mutation operations (POST/PUT/DELETE) require `admin` role. Read operations (GET) available to all family members.

## Local Development Architecture

```
┌─────────────────────┐
│   Frontend          │
│   localhost:3000    │
└──────────┬──────────┘
           │
           │ HTTP Requests
           ▼
┌─────────────────────┐
│   SAM Local API     │
│   localhost:3001    │
│   (Lambda Functions)│
└──────────┬──────────┘
           │
           │ DynamoDB Calls
           ▼
┌─────────────────────┐
│  DynamoDB Local     │
│  localhost:8000     │
│  (Docker Container) │
└─────────────────────┘
```

### 6. Docker Context Configuration

If you're using **Colima** (lightweight Docker alternative), SAM CLI needs to know the Docker socket location:

```bash
# Set DOCKER_HOST for Colima
export DOCKER_HOST=unix://$HOME/.colima/default/docker.sock

# Make it persistent (add to ~/.zshrc or ~/.bashrc)
echo 'export DOCKER_HOST=unix://$HOME/.colima/default/docker.sock' >> ~/.zshrc
```

**For standard Docker Engine**: SAM CLI should auto-detect. If not, set:
```bash
export DOCKER_HOST=unix:///var/run/docker.sock
```

#### Testing Individual Lambda Functions

Since API endpoints haven't been implemented yet (Phase 2 only includes foundation), you can test individual Lambda functions:

```bash
# Build the SAM application first
npm run sam:build

# Invoke a Lambda function locally
sam local invoke AuthorizerFunction --event events/test-auth-event.json

# Generate a test event
sam local generate-event apigateway authorizer > events/test-auth-event.json
```

#### Start Local API Gateway (Phase 3+)

Once API handler functions are implemented in Phase 3:

```bash
# Build and start local API Gateway with Lambda functions
npm run sam:local
```

The API will be available at `http://localhost:3001`

**Note**: `sam local start-api` requires at least one Lambda function with API Gateway events defined. Phase 2 only includes the authorizer function, so the full API server isn't available yet.

#### Testing Local Endpoints (Phase 3+)

```bash
# Example: Test the health check endpoint
curl http://localhost:3001/health

# Example: Test with authorization header
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3001/families
```

### 6. Deploy to AWS

First-time deployment (guided):

```bash
npm run sam:deploy
```

For subsequent deployments, you can use:

```bash
sam build && sam deploy
```

## Project Structure

```
inventory-management-backend/
├── src/
│   ├── handlers/        # Lambda function handlers
│   ├── lib/             # Utilities and helpers
│   └── types/           # TypeScript type definitions
├── dist/                # Compiled JavaScript (ES modules)
│   └── package.json     # ES module configuration for Lambda
├── tests/               # Test files
├── template.yaml        # AWS SAM template
├── tsconfig.json        # TypeScript configuration
└── package.json         # Dependencies and scripts
```

## Important Notes

### ES Module Configuration

This project uses **ES modules** (not CommonJS). Key requirements:

1. **Import Statements**: All imports must include `.js` extension:
   ```typescript
   import { logger } from '../lib/logger.js';  // ✅ Correct
   import { logger } from '../lib/logger';     // ❌ Wrong
   ```

2. **Lambda Package**: The `dist/package.json` file contains:
   ```json
   {
     "type": "module",
     "dependencies": { /* runtime deps */ }
   }
   ```

3. **Build Process**: TypeScript compiles to `dist/`, which SAM uses as `CodeUri`

### Docker Configuration

- **Docker Desktop is NOT supported** in this environment
- Use **Colima** on macOS or Docker Engine on Linux
- Set `DOCKER_HOST` environment variable for SAM CLI:
  ```bash
  export DOCKER_HOST=unix://$HOME/.colima/default/docker.sock
  ```
- Fix Docker credential store issues by removing `"credsStore"` from `~/.docker/config.json`

## Available Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm test` - Run Jest tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Generate coverage report
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues
- `npm run format` - Format code with Prettier
- `npm run sam:build` - Build SAM application
- `npm run sam:deploy` - Deploy to AWS
- `npm run sam:local` - Start local API Gateway

## API Endpoints

### Available Endpoints

- `GET /health` - Health check endpoint (no authentication required)
  ```bash
  curl http://localhost:3001/health
  # Returns: {"data":{"status":"healthy","timestamp":"...","environment":"dev","version":"1.0.0"}}
  ```

Full API specification available at `/specs/001-family-inventory-mvp/contracts/api-spec.yaml`

## Testing

All business logic must have unit tests with 80% coverage. Use Jest for testing:

```typescript
// Example test structure
describe('FamilyService', () => {
  it('should create a new family', async () => {
    // Arrange
    const familyData = { name: 'Test Family' };
    
    // Act
    const result = await familyService.createFamily(familyData);
    
    // Assert
    expect(result).toBeDefined();
    expect(result.name).toBe('Test Family');
  });
});
```

## AWS Resources

The SAM template creates the following resources:

- Lambda Functions (API handlers)
- DynamoDB Table (single-table design)
- API Gateway REST API
- IAM Roles and Policies
- CloudWatch Log Groups

## Environment Variables

See `.env.example` for required environment variables.

## Troubleshooting

### Local DynamoDB Authentication Errors

**Problem**: Lambda functions fail with "User: arn:aws:iam::XXXX is not authorized to perform: dynamodb:PutItem" or "The security token included in the request is invalid."

**Root Cause**: DynamoDB Local isolates tables by AWS credentials. If the table was created with your real AWS credentials but Lambda functions use dummy credentials, they can't access each other's tables.

**Solution**: 
1. Stop and remove DynamoDB Local:
   ```bash
   docker stop dynamodb-local && docker rm dynamodb-local
   ```

2. Restart using the startup script (which creates tables with dummy credentials):
   ```bash
   ./start-local.sh
   ```

3. Or manually create the table with dummy credentials:
   ```bash
   AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local \
     aws dynamodb create-table \
       --cli-input-json file://create-local-table.json \
       --endpoint-url http://localhost:8000 \
       --region us-east-1
   ```

**Why this happens**: 
- SAM Local passes `AWS_SAM_LOCAL=true` to Lambda functions
- The DynamoDB client uses this to automatically configure dummy credentials and local endpoint
- Both table creation AND Lambda functions must use the same credentials

### SAM CLI "Docker not found" Error

**Problem**: `sam local start-api` fails with "Docker not found" even though Docker is running.

**Solution**: Set the `DOCKER_HOST` environment variable:
```bash
# For Colima (macOS)
export DOCKER_HOST=unix://$HOME/.colima/default/docker.sock

# For standard Docker Engine (Linux)
export DOCKER_HOST=unix:///var/run/docker.sock

# Verify Docker is accessible
docker ps
```

**Make it permanent** by adding to your shell profile:
```bash
# For Colima users (add to ~/.zshrc or ~/.bashrc)
echo 'export DOCKER_HOST=unix://$HOME/.colima/default/docker.sock' >> ~/.zshrc
source ~/.zshrc
```

### DOCKER_HOST Configuration

**For Colima users**: The `start-local.sh` script includes:
```bash
export DOCKER_HOST=unix://$HOME/.colima/default/docker.sock
```

**For Docker Engine users**: Comment out or remove the DOCKER_HOST line in `start-local.sh`:
```bash
# export DOCKER_HOST=unix://$HOME/.colima/default/docker.sock  # Not needed for Docker Engine
```

### "Cannot use import statement outside a module" Error

**Problem**: Lambda functions fail with "SyntaxError: Cannot use import statement outside a module".

**Solution**: Ensure `dist/package.json` contains `"type": "module"`:
```json
{
  "type": "module",
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.x.x",
    "uuid": "^11.x.x",
    "zod": "^3.x.x"
  }
}
```

This file is required for ES module support in Node.js 24.x Lambda runtime.

### "Cannot find module" with Missing .js Extension

**Problem**: Import errors like `Cannot find module '/var/task/lib/logger'`.

**Solution**: ES modules in Node.js 24.x require explicit `.js` extensions:
```typescript
// ❌ Wrong
import { logger } from './lib/logger';

// ✅ Correct
import { logger } from './lib/logger.js';
```

### Docker "credential-desktop not installed" Error

**Problem**: Docker errors mentioning `docker-credential-desktop`.

**Solution**: Remove the `credsStore` field from `~/.docker/config.json`:
```bash
# Edit the file
nano ~/.docker/config.json

# Remove the "credsStore" line, leaving only:
{
  "auths": {}
}
```

### SAM "Template does not have any APIs" Error

**Problem**: `sam local start-api` reports no APIs found.

**Solution**: Ensure Lambda functions in `template.yaml` have API Gateway event sources:
```yaml
HealthCheckFunction:
  Type: AWS::Serverless::Function
  Properties:
    Events:
      HealthCheck:
        Type: Api
        Properties:
          Path: /health
          Method: get
```

### TypeScript Compilation Errors After Node 24 Upgrade

**Problem**: Build fails with TypeScript errors after upgrading to Node 24.

**Solution**: Ensure all configuration files use Node 24:
- `package.json`: `"engines": { "node": ">=24.0.0" }`
- `template.yaml`: `Runtime: nodejs24.x`
- `.github/agents/constitution.md`: Node.js 24.x LTS reference

## Contributing

Follow the TypeScript strict mode guidelines and ensure all tests pass before committing.
