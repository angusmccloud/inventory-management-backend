import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { handler } from '../../../src/handlers/user-settings/changePassword';
import { MemberModel } from '../../../src/models/member';
import { recordAuditEvent } from '../../../src/services/auditLogService';
import { getUserContext } from '../../../src/lib/auth';

const sendMock = jest.fn();

jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn().mockImplementation(() => ({ send: sendMock })),
  AdminInitiateAuthCommand: jest.fn(),
  AdminSetUserPasswordCommand: jest.fn(),
  AdminUserGlobalSignOutCommand: jest.fn(),
}));

jest.mock('../../../src/models/member', () => ({
  MemberModel: {
    getByMemberId: jest.fn(),
  },
}));

jest.mock('../../../src/services/auditLogService', () => ({
  recordAuditEvent: jest.fn(),
}));

jest.mock('../../../src/lib/auth', () => ({
  getUserContext: jest.fn(),
}));

jest.mock('../../../src/lib/rate-limiter', () => ({
  enforceRateLimit: jest.fn().mockResolvedValue({
    allowed: true,
    remaining: 2,
    resetAt: '2026-01-18T00:00:00.000Z',
    limit: 3,
  }),
}));

jest.mock('../../../src/lib/dynamodb', () => ({
  docClient: { send: jest.fn() },
  getTableName: () => 'test-table',
}));

const baseEvent = (body?: unknown): APIGatewayProxyEvent =>
  ({
    httpMethod: 'POST',
    path: '/user-settings/password-change',
    body: body ? JSON.stringify(body) : null,
    headers: {},
  } as APIGatewayProxyEvent);

const baseContext = { awsRequestId: 'req-1' } as Context;

describe('changePassword handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env['COGNITO_USER_POOL_ID'] = 'pool';
    process.env['COGNITO_USER_POOL_CLIENT_ID'] = 'client';
  });

  it('returns 400 when body is missing', async () => {
    const result = await handler(baseEvent(), baseContext);
    expect(result.statusCode).toBe(400);
  });

  it('returns 400 for invalid payload', async () => {
    const result = await handler(baseEvent({ currentPassword: '', newPassword: 'short' }), baseContext);
    expect(result.statusCode).toBe(400);
  });

  it('returns 403 when member is missing', async () => {
    (getUserContext as jest.Mock).mockReturnValue({ memberId: 'm1', email: 'test@example.com' });
    (MemberModel.getByMemberId as jest.Mock).mockResolvedValue(null);

    const result = await handler(
      baseEvent({ currentPassword: 'OldPassword1!', newPassword: 'NewPassword1!' }),
      baseContext
    );

    expect(result.statusCode).toBe(403);
  });

  it('returns 401 when current password fails verification', async () => {
    (getUserContext as jest.Mock).mockReturnValue({ memberId: 'm1', email: 'test@example.com' });
    (MemberModel.getByMemberId as jest.Mock).mockResolvedValue({
      memberId: 'm1',
      familyId: 'f1',
      email: 'test@example.com',
      status: 'active',
    });
    sendMock.mockRejectedValueOnce(new Error('NotAuthorizedException'));

    const result = await handler(
      baseEvent({ currentPassword: 'BadPassword1!', newPassword: 'NewPassword1!' }),
      baseContext
    );

    expect(result.statusCode).toBe(401);
  });

  it('returns 200 when password is updated', async () => {
    (getUserContext as jest.Mock).mockReturnValue({ memberId: 'm1', email: 'test@example.com' });
    (MemberModel.getByMemberId as jest.Mock).mockResolvedValue({
      memberId: 'm1',
      familyId: 'f1',
      email: 'test@example.com',
      status: 'active',
    });

    sendMock.mockResolvedValueOnce({}); // verify current password
    sendMock.mockResolvedValueOnce({}); // set new password
    sendMock.mockResolvedValueOnce({}); // global signout

    const result = await handler(
      baseEvent({ currentPassword: 'OldPassword1!', newPassword: 'NewPassword1!' }),
      baseContext
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.data.sessionsRevoked).toBe(true);
    expect(recordAuditEvent).toHaveBeenCalled();
  });
});
