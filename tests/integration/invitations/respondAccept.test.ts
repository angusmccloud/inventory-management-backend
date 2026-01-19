/**
 * Integration Tests: Respond To Invite (Accept)
 */

import { handler } from '../../../src/handlers/invitations/respondToInvite';
import { getPendingInvitationList } from '../../../src/services/inviteMatching/pendingInviteService';
import { verifyDecisionToken } from '../../../src/services/inviteMatching/decisionToken';
import { MemberModel } from '../../../src/models/member';
import { docClient } from '../../../src/lib/dynamodb';
import type { APIGatewayProxyEvent } from 'aws-lambda';

jest.mock('../../../src/services/inviteMatching/pendingInviteService');
jest.mock('../../../src/services/inviteMatching/decisionToken');
jest.mock('../../../src/models/member');
jest.mock('../../../src/lib/dynamodb', () => ({
  docClient: { send: jest.fn() },
  getTableName: () => 'TestTable',
}));

const createMockEvent = (): APIGatewayProxyEvent =>
  ({
    httpMethod: 'POST',
    path: '/pending-invitations/invite-1/accept',
    headers: {},
    body: JSON.stringify({ decisionToken: 'token', switchConfirmed: true }),
    pathParameters: { inviteId: 'invite-1' },
    queryStringParameters: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    resource: '/pending-invitations/{inviteId}/accept',
    stageVariables: null,
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      protocol: 'HTTP/1.1',
      httpMethod: 'POST',
      path: '/pending-invitations/invite-1/accept',
      stage: 'test',
      requestId: 'test-request-id',
      requestTime: '01/Jan/2024:00:00:00 +0000',
      requestTimeEpoch: 1704067200000,
      identity: {
        sourceIp: '127.0.0.1',
        userAgent: 'test-agent',
        cognitoIdentityPoolId: null,
        cognitoIdentityId: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        accountId: null,
        caller: null,
        apiKey: null,
        apiKeyId: null,
        accessKey: null,
        principalOrgId: null,
        user: null,
        userArn: null,
        clientCert: null,
      },
      authorizer: null,
      resourceId: 'test-resource',
      resourcePath: '/pending-invitations/{inviteId}/accept',
    },
  }) as APIGatewayProxyEvent;

describe('Respond To Invite - Accept', () => {
  beforeEach(() => {
    process.env['AWS_SAM_LOCAL'] = 'true';
    jest.clearAllMocks();
  });

  it('creates membership and decision log on accept', async () => {
    (verifyDecisionToken as jest.Mock).mockReturnValue(true);
    (getPendingInvitationList as jest.Mock).mockResolvedValue({
      invites: [
        {
          inviteId: 'invite-1',
          familyId: 'family-1',
          familyName: 'Test Family',
          inviterName: 'Host User',
          roleOffered: 'admin',
          expiresAt: new Date().toISOString(),
          status: 'PENDING',
        },
      ],
      decisionToken: 'token',
    });
    (MemberModel.getById as jest.Mock).mockResolvedValue(null);

    const result = await handler(createMockEvent(), { awsRequestId: 'req-1' } as any);

    expect(result.statusCode).toBe(200);
    expect(docClient.send).toHaveBeenCalledTimes(1);

    const command = (docClient.send as jest.Mock).mock.calls[0][0];
    expect(command.input.TransactItems).toHaveLength(3);
  });
});
