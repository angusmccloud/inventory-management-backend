/**
 * Lambda Warmup Orchestrator
 * 
 * Invoked by EventBridge on a schedule to keep all Lambda functions warm.
 * Invokes all functions asynchronously with a warmup event to initialize
 * execution contexts and reduce cold starts.
 */

import { EventBridgeEvent } from 'aws-lambda';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const lambda = new LambdaClient({});
const STACK_NAME = process.env['STACK_NAME']!;
const ENVIRONMENT = process.env['ENVIRONMENT']!;

// List of all Lambda functions to warm up (without stack prefix)
const FUNCTION_NAMES = [
  'health-check',
  'authorizer',
  'create-family',
  'list-user-families',
  'get-family',
  'update-family',
  'create-inventory-item',
  'list-inventory-items',
  'get-inventory-item',
  'update-inventory-item',
  'adjust-inventory-quantity',
  'archive-inventory-item',
  'delete-inventory-item',
  'list-notifications',
  'acknowledge-notification',
  'resolve-notification',
  'list-shopping-list',
  'add-to-shopping-list',
  'get-shopping-list-item',
  'update-shopping-list-item',
  'update-shopping-list-item-status',
  'remove-from-shopping-list',
  'create-invitation',
  'list-invitations',
  'get-invitation',
  'revoke-invitation',
  'accept-invitation',
  'list-members',
  'get-member',
  'update-member',
  'remove-member',
  'list-storage-locations',
  'create-storage-location',
  'get-storage-location',
  'update-storage-location',
  'delete-storage-location',
  'check-storage-location-name',
  'list-stores',
  'create-store',
  'get-store',
  'update-store',
  'delete-store',
  'check-store-name',
  'create-suggestion',
  'list-suggestions',
  'get-suggestion',
  'approve-suggestion',
  'reject-suggestion',
  'nfc-adjustment',
  'list-item-nfc-urls',
  'create-nfc-url',
  'rotate-nfc-url',
  'list-family-nfc-urls',
  'get-theme-preference',
  'update-theme-preference',
  // Dashboard functions (Feature 014)
  'dashboard-public-access',
  'dashboard-adjustment',
  'dashboard-access-record',
  'list-dashboards',
  'create-dashboard',
  'get-dashboard',
  'update-dashboard',
  'delete-dashboard',
  'rotate-dashboard',
];

/**
 * Warmup event payload - recognized by all Lambda functions
 */
const WARMUP_EVENT = {
  source: 'warmup.orchestrator',
  warmup: true,
  timestamp: new Date().toISOString(),
};

export const handler = async (event: EventBridgeEvent<string, unknown>): Promise<void> => {
  console.log('Starting Lambda warmup orchestrator', {
    scheduledTime: event.time,
    functionCount: FUNCTION_NAMES.length,
  });

  const startTime = Date.now();
  const invocations = FUNCTION_NAMES.map(async (functionName) => {
    const fullFunctionName = `${STACK_NAME}-${functionName}-${ENVIRONMENT}`;
    
    try {
      await lambda.send(new InvokeCommand({
        FunctionName: fullFunctionName,
        InvocationType: 'Event', // Asynchronous invocation - don't wait for response
        Payload: Buffer.from(JSON.stringify(WARMUP_EVENT)),
      }));
      
      return { functionName: fullFunctionName, status: 'success' };
    } catch (error) {
      console.error(`Failed to warm up ${fullFunctionName}:`, error);
      return { functionName: fullFunctionName, status: 'failed', error };
    }
  });

  // Wait for all invocations to complete
  const results = await Promise.all(invocations);
  
  const successCount = results.filter(r => r.status === 'success').length;
  const failureCount = results.filter(r => r.status === 'failed').length;
  const duration = Date.now() - startTime;

  console.log('Warmup orchestrator completed', {
    totalFunctions: FUNCTION_NAMES.length,
    successful: successCount,
    failed: failureCount,
    durationMs: duration,
  });

  // Log failures for monitoring
  if (failureCount > 0) {
    const failures = results.filter(r => r.status === 'failed');
    console.error('Warmup failures:', failures);
  }
};
