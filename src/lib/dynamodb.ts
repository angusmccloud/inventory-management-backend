/**
 * DynamoDB Client Utility - Family Inventory Management System
 * 
 * Centralized DynamoDB Document Client using AWS SDK v3.
 * Provides optimized client configuration for Lambda execution environment.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, TranslateConfig } from '@aws-sdk/lib-dynamodb';

/**
 * AWS SDK v3 DynamoDB Client Configuration
 * 
 * Optimized for Lambda execution:
 * - Connection reuse via HTTP keep-alive
 * - Reduced cold start impact via modular imports
 * - X-Ray tracing enabled
 * - Local development support via DYNAMODB_ENDPOINT
 */

// For local development, always use dummy credentials to bypass AWS IAM
const isLocalDevelopment = process.env['AWS_SAM_LOCAL'] === 'true' || !!process.env['DYNAMODB_ENDPOINT'];

// Build client configuration
const clientConfig: any = {
  region: process.env['AWS_REGION'] || 'us-east-1',
  maxAttempts: 3,
  requestHandler: {
    // Enable HTTP keep-alive for connection reuse
    connectionTimeout: 3000,
    requestTimeout: 3000,
  },
};

// Add endpoint for local DynamoDB
// Use DYNAMODB_ENDPOINT if provided, otherwise use default local endpoint when AWS_SAM_LOCAL is true
const localEndpoint = process.env['DYNAMODB_ENDPOINT'] || (process.env['AWS_SAM_LOCAL'] === 'true' ? 'http://host.docker.internal:8000' : undefined);

if (localEndpoint) {
  clientConfig.endpoint = localEndpoint;
  // Disable TLS for local development
  clientConfig.tls = false;
}

// Always use dummy credentials for local development to bypass AWS IAM
// This must come last to override any credentials from the environment
if (isLocalDevelopment) {
  clientConfig.credentials = {
    accessKeyId: 'local',
    secretAccessKey: 'local',
  };
}

const dynamoDBClient = new DynamoDBClient(clientConfig);

/**
 * DynamoDB Document Client Configuration
 * 
 * Marshalling options:
 * - removeUndefinedValues: Prevent errors from undefined attributes
 * - convertEmptyValues: Handle empty strings/sets properly
 * - convertClassInstanceToMap: Serialize class instances
 */
const marshallOptions: TranslateConfig['marshallOptions'] = {
  removeUndefinedValues: true, // Remove undefined values from objects
  convertEmptyValues: false, // Keep empty strings (false is default)
  convertClassInstanceToMap: true, // Convert class instances to maps
};

const unmarshallOptions: TranslateConfig['unmarshallOptions'] = {
  wrapNumbers: false, // Return numbers as JavaScript numbers (not BigInt)
};

/**
 * DynamoDB Document Client instance
 * 
 * Singleton pattern - reused across Lambda invocations
 */
export const docClient = DynamoDBDocumentClient.from(dynamoDBClient, {
  marshallOptions,
  unmarshallOptions,
});

/**
 * Get the DynamoDB table name from environment variable
 */
export const getTableName = (): string => {
  const tableName = process.env['TABLE_NAME'];
  
  if (!tableName) {
    throw new Error('TABLE_NAME environment variable is not set');
  }
  
  return tableName;
};

/**
 * Common DynamoDB error codes
 */
export const DynamoDBErrorCodes = {
  CONDITIONAL_CHECK_FAILED: 'ConditionalCheckFailedException',
  RESOURCE_NOT_FOUND: 'ResourceNotFoundException',
  ITEM_COLLECTION_SIZE_LIMIT: 'ItemCollectionSizeLimitExceededException',
  PROVISIONED_THROUGHPUT_EXCEEDED: 'ProvisionedThroughputExceededException',
  REQUEST_LIMIT_EXCEEDED: 'RequestLimitExceeded',
  VALIDATION_EXCEPTION: 'ValidationException',
  TRANSACTION_CONFLICT: 'TransactionConflictException',
} as const;

/**
 * Check if an error is a specific DynamoDB error
 */
export const isDynamoDBError = (error: unknown, code: string): boolean => {
  return (
    error instanceof Error &&
    'name' in error &&
    error.name === code
  );
};

/**
 * Type guard for DynamoDB errors
 */
export interface DynamoDBError extends Error {
  name: string;
  $metadata?: {
    httpStatusCode?: number;
    requestId?: string;
    attempts?: number;
    totalRetryDelay?: number;
  };
}
