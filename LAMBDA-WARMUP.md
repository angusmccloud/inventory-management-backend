# Lambda Warmup Implementation

## Overview

This project now includes a comprehensive Lambda warmup solution to reduce cold starts and improve response times. The warmup system uses AWS EventBridge to periodically invoke all Lambda functions, keeping them "warm" and ready to handle real requests.

## Architecture

### EventBridge Warmup Rule

- **Schedule**: Every 5 minutes (`rate(5 minutes)`)
- **Targets**: All 52 Lambda functions in the application
- **Prewarm**: Functions are warmed immediately on deployment via initial invocation

### Warmup Detection

Handlers detect warmup events using a utility function that checks:
1. EventBridge source (`aws.events`)
2. Event detail-type (`Scheduled Event`)
3. Resource ARN contains "warmup"

### Early Exit Pattern

When a warmup event is detected, handlers:
1. Log the warmup invocation
2. Return immediately without processing
3. Keep the Lambda container warm for subsequent real requests

## Implementation Details

### 1. SAM Template Changes

#### Global Environment Variable
```yaml
Globals:
  Function:
    Environment:
      Variables:
        WARMUP_ENABLED: "true"
```

#### EventBridge Rule
```yaml
LambdaWarmupRule:
  Type: AWS::Events::Rule
  Properties:
    Name: !Sub '${AWS::StackName}-lambda-warmup-${Environment}'
    Description: Scheduled rule to keep Lambda functions warm
    ScheduleExpression: rate(5 minutes)
    State: ENABLED
    Targets:
      - Arn: !GetAtt HealthCheckFunction.Arn
        Id: HealthCheckFunctionTarget
      # ... all other functions
```

#### Lambda Permissions
Each function needs permission for EventBridge to invoke it:
```yaml
HealthCheckFunctionWarmupPermission:
  Type: AWS::Lambda::Permission
  Properties:
    FunctionName: !Ref HealthCheckFunction
    Action: lambda:InvokeFunction
    Principal: events.amazonaws.com
    SourceArn: !GetAtt LambdaWarmupRule.Arn
```

### 2. Warmup Utility (`src/lib/warmup.ts`)

```typescript
/**
 * Check if the current invocation is a warmup ping
 */
export const isWarmupEvent = (event: any): boolean => {
  if (event.source === 'serverless-plugin-warmup' || 
      event['detail-type'] === 'Scheduled Event' && 
      event.source === 'aws.events' &&
      event.resources?.[0]?.includes?.('warmup')) {
    return true;
  }
  return false;
};

/**
 * Exit early if this is a warmup event
 */
export const handleWarmup = (event: any, context: Context): boolean => {
  if (isWarmupEvent(event)) {
    logger.info('Warmup event detected - exiting early');
    return true;
  }
  return false;
};

/**
 * Response to return for warmup events
 */
export const warmupResponse = () => ({
  statusCode: 200,
  body: JSON.stringify({ 
    message: 'Lambda warmed up successfully',
    timestamp: new Date().toISOString()
  }),
});
```

### 3. Handler Pattern

All Lambda handlers follow this pattern:

```typescript
import { handleWarmup, warmupResponse } from '../lib/warmup.js';

export const handler: APIGatewayProxyHandler = async (event, context) => {
  // Handle warmup events - exit early to avoid unnecessary processing
  if (handleWarmup(event, context)) {
    return warmupResponse();
  }

  // Normal handler logic continues...
  const startTime = Date.now();
  const logger = createLambdaLogger(context.awsRequestId);
  // ...
};
```

## Functions with Warmup

Total: **52 Lambda functions**

### Core Functions
- HealthCheckFunction
- AuthorizerFunction

### Family Management
- CreateFamilyFunction
- ListUserFamiliesFunction
- GetFamilyFunction
- UpdateFamilyFunction

### Inventory Management
- CreateInventoryItemFunction
- ListInventoryItemsFunction
- GetInventoryItemFunction
- UpdateInventoryItemFunction
- AdjustInventoryQuantityFunction
- ArchiveInventoryItemFunction
- DeleteInventoryItemFunction

### Notifications
- ListNotificationsFunction
- AcknowledgeNotificationFunction
- ResolveNotificationFunction

### Shopping List
- ListShoppingListItemsFunction
- AddToShoppingListFunction
- GetShoppingListItemFunction
- UpdateShoppingListItemFunction
- UpdateShoppingListItemStatusFunction
- RemoveFromShoppingListFunction

### Invitations
- CreateInvitationFunction
- ListInvitationsFunction
- GetInvitationFunction
- RevokeInvitationFunction
- AcceptInvitationFunction

### Member Management
- ListMembersFunction
- GetMemberFunction
- UpdateMemberFunction
- RemoveMemberFunction

### Reference Data - Storage Locations
- ListStorageLocationsFunction
- CreateStorageLocationFunction
- GetStorageLocationFunction
- UpdateStorageLocationFunction
- DeleteStorageLocationFunction
- CheckStorageLocationNameFunction

### Reference Data - Stores
- ListStoresFunction
- CreateStoreFunction
- GetStoreFunction
- UpdateStoreFunction
- DeleteStoreFunction
- CheckStoreNameFunction

### Suggestions
- CreateSuggestionFunction
- ListSuggestionsFunction
- GetSuggestionFunction
- ApproveSuggestionFunction
- RejectSuggestionFunction

### NFC Integration
- NfcAdjustmentFunction
- ListItemNfcUrlsFunction
- CreateNfcUrlFunction
- RotateNfcUrlFunction
- ListFamilyNfcUrlsFunction

## Benefits

1. **Reduced Cold Starts**: Functions stay warm with recent executions
2. **Improved Response Times**: First user request doesn't pay cold start penalty
3. **Better User Experience**: Consistent, fast response times
4. **Minimal Cost Impact**: 5-minute intervals balance performance vs. cost

## Cost Considerations

- **Invocation Frequency**: 12 invocations/hour per function = 288/day per function
- **Total Daily Invocations**: 52 functions × 288 = 14,976 invocations/day
- **Monthly Invocations**: ~449,280 invocations/month
- **Free Tier**: AWS Lambda includes 1 million free invocations/month
- **Cost**: Well within free tier limits for most deployments

## Monitoring

Monitor warmup effectiveness using CloudWatch metrics:
- Lambda Duration (should be lower after warmup)
- Init Duration (should be minimal for warmed functions)
- Throttles (ensure warmup doesn't cause throttling)

## Customization

### Adjust Warmup Frequency

In `template.yaml`, modify the schedule expression:
```yaml
ScheduleExpression: rate(5 minutes)  # Current setting
# Options:
# rate(1 minute)   - More aggressive (higher cost)
# rate(10 minutes) - Less aggressive (more cold starts)
# rate(15 minutes) - Minimal warmup
```

### Disable Warmup for Specific Functions

Remove function from `LambdaWarmupRule` Targets array and delete corresponding permission resource.

### Disable Warmup Globally

Set the EventBridge rule state to `DISABLED`:
```yaml
LambdaWarmupRule:
  Type: AWS::Events::Rule
  Properties:
    State: DISABLED
```

## Testing Warmup Locally

When running with `sam local`, warmup events won't trigger automatically. To test:

```bash
# Invoke with a test warmup event
sam local invoke HealthCheckFunction -e events/warmup-event.json
```

Example `events/warmup-event.json`:
```json
{
  "version": "0",
  "id": "warmup-test",
  "detail-type": "Scheduled Event",
  "source": "aws.events",
  "resources": [
    "arn:aws:events:us-east-1:123456789012:rule/warmup"
  ],
  "time": "2026-01-01T12:00:00Z"
}
```

## Deployment

The warmup system deploys automatically with:
```bash
sam build && sam deploy
```

All Lambda permissions and EventBridge rules are created during stack deployment.

## Troubleshooting

### Functions Still Experiencing Cold Starts

1. Check CloudWatch Logs for warmup invocations
2. Verify EventBridge rule is enabled
3. Ensure Lambda permissions are properly configured
4. Consider reducing warmup interval

### High Costs

1. Increase warmup interval (e.g., from 5 to 10 minutes)
2. Remove warmup from infrequently used functions
3. Monitor CloudWatch costs dashboard

### Warmup Not Working

1. Verify `WARMUP_ENABLED` environment variable is set
2. Check that `handleWarmup` is called at the start of handlers
3. Review CloudWatch Logs for warmup detection messages
4. Ensure EventBridge has proper IAM permissions

## Related Files

- `src/lib/warmup.ts` - Warmup utility functions
- `template.yaml` - EventBridge rule and Lambda permissions
- `patch-warmup.js` - Automated script used to add warmup to all handlers
- All handler files in `src/handlers/` - Warmup checks at function entry

## References

- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [EventBridge Scheduled Rules](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-create-rule-schedule.html)
- [serverless-plugin-warmup](https://www.serverless.com/plugins/serverless-plugin-warmup) (inspiration)
