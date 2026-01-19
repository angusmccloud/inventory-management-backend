import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, getTableName } from './dynamodb.js';
import { logger as defaultLogger, Logger } from './logger.js';
import { KeyBuilder } from '../types/entities.js';

const TABLE_NAME = getTableName();

const DEFAULT_WINDOW_SECONDS = Number(process.env['RATE_LIMIT_WINDOW_SECONDS'] || 60);
const DEFAULT_MAX_ATTEMPTS = Number(process.env['RATE_LIMIT_MAX_ATTEMPTS'] || 3);

const normalizeNumber = (value: number, fallback: number) =>
  Number.isFinite(value) && value > 0 ? value : fallback;

export type RateLimitInput = {
  memberId: string;
  action: string;
  limit?: number;
  windowSeconds?: number;
  logger?: Logger;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: string;
  limit: number;
};

export const enforceRateLimit = async (input: RateLimitInput): Promise<RateLimitResult> => {
  const limit = normalizeNumber(input.limit ?? DEFAULT_MAX_ATTEMPTS, 3);
  const windowSeconds = normalizeNumber(input.windowSeconds ?? DEFAULT_WINDOW_SECONDS, 60);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(nowSeconds / windowSeconds) * windowSeconds;
  const resetAt = new Date((windowStart + windowSeconds) * 1000).toISOString();
  const ttl = windowStart + windowSeconds;
  const log = input.logger ?? defaultLogger;

  const keys = KeyBuilder.rateLimit(input.memberId, input.action, windowStart);

  try {
    const result = await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: keys.PK, SK: keys.SK },
        UpdateExpression:
          'SET #count = if_not_exists(#count, :zero) + :one, ' +
          '#ttl = :ttl, #entityType = if_not_exists(#entityType, :entityType), ' +
          '#createdAt = if_not_exists(#createdAt, :now), #updatedAt = :now, ' +
          '#memberId = :memberId, #action = :action, #windowStart = :windowStart',
        ExpressionAttributeNames: {
          '#count': 'count',
          '#ttl': 'ttl',
          '#entityType': 'entityType',
          '#createdAt': 'createdAt',
          '#updatedAt': 'updatedAt',
          '#memberId': 'memberId',
          '#action': 'action',
          '#windowStart': 'windowStart',
        },
        ExpressionAttributeValues: {
          ':zero': 0,
          ':one': 1,
          ':ttl': ttl,
          ':entityType': 'RateLimit',
          ':now': new Date().toISOString(),
          ':memberId': input.memberId,
          ':action': input.action,
          ':windowStart': windowStart,
          ':limit': limit,
        },
        ConditionExpression: 'attribute_not_exists(#count) OR #count < :limit',
        ReturnValues: 'ALL_NEW',
      })
    );

    const count = Number(result.Attributes?.['count'] ?? 0);
    const remaining = Math.max(limit - count, 0);

    return {
      allowed: true,
      remaining,
      resetAt,
      limit,
    };
  } catch (error) {
    if ((error as Error).name === 'ConditionalCheckFailedException') {
      log.warn('Rate limit exceeded', {
        memberId: input.memberId,
        action: input.action,
        limit,
        windowSeconds,
      });
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        limit,
      };
    }

    log.error('Rate limit check failed', error as Error, {
      memberId: input.memberId,
      action: input.action,
    });
    throw error;
  }
};
