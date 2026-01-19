import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { handler as requestHandler } from '../../../src/handlers/user-settings/requestAccountDelete';
import { handler as confirmHandler } from '../../../src/handlers/user-settings/confirmAccountDelete';
import { MemberModel } from '../../../src/models/member';
import { CredentialVerificationTicketModel } from '../../../src/models/credentialVerificationTicket';
import { getUserContext } from '../../../src/lib/auth';

jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn().mockImplementation(() => ({ send: jest.fn() })),
  AdminInitiateAuthCommand: jest.fn(),
  AdminUserGlobalSignOutCommand: jest.fn(),
}));

jest.mock('../../../src/models/member', () => ({
  MemberModel: {
    getByMemberId: jest.fn(),
    getById: jest.fn(),
    listByFamily: jest.fn(),
  },
}));

jest.mock('../../../src/models/credentialVerificationTicket', () => ({
  CredentialVerificationTicketModel: {
    create: jest.fn(),
    getById: jest.fn(),
    updateStatus: jest.fn(),
  },
}));

jest.mock('../../../src/lib/auth', () => ({
  getUserContext: jest.fn(),
}));

jest.mock('../../../src/lib/dynamodb', () => ({
  docClient: { send: jest.fn() },
  getTableName: () => 'test-table',
}));

jest.mock('../../../src/services/auditLogService', () => ({
  recordAuditEvent: jest.fn(),
}));

jest.mock('../../../src/services/notificationService', () => ({
  NotificationService: {
    createUserSettingsReceipt: jest.fn(),
  },
}));

const baseContext = { awsRequestId: 'req-3' } as Context;

const requestEvent = (body?: unknown): APIGatewayProxyEvent =>
  ({
    httpMethod: 'POST',
    path: '/user-settings/deletion',
    body: body ? JSON.stringify(body) : null,
    headers: {},
  } as APIGatewayProxyEvent);

const confirmEvent = (body?: unknown): APIGatewayProxyEvent =>
  ({
    httpMethod: 'POST',
    path: '/user-settings/deletion/confirm',
    body: body ? JSON.stringify(body) : null,
    headers: {},
  } as APIGatewayProxyEvent);

describe('account deletion flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env['COGNITO_USER_POOL_ID'] = 'pool';
    process.env['COGNITO_USER_POOL_CLIENT_ID'] = 'client';
  });

  it('issues a deletion ticket', async () => {
    (getUserContext as jest.Mock).mockReturnValue({ memberId: 'm1', email: 'test@example.com' });
    (MemberModel.getByMemberId as jest.Mock).mockResolvedValue({
      memberId: 'm1',
      familyId: 'f1',
      email: 'test@example.com',
      status: 'active',
    });
    (CredentialVerificationTicketModel.create as jest.Mock).mockResolvedValue({
      ticketId: 'f1_t1',
      expiresAt: new Date().toISOString(),
    });

    const result = await requestHandler(
      requestEvent({ currentPassword: 'OldPassword1!', acknowledgementText: 'DELETE' }),
      baseContext
    );

    expect(result.statusCode).toBe(202);
  });

  it('confirms deletion ticket', async () => {
    const expiresAt = new Date(Date.now() + 60 * 1000).toISOString();
    (CredentialVerificationTicketModel.getById as jest.Mock).mockResolvedValue({
      ticketId: 'f1_t1',
      familyId: 'f1',
      memberId: 'm1',
      actionType: 'delete_account',
      status: 'pending',
      expiresAt,
    });
    (MemberModel.getById as jest.Mock).mockResolvedValue({
      memberId: 'm1',
      familyId: 'f1',
      email: 'test@example.com',
      status: 'active',
    });
    (MemberModel.listByFamily as jest.Mock).mockResolvedValue([
      { memberId: 'm1', familyId: 'f1', status: 'active' },
    ]);

    const result = await confirmHandler(confirmEvent({ ticketId: 'f1_t1' }), baseContext);

    expect(result.statusCode).toBe(200);
  });
});
