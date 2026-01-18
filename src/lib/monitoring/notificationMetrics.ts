/**
 * Notification Metrics & Logging Helpers
 *
 * CloudWatch metrics and structured logging for notification jobs.
 * Provides observability for immediate dispatcher and digest jobs.
 */

import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from '@aws-sdk/client-cloudwatch';
import { createLambdaLogger } from '../logger';

const cloudwatch = new CloudWatchClient({});
const NAMESPACE = 'InventoryHQ/Notifications';

export type JobType = 'IMMEDIATE' | 'DAILY' | 'WEEKLY';

export interface JobMetrics {
  jobType: JobType;
  runId: string;
  startedAt: Date;
  completedAt?: Date;
  targetUserCount: number;
  emailSentCount: number;
  skippedCount: number;
  errorCount: number;
}

/**
 * Publish notification job metrics to CloudWatch
 */
export async function publishJobMetrics(metrics: JobMetrics): Promise<void> {
  const timestamp = new Date();

  try {
    await cloudwatch.send(
      new PutMetricDataCommand({
        Namespace: NAMESPACE,
        MetricData: [
          {
            MetricName: 'EmailsSent',
            Dimensions: [{ Name: 'JobType', Value: metrics.jobType }],
            Value: metrics.emailSentCount,
            Unit: StandardUnit.Count,
            Timestamp: timestamp,
          },
          {
            MetricName: 'UsersTargeted',
            Dimensions: [{ Name: 'JobType', Value: metrics.jobType }],
            Value: metrics.targetUserCount,
            Unit: StandardUnit.Count,
            Timestamp: timestamp,
          },
          {
            MetricName: 'Skipped',
            Dimensions: [{ Name: 'JobType', Value: metrics.jobType }],
            Value: metrics.skippedCount,
            Unit: StandardUnit.Count,
            Timestamp: timestamp,
          },
          {
            MetricName: 'Errors',
            Dimensions: [{ Name: 'JobType', Value: metrics.jobType }],
            Value: metrics.errorCount,
            Unit: StandardUnit.Count,
            Timestamp: timestamp,
          },
          {
            MetricName: 'JobDuration',
            Dimensions: [{ Name: 'JobType', Value: metrics.jobType }],
            Value: metrics.completedAt
              ? metrics.completedAt.getTime() - metrics.startedAt.getTime()
              : 0,
            Unit: StandardUnit.Milliseconds,
            Timestamp: timestamp,
          },
        ],
      })
    );
  } catch (err) {
    // Log but don't fail the job if metrics publishing fails
    console.error('Failed to publish CloudWatch metrics', err);
  }
}

/**
 * Log structured notification job event
 */
export function logJobEvent(
  requestId: string,
  event: 'start' | 'complete' | 'error' | 'skip',
  jobType: JobType,
  details: Record<string, unknown> = {}
): void {
  const logger = createLambdaLogger(requestId);
  const baseContext = { jobType, event, ...details };

  switch (event) {
    case 'start':
      logger.info('Notification job started', baseContext);
      break;
    case 'complete':
      logger.info('Notification job completed', baseContext);
      break;
    case 'error':
      logger.error('Notification job error', new Error(String(details['message'] || 'Unknown error')), baseContext);
      break;
    case 'skip':
      logger.info('Notification skipped', baseContext);
      break;
  }
}

/**
 * Log individual email delivery attempt
 */
export function logEmailDelivery(
  requestId: string,
  success: boolean,
  memberId: string,
  notificationId: string,
  jobType: JobType,
  error?: string
): void {
  const logger = createLambdaLogger(requestId);
  const context = { memberId, notificationId, jobType, success };

  if (success) {
    logger.info('Email delivered', context);
  } else {
    logger.error('Email delivery failed', new Error(error || 'Unknown error'), context);
  }
}

export default {
  publishJobMetrics,
  logJobEvent,
  logEmailDelivery,
};
