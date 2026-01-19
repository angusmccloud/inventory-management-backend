import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { handler as requestHandler } from '../../../src/handlers/user-settings/requestEmailChange';
import { handler as confirmHandler } from '../../../src/handlers/user-settings/confirmEmailChange';
import { MemberModel } from '../../../src/models/member';
import { CredentialVerificationTicketModel } from '../../../src/models/credentialVerificationTicket';
import { getUserContext } from '../../../src/lib/auth';

const sendMock = jest.fn();

jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn().mockImplementation(() => ({ send: sendMock })),
  AdminInitiateAuthCommand: jest.fn(),
  AdminUpdateUserAttributesCommand: jest.fn(),
}));

jest.mock('../../../src/models/member', () => ({
  MemberModel: {
    getByMemberId: jest.fn(),
    getById: jest.fn(),
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

const baseContext = { awsRequestId: 'req-2' } as Context;

const requestEvent = (body?: unknown): APIGatewayProxyEvent =>
  ({
    httpMethod: 'POST',
    path: '/user-settings/email-change',
    body: body ? JSON.stringify(body) : null,
    headers: {},
  } as APIGatewayProxyEvent);

const confirmEvent = (body?: unknown): APIGatewayProxyEvent =>
  ({
    httpMethod: 'POST',
    path: '/user-settings/email-change/confirm',
    body: body ? JSON.stringify(body) : null,
    headers: {},
  } as APIGatewayProxyEvent);

describe('email change flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env['COGNITO_USER_POOL_ID'] = 'pool';
    process.env['COGNITO_USER_POOL_CLIENT_ID'] = 'client';
  });

  it('issues a verification ticket', async () => {
    (getUserContext as jest.Mock).mockReturnValue({ memberId: 'm1', email: 'old@example.com' });
    (MemberModel.getByMemberId as jest.Mock).mockResolvedValue({
      memberId: 'm1',
      familyId: 'f1',
      email: 'old@example.com',
      status: 'active',
    });
    sendMock.mockResolvedValueOnce({});
    (CredentialVerificationTicketModel.create as jest.Mock).mockResolvedValue({
      ticketId: 't1',
      expiresAt: new Date().toISOString(),
    });

    const result = await requestHandler(
      requestEvent({ currentPassword: 'OldPassword1!', newEmail: 'new@example.com' }),
      baseContext
    );

    expect(result.statusCode).toBe(202);
    const body = JSON.parse(result.body);
    expect(body.data.ticketId).toBe('t1');
  });

  it('confirms email change using ticket', async () => {
    const expiresAt = new Date(Date.now() + 60 * 1000).toISOString();
    (CredentialVerificationTicketModel.getById as jest.Mock).mockResolvedValue({
      ticketId: 't1',
      familyId: 'f1',
      memberId: 'm1',
      newEmail: 'new@example.com',
      status: 'pending',
      expiresAt,
    });
    (MemberModel.getById as jest.Mock).mockResolvedValue({
      memberId: 'm1',
      familyId: 'f1',
      email: 'old@example.com',
      status: 'active',
    });
    (CredentialVerificationTicketModel.updateStatus as jest.Mock).mockResolvedValue({
      ticketId: 't1',
      status: 'confirmed',
    });
    sendMock.mockResolvedValueOnce({});

    const result = await confirmHandler(
      confirmEvent({ ticketId: 't1' }),
      baseContext
    );

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.data.primaryEmail).toBe('new@example.com');
  });
});
