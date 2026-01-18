/**
 * POST /notifications/unsubscribe
 * Accepts { token } and applies unsubscribe_all for the referenced member
 */

import { APIGatewayProxyHandler } from 'aws-lambda';
import { validateUnsubscribeToken } from '../../lib/unsubscribeToken';
import { MemberModel } from '../../models/member';
import { applyUnsubscribeAllEmail } from '../../services/notifications/defaults';
import { successResponse, badRequestResponse, handleError } from '../../lib/response';
import { createLambdaLogger } from '../../lib/logger';

export const handler: APIGatewayProxyHandler = async (event, context) => {
  const logger = createLambdaLogger(context.awsRequestId);

  try {
    if (!event.body) return badRequestResponse('Missing request body');
    const body = JSON.parse(event.body);
    const token = body?.token;
    if (!token) return badRequestResponse('Missing token');

    const secret = process.env['UNSUBSCRIBE_SECRET'] || '';
    if (!secret) {
      logger.error('Unsubscribe secret not configured');
      return badRequestResponse('Unsubscribe not available');
    }

    const payload = validateUnsubscribeToken(token, secret);
    if (!payload) return badRequestResponse('Invalid or expired token');

    // Load member
    const member = await MemberModel.getById(payload.familyId, payload.memberId);
    if (!member) return badRequestResponse('Member not found');

    // Apply unsubscribe: set flag and update preferences map
    const prefs = applyUnsubscribeAllEmail(member.notificationPreferences ?? {});
    await MemberModel.update(payload.familyId, payload.memberId, { notificationPreferences: prefs, unsubscribeAllEmail: true });

    logger.info('Applied unsubscribe for member', { memberId: payload.memberId, familyId: payload.familyId });
    return successResponse(204, null as any);
  } catch (err) {
    logger.error('Unsubscribe handler failed', err as Error);
    return handleError(err);
  }
};

export default handler;
