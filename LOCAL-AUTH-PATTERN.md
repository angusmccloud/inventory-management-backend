# Local Development Authentication Pattern

## Overview

All Lambda handlers use a **standardized authentication pattern** that works seamlessly in both production (with Cognito) and local development (without authentication).

## The Pattern

### 1. Import the Auth Helper

```typescript
import { getUserContext, requireFamilyAccess, requireAdmin } from '../lib/auth.js';
```

### 2. Get User Context

```typescript
// Get authenticated user context (supports local development)
const userContext = getUserContext(event, logger, requireFamilyId);
```

**Parameters:**
- `event`: API Gateway proxy event
- `logger`: Logger instance (optional, for debug messages)
- `requireFamilyId`: Boolean, whether familyId must be present (default: false)

**Returns:**
```typescript
{
  memberId: string;
  email: string;
  name: string;
  familyId?: string;  // Optional, depends on requireFamilyId
  role?: string;      // Optional, present if user is a family member
}
```

### 3. Authorize Access

```typescript
// Ensure user can only access their own family
requireFamilyAccess(userContext, familyId);

// Require admin role (throws error if not admin)
requireAdmin(userContext);
```

## Complete Example

### Before (❌ Inconsistent)

```typescript
export const handler: APIGatewayProxyHandler = async (event, context) => {
  const logger = createLambdaLogger(context.awsRequestId);
  
  try {
    const authorizer = event.requestContext.authorizer;
    if (!authorizer || !authorizer['familyId']) {
      throw new Error('Authentication required');
    }

    const userFamilyId = authorizer['familyId'] as string;
    const userRole = authorizer['role'] as string;
    const familyId = getPathParameter(event.pathParameters, 'familyId');

    if (familyId !== userFamilyId) {
      throw new Error('Access denied to this family');
    }

    if (userRole !== 'admin') {
      throw new Error('Admin role required');
    }

    // ... handler logic
  }
};
```

### After (✅ Standardized)

```typescript
import { getUserContext, requireFamilyAccess, requireAdmin } from '../lib/auth.js';

export const handler: APIGatewayProxyHandler = async (event, context) => {
  const logger = createLambdaLogger(context.awsRequestId);
  
  try {
    // Get authenticated user context (supports local development)
    const userContext = getUserContext(event, logger, true);
    const familyId = getPathParameter(event.pathParameters, 'familyId');

    // Ensure user can only access their own family
    requireFamilyAccess(userContext, familyId);

    // Require admin role
    requireAdmin(userContext);

    // ... handler logic using userContext.memberId, etc.
  }
};
```

## How It Works

### Production (with Cognito Authorizer)

1. API Gateway invokes Cognito authorizer
2. Authorizer validates JWT token
3. Authorizer adds user context to `event.requestContext.authorizer`
4. Handler extracts user info from authorizer context

### Local Development (AWS_SAM_LOCAL=true)

1. SAM Local skips authorizers (not supported)
2. `getUserContext()` detects `AWS_SAM_LOCAL=true`
3. Returns mock user context:
   ```typescript
   {
     memberId: 'mock-user-id',
     email: 'connort@gmail.com',
     name: 'Test User',
     role: 'admin'
   }
   ```
4. `requireFamilyAccess()` and `requireAdmin()` **skip all checks** in local mode
5. Handler logic works identically with full access

## Mock User

The mock user for local development is defined in `src/lib/auth.ts`:

```typescript
const mockContext: UserContext = {
  memberId: 'mock-user-id',
  email: 'connort@gmail.com',
  name: 'Test User',
  role: 'admin', // Mock user has admin access in local development
};
```

**Important**: In local development mode (`AWS_SAM_LOCAL=true`):
- The mock user has **full access to all families** (no family access checks)
- The mock user is always treated as an **admin** (no role checks)
- This is intentional for ease of testing with a single mock user

**To test with a different user**: Modify the mock values in `src/lib/auth.ts` (temporary changes only, don't commit).

## Updated Handlers

All handlers have been updated to use this pattern:

### Family Handlers
- ✅ `createFamily.ts`
- ✅ `listUserFamilies.ts`
- ✅ `getFamily.ts`
- ✅ `updateFamily.ts`

### Inventory Handlers
- ✅ `createInventoryItem.ts`
- ✅ `listInventoryItems.ts`
- ✅ `getInventoryItem.ts`
- ✅ `updateInventoryItem.ts`
- ✅ `adjustInventoryQuantity.ts`
- ✅ `archiveInventoryItem.ts`
- ✅ `deleteInventoryItem.ts`

## Benefits

1. **Consistency**: All handlers use the same authentication pattern
2. **Simplicity**: Less boilerplate code, easier to read
3. **Local Development**: Works seamlessly without Cognito
4. **Type Safety**: TypeScript interfaces for user context
5. **Maintainability**: Auth logic centralized in one file

## Testing

### Test Locally

```bash
# Start backend
./start-local.sh

# Test any endpoint - all use the same mock user
curl -X POST http://localhost:3001/families \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Family"}'

curl http://localhost:3001/user/families

curl http://localhost:3001/families/{familyId}/inventory
```

### Test in Production

In production, the authorizer will provide real user context from Cognito JWT tokens. No code changes needed.

## Migration Guide

To migrate an old handler to the new pattern:

1. **Add import**:
   ```typescript
   import { getUserContext, requireFamilyAccess, requireAdmin } from '../lib/auth.js';
   ```

2. **Replace authorization block** with:
   ```typescript
   const userContext = getUserContext(event, logger, true);
   ```

3. **Replace family access check** with:
   ```typescript
   requireFamilyAccess(userContext, familyId);
   ```

4. **Replace admin check** (if needed) with:
   ```typescript
   requireAdmin(userContext);
   ```

5. **Use user context**:
   ```typescript
   // Instead of: authorizer['memberId']
   // Use: userContext.memberId
   ```

## Related Files

- `src/lib/auth.ts` - Authentication helper functions
- `env.json` - Sets `AWS_SAM_LOCAL=true` for all functions
- `src/lib/dynamodb.ts` - Similar pattern for DynamoDB endpoint

## Notes

- This pattern is **NON-NEGOTIABLE** for all new handlers
- Do not bypass authentication checks
- Do not hardcode user IDs (use `userContext.memberId`)
- Always validate family access before operations
- Always check admin role for destructive operations

