/**
 * Integration Tests: Pending Invite Handler
 */

import { handler } from '../../../src/handlers/invitations/pendingInvite';
import { getPendingInvitationList } from '../../../src/services/inviteMatching/pendingInviteService';
import type { APIGatewayProxyEvent } from 'aws-lambda';

jest.mock('../../../src/services/inviteMatching/pendingInviteService');

const createMockEvent = (): APIGatewayProxyEvent =>
  ({
    httpMethod: 'GET',
    path: '/pending-invitations',
    headers: {},
    body: null,
    pathParameters: null,
    queryStringParameters: null,
    multiValueHeaders: {},
    multiValueQueryStringParameters: null,
    isBase64Encoded: false,
    resource: '/pending-invitations',
    stageVariables: null,
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      protocol: 'HTTP/1.1',
      httpMethod: 'GET',
      path: '/pending-invitations',
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
      resourcePath: '/pending-invitations',
    },
  }) as APIGatewayProxyEvent;

describe('Pending Invite Handler', () => {
  beforeEach(() => {
    process.env['AWS_SAM_LOCAL'] = 'true';
    jest.clearAllMocks();
  });

  it('returns pending invitations when available', async () => {
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

    const result = await handler(createMockEvent(), {} as any);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.data.invites).toHaveLength(1);
    expect(body.data.decisionToken).toBe('token');
  });

  it('returns empty list when no invites found', async () => {
    (getPendingInvitationList as jest.Mock).mockResolvedValue({
      invites: [],
      decisionToken: 'token',
    });

    const result = await handler(createMockEvent(), {} as any);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.data.invites).toEqual([]);
  });
});
