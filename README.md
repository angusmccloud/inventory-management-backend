# Family Inventory Management System - Backend

Serverless backend API for the Family Inventory Management System built with AWS SAM, TypeScript, Lambda, and DynamoDB.

## Tech Stack

- **Runtime**: Node.js 24.x
- **Language**: TypeScript 5 (strict mode)
- **Framework**: AWS SAM (Serverless Application Model)
- **Database**: Amazon DynamoDB (single-table design)
- **Email**: Amazon SES
- **Testing**: Jest with 80% coverage target

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

Copy the environment template and fill in your values:

```bash
cp .env.example .env
```

### 3. Build TypeScript

```bash
npm run build
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

### 5. Local Development

**Prerequisites**: Ensure Docker Engine is installed and running before starting local development.

#### Start Docker Engine

On Linux:
```bash
sudo systemctl start docker
# OR
sudo service docker start
```

On macOS (with Colima):
```bash
colima start
```

Verify Docker is running:
```bash
docker ps
```

#### Docker Context Configuration

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

### SAM CLI "Docker not found" Error

**Problem**: `sam local start-api` fails with "Docker not found" even though Docker is running.

**Solution**: Set the `DOCKER_HOST` environment variable:
```bash
# For Colima (macOS)
export DOCKER_HOST=unix://$HOME/.colima/default/docker.sock

# For standard Docker Engine
export DOCKER_HOST=unix:///var/run/docker.sock

# Verify Docker is accessible
docker ps
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
