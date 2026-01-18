/**
 * Immediate Dispatcher
 * Runs every 15 minutes, queries unresolved NotificationEvents, filters by preferences,
 * and marks deliveryLedger entries to avoid duplicates. This minimal implementation
 * does not send real emails; it marks items as delivered for the IMMEDIATE window.
 */
import { APIGatewayProxyHandler } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, getTableName } from '../../lib/dynamodb';
import { createLambdaLogger, logLambdaInvocation, logLambdaCompletion } from '../../lib/logger';
import { handleWarmup, warmupResponse } from '../../lib/warmup';
import { sendNotification } from '../../services/notifications/send';
import { publishJobMetrics, logJobEvent, JobMetrics } from '../../lib/monitoring/notificationMetrics';
import { generateUUID } from '../../lib/uuid';

const TABLE_NAME = getTableName();

export const handler: APIGatewayProxyHandler = async (event, context) => {
  if (handleWarmup(event, context)) return warmupResponse();

  const logger = createLambdaLogger(context.awsRequestId);
  logLambdaInvocation('immediateDispatcher', event, context.awsRequestId);

  const runId = generateUUID();
  const startedAt = new Date();

  const metrics: JobMetrics = {
    jobType: 'IMMEDIATE',
    runId,
    startedAt,
    targetUserCount: 0,
    emailSentCount: 0,
    skippedCount: 0,
    errorCount: 0,
  };

  logJobEvent(context.awsRequestId, 'start', 'IMMEDIATE', { runId });

  try {
    // For minimal implementation, scan for Notification items with status ACTIVE.
    // In production, use GSI queries and pagination.
    const result = await docClient.send(
      new QueryCommand(
        {
          TableName: TABLE_NAME,
          // Minimal/unsafe query for demo purposes. Casting to any to avoid strict SDK typing issues.
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: { ':pk': 'FAMILY#', ':sk': 'NOTIFICATION#' },
        } as any
      )
    );

    const items = result.Items || [];
    let marked = 0;

    for (const item of items) {
      if (item['status'] !== 'ACTIVE') continue;
      const familyId = item['familyId'];
      const notificationId = item['notificationId'];

      try {
        // For each channel we'd check preferences; here assume EMAIL immediate
        // Use stubbed send path which will mark ledger entries as delivered
        await sendNotification(familyId, notificationId, 'EMAIL', undefined, context.awsRequestId);
        marked++;
        metrics.emailSentCount++;
      } catch (err) {
        logger.error('Failed to send notification', err as Error, { familyId, notificationId });
        metrics.errorCount++;
      }
    }

    metrics.targetUserCount = items.length;
    metrics.completedAt = new Date();

    // Publish metrics to CloudWatch
    await publishJobMetrics(metrics);
    logJobEvent(context.awsRequestId, 'complete', 'IMMEDIATE', {
      runId,
      marked,
      targetUserCount: metrics.targetUserCount,
      emailSentCount: metrics.emailSentCount,
      errorCount: metrics.errorCount,
    });

    logLambdaCompletion('immediateDispatcher', 0, context.awsRequestId);
    logger.info('Immediate dispatcher completed', { marked, runId });
    return {
      statusCode: 200,
      body: JSON.stringify({ marked, runId }),
      headers: { 'Content-Type': 'application/json' },
    } as any;
  } catch (err) {
    metrics.errorCount++;
    metrics.completedAt = new Date();
    await publishJobMetrics(metrics);
    logJobEvent(context.awsRequestId, 'error', 'IMMEDIATE', {
      runId,
      error: (err as Error).message,
    });
    logger.error('Immediate dispatcher failed', err as Error);
    throw err;
  }
};

export default handler;
