/**
 * Queue Preview Handler
 *
 * Admin endpoint to preview pending notification deliveries without sending.
 * GET /notifications/delivery-queue?method=all|immediate|daily|weekly
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { createLambdaLogger, logLambdaInvocation, logLambdaCompletion } from '../../lib/logger';
import { handleWarmup, warmupResponse } from '../../lib/warmup';
import { successResponse, errorResponse } from '../../lib/response';
import { previewDeliveryQueue } from '../../services/notifications/queuePreviewService';

export const handler: APIGatewayProxyHandler = async (event, context) => {
  // Handle warmup events
  if (handleWarmup(event as unknown as Record<string, unknown>, context)) {
    return warmupResponse();
  }

  const logger = createLambdaLogger(context.awsRequestId);
  logLambdaInvocation('queuePreview', event, context.awsRequestId);

  const startTime = Date.now();

  try {
    // TODO: Add authentication/authorization check for admin access
    // const authorizer = event.requestContext.authorizer;
    // if (!authorizer || !authorizer.isAdmin) {
    //   return errorResponse(403, 'Forbidden', context.awsRequestId);
    // }

    const method = event.queryStringParameters?.['method'] || 'all';

    if (!['all', 'immediate', 'daily', 'weekly'].includes(method)) {
      return errorResponse(400, 'Invalid method parameter', context.awsRequestId);
    }

    const result = await previewDeliveryQueue();

    // Filter by method if specified
    if (method !== 'all') {
      const filtered = {
        immediate: method === 'immediate' ? result.immediate : [],
        daily: method === 'daily' ? result.daily : [],
        weekly: method === 'weekly' ? result.weekly : [],
        counts: {
          immediate: method === 'immediate' ? result.counts.immediate : 0,
          daily: method === 'daily' ? result.counts.daily : 0,
          weekly: method === 'weekly' ? result.counts.weekly : 0,
          total:
            method === 'immediate'
              ? result.counts.immediate
              : method === 'daily'
                ? result.counts.daily
                : result.counts.weekly,
        },
        generatedAt: result.generatedAt,
      };

      logLambdaCompletion('queuePreview', Date.now() - startTime, context.awsRequestId);
      return successResponse(filtered, context.awsRequestId);
    }

    logLambdaCompletion('queuePreview', Date.now() - startTime, context.awsRequestId);
    return successResponse(result, context.awsRequestId);
  } catch (err) {
    logger.error('Failed to preview delivery queue', err as Error);
    return errorResponse(500, 'Failed to preview delivery queue', context.awsRequestId);
  }
};

export default handler;
