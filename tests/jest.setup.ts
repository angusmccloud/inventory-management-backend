/**
 * Jest Setup File
 * 
 * Sets up the test environment before any tests run.
 */

// Set required environment variables for tests
process.env['TABLE_NAME'] = 'test-inventory-table';
process.env['AWS_REGION'] = 'us-east-1';
process.env['STAGE'] = 'test';

