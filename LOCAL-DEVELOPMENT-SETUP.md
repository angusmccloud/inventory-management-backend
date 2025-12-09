# Local Development Setup - Quick Reference

## Overview

This document provides a quick reference for setting up and running the backend locally.

## Prerequisites

- **Docker** (Colima or Docker Engine) - must be running
- **AWS CLI** - for DynamoDB Local table creation
- **Node.js 24.x** - runtime environment
- **npm** - package manager

## Quick Start

```bash
./start-local.sh
```

That's it! The script handles everything automatically.

## What Happens When You Run `start-local.sh`

1. **Starts DynamoDB Local** (if not already running)
   - Container: `dynamodb-local`
   - Port: `8000`
   - Uses `-sharedDb` flag

2. **Creates DynamoDB Table** with dummy credentials
   - Credentials: `AWS_ACCESS_KEY_ID=local`, `AWS_SECRET_ACCESS_KEY=local`
   - Table: `InventoryTable`
   - **Critical**: Same credentials used by Lambda functions

3. **Builds TypeScript Code**
   - Compiles `src/` to `dist/`
   - Outputs ES modules with `.js` extensions

4. **Builds SAM Application**
   - Packages Lambda functions
   - Installs dependencies for each function

5. **Starts SAM Local API Gateway**
   - Port: `3001`
   - Endpoint: `http://localhost:3001`
   - Unsets host AWS credentials
   - Uses environment variables from `env.json`

## How Local DynamoDB Authentication Works

### The Problem We Solved

DynamoDB Local isolates tables by AWS credentials. If a table is created with one set of credentials but accessed with different credentials, you get authentication errors.

### The Solution

**Consistent Dummy Credentials**: Both table creation and Lambda access use the same dummy credentials:
- `AWS_ACCESS_KEY_ID=local`
- `AWS_SECRET_ACCESS_KEY=local`

### Auto-Configuration in Lambda Functions

When `AWS_SAM_LOCAL=true` (set by SAM Local), the DynamoDB client automatically:
1. Uses dummy credentials (`local`/`local`)
2. Connects to `http://host.docker.internal:8000`
3. Disables TLS (not needed for local)

**Code Location**: `src/lib/dynamodb.ts`

```typescript
const isLocalDevelopment = process.env['AWS_SAM_LOCAL'] === 'true' || !!process.env['DYNAMODB_ENDPOINT'];

const localEndpoint = process.env['DYNAMODB_ENDPOINT'] || 
  (process.env['AWS_SAM_LOCAL'] === 'true' ? 'http://host.docker.internal:8000' : undefined);

if (isLocalDevelopment) {
  clientConfig.credentials = {
    accessKeyId: 'local',
    secretAccessKey: 'local',
  };
}
```

## Environment Variables (`env.json`)

Each Lambda function is configured with:

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

**Note**: Even though `DYNAMODB_ENDPOINT` is set in `env.json`, SAM Local may not always pass it through. That's why the code defaults to `http://host.docker.internal:8000` when `AWS_SAM_LOCAL=true`.

## Endpoints

| Service | URL | Description |
|---------|-----|-------------|
| API Gateway | `http://localhost:3001` | SAM Local API endpoint |
| DynamoDB Local | `http://localhost:8000` | Local database (from host) |
| DynamoDB Local | `http://host.docker.internal:8000` | Local database (from Lambda containers) |
| Health Check | `http://localhost:3001/health` | Test endpoint |

## Testing

### Health Check
```bash
curl http://localhost:3001/health
```

### Create Family
```bash
curl -X POST http://localhost:3001/families \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJzdWIiOiJtb2NrLXVzZXItaWQiLCJlbWFpbCI6InRlc3RAdGVzdC5jb20iLCJuYW1lIjoiVGVzdCBVc2VyIn0=" \
  -d '{"name":"My Family"}'
```

### List DynamoDB Tables
```bash
AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local \
  aws dynamodb list-tables \
    --endpoint-url http://localhost:8000 \
    --region us-east-1
```

### Scan Table Contents
```bash
AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local \
  aws dynamodb scan \
    --table-name InventoryTable \
    --endpoint-url http://localhost:8000 \
    --region us-east-1
```

## Stopping Services

### Stop SAM Local
Press `Ctrl+C` in the terminal running `start-local.sh`

### Stop DynamoDB Local
```bash
docker stop dynamodb-local
docker rm dynamodb-local
```

### Stop Everything
```bash
# Stop SAM Local (Ctrl+C), then:
docker stop dynamodb-local && docker rm dynamodb-local
```

## Development Workflow

1. **Make code changes** in `src/`
2. **Rebuild**:
   ```bash
   npm run build
   sam build
   ```
3. **SAM Local auto-reloads** on the next request
4. **Test** via curl or frontend

**Note**: Only restart SAM Local if you change `template.yaml`

## Troubleshooting

### Authentication Errors

**Symptom**: `User: arn:aws:iam::XXX is not authorized` or `The security token included in the request is invalid`

**Cause**: Table created with different credentials than Lambda functions use

**Fix**:
```bash
# 1. Remove existing DynamoDB Local
docker stop dynamodb-local && docker rm dynamodb-local

# 2. Restart (script will recreate table with correct credentials)
./start-local.sh
```

### Docker Not Found

**Symptom**: `sam local` can't find Docker

**Fix for Colima**:
```bash
export DOCKER_HOST=unix://$HOME/.colima/default/docker.sock
```

**Fix for Docker Engine**: Should auto-detect, but if needed:
```bash
export DOCKER_HOST=unix:///var/run/docker.sock
```

### Table Already Exists Error

**Symptom**: Table creation fails because it already exists

**Solution**: This is normal and expected. The script continues anyway.

To recreate the table with fresh data:
```bash
docker stop dynamodb-local && docker rm dynamodb-local
./start-local.sh
```

## File Changes Summary

### Modified Files

1. **`src/lib/dynamodb.ts`**
   - Added auto-configuration for local development
   - Uses dummy credentials when `AWS_SAM_LOCAL=true`
   - Defaults to `http://host.docker.internal:8000` endpoint

2. **`env.json`**
   - Added `AWS_ACCESS_KEY_ID=local` to all functions
   - Added `AWS_SECRET_ACCESS_KEY=local` to all functions

3. **`start-local.sh`**
   - Creates DynamoDB table with dummy credentials
   - Unsets host AWS credentials before starting SAM
   - Added comprehensive comments and documentation

4. **`README.md`**
   - Added "How Local Development Works" section
   - Added DynamoDB authentication troubleshooting
   - Updated environment variable documentation

## Why This Approach Works

1. **Credential Isolation**: DynamoDB Local isolates tables by credentials, even with `-sharedDb`
2. **Consistent Credentials**: Both table creation and Lambda access use `local`/`local`
3. **Auto-Detection**: Lambda functions auto-detect local mode via `AWS_SAM_LOCAL=true`
4. **No Manual Configuration**: Developers just run `./start-local.sh`

## Additional Resources

- Full documentation: See `README.md`
- API specification: `../inventory-management-context/specs/001-family-inventory-mvp/contracts/api-spec.yaml`
- SAM CLI docs: https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/what-is-sam.html

