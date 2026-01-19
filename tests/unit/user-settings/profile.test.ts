import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { handler as getProfile } from '../../../src/handlers/user-settings/getProfile';
import { handler as updateProfile } from '../../../src/handlers/user-settings/updateProfile';
import { MemberModel } from '../../../src/models/member';
import { getUserContext } from '../../../src/lib/auth';

jest.mock('../../../src/models/member', () => ({
  MemberModel: {
    getByMemberId: jest.fn(),
    getById: jest.fn(),
    update: jest.fn(),
  },
}));

jest.mock('../../../src/lib/auth', () => ({
  getUserContext: jest.fn(),
}));

jest.mock('../../../src/services/auditLogService', () => ({
  recordAuditEvent: jest.fn(),
}));

const baseContext = { awsRequestId: 'req-4' } as Context;

const getEvent = (): APIGatewayProxyEvent =>
  ({
    httpMethod: 'GET',
    path: '/user-settings/me',
    headers: {},
  } as APIGatewayProxyEvent);

const patchEvent = (body?: unknown): APIGatewayProxyEvent =>
  ({
    httpMethod: 'PATCH',
    path: '/user-settings/profile',
    body: body ? JSON.stringify(body) : null,
    headers: {},
  } as APIGatewayProxyEvent);

describe('user settings profile handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 403 when profile is missing', async () => {
    (getUserContext as jest.Mock).mockReturnValue({ memberId: 'm1' });
    (MemberModel.getByMemberId as jest.Mock).mockResolvedValue(null);

    const result = await getProfile(getEvent(), baseContext);
    expect(result.statusCode).toBe(403);
  });

  it('returns 400 on invalid update payload', async () => {
    (getUserContext as jest.Mock).mockReturnValue({ memberId: 'm1' });

    const result = await updateProfile(patchEvent({ displayName: '' }), baseContext);
    expect(result.statusCode).toBe(400);
  });
});
