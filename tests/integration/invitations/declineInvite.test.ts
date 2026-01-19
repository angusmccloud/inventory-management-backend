/**
 * Integration Tests: Decline pending invites
 */

import { handler } from '../../../src/handlers/invitations/respondToInvite';
import { getPendingInvitationList } from '../../../src/services/inviteMatching/pendingInviteService';
import { verifyDecisionToken } from '../../../src/services/inviteMatching/decisionToken';
import { docClient } from '../../../src/lib/dynamodb';
import type { APIGatewayProxyEvent } from 'aws-lambda';

jest.mock('../../../src/services/inviteMatching/pendingInviteService');
jest.mock('../../../src/services/inviteMatching/decisionToken');
jest.mock('../../../src/lib/dynamodb', () => ({
  docClient: { send: jest.fn() },
  getTableName: () => 'TestTable',
}));

const baseEvent = {
  headers: {},
  queryStringParameters: null,
  multiValueHeaders: {},
  multiValueQueryStringParameters: null,
  isBase64Encoded: false,
  stageVariables: null,
  requestContext: {
    accountId: '123456789012',
    apiId: 'test-api',
    protocol: 'HTTP/1.1',
    httpMethod: 'POST',
    path: '',
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
    resourcePath: '',
  },
} as const;

const createDeclineEvent = (): APIGatewayProxyEvent =>
  ({
    ...baseEvent,
    httpMethod: 'POST',
    path: '/pending-invitations/invite-1/decline',
    resource: '/pending-invitations/{inviteId}/decline',
    pathParameters: { inviteId: 'invite-1' },
    body: JSON.stringify({ decisionToken: 'token', reason: 'Not now' }),
  }) as APIGatewayProxyEvent;

const createDeclineAllEvent = (): APIGatewayProxyEvent =>
  ({
    ...baseEvent,
    httpMethod: 'POST',
    path: '/pending-invitations/decline-all',
    resource: '/pending-invitations/decline-all',
    pathParameters: null,
    body: JSON.stringify({ decisionToken: 'token', reason: 'Create my own family' }),
  }) as APIGatewayProxyEvent;

describe('Decline pending invites', () => {
  beforeEach(() => {
    process.env['AWS_SAM_LOCAL'] = 'true';
    jest.clearAllMocks();
  });

  it('declines a single invite', async () => {
    (verifyDecisionToken as jest.Mock).mockReturnValue(true);
    (getPendingInvitationList as jest.Mock).mockResolvedValue({
      invites: [
        {
          inviteId: 'invite-1',
          familyId: 'family-1',
          familyName: 'Family One',
          inviterName: 'Host One',
          roleOffered: 'admin',
          expiresAt: new Date().toISOString(),
          status: 'PENDING',
        },
      ],
      decisionToken: 'token',
    });

    const result = await handler(createDeclineEvent(), { awsRequestId: 'req-1' } as any);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.data.action).toBe('DECLINED');
    expect(docClient.send).toHaveBeenCalledTimes(1);
  });

  it('declines all invites', async () => {
    (verifyDecisionToken as jest.Mock).mockReturnValue(true);
    (getPendingInvitationList as jest.Mock).mockResolvedValue({
      invites: [
        {
          inviteId: 'invite-1',
          familyId: 'family-1',
          familyName: 'Family One',
          inviterName: 'Host One',
          roleOffered: 'admin',
          expiresAt: new Date().toISOString(),
          status: 'PENDING',
        },
        {
          inviteId: 'invite-2',
          familyId: 'family-2',
          familyName: 'Family Two',
          inviterName: 'Host Two',
          roleOffered: 'admin',
          expiresAt: new Date().toISOString(),
          status: 'PENDING',
        },
      ],
      decisionToken: 'token',
    });

    const result = await handler(createDeclineAllEvent(), { awsRequestId: 'req-2' } as any);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.data.inviteId).toBe('all');
    expect(docClient.send).toHaveBeenCalledTimes(2);
  });
});
