/**
 * Pending Invite Metrics & Logging Helpers
 */

import { CloudWatchClient, PutMetricDataCommand, StandardUnit } from '@aws-sdk/client-cloudwatch';
import { createLambdaLogger } from '../logger';

const cloudwatch = new CloudWatchClient({});
const NAMESPACE = 'InventoryHQ/PendingInvites';

export const publishLookupMetric = async (durationMs: number): Promise<void> => {
  try {
    await cloudwatch.send(
      new PutMetricDataCommand({
        Namespace: NAMESPACE,
        MetricData: [
          {
            MetricName: 'LookupDuration',
            Value: durationMs,
            Unit: StandardUnit.Milliseconds,
            Timestamp: new Date(),
          },
        ],
      })
    );
  } catch (error) {
    console.error('Failed to publish pending invite lookup metric', error);
  }
};

export const publishDecisionMetric = async (
  action: 'ACCEPTED' | 'DECLINED',
  durationMs: number
): Promise<void> => {
  try {
    await cloudwatch.send(
      new PutMetricDataCommand({
        Namespace: NAMESPACE,
        MetricData: [
          {
            MetricName: 'DecisionDuration',
            Dimensions: [{ Name: 'Action', Value: action }],
            Value: durationMs,
            Unit: StandardUnit.Milliseconds,
            Timestamp: new Date(),
          },
        ],
      })
    );
  } catch (error) {
    console.error('Failed to publish pending invite decision metric', error);
  }
};

export const logPendingInviteEvent = (
  requestId: string,
  event: 'lookup' | 'decision',
  details: Record<string, unknown>
): void => {
  const logger = createLambdaLogger(requestId);
  if (event === 'lookup') {
    logger.info('Pending invite lookup', details);
    return;
  }
  logger.info('Pending invite decision', details);
};
