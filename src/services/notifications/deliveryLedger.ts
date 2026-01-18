/**
 * Delivery ledger utilities to mark/send status per notification/channel/frequency
 */
import { docClient, getTableName } from '../../lib/dynamodb';
import { UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

const TABLE_NAME = getTableName();

export function ledgerKey(channel: string, frequency: string) {
  return `${channel}:${frequency}`;
}

export async function markDelivered(familyId: string, notificationId: string, channel: string, frequency: string, sentAt?: string) {
  const key = ledgerKey(channel, frequency);
  const now = sentAt || new Date().toISOString();

  const params: any = {
    TableName: TABLE_NAME,
    Key: { PK: `FAMILY#${familyId}`, SK: `NOTIFICATION#${notificationId}` },
    UpdateExpression: 'SET deliveryLedger.#key = :entry, updatedAt = :now',
    ExpressionAttributeNames: { '#key': key },
    ExpressionAttributeValues: { ':entry': { lastSentAt: now }, ':now': now },
    // ReturnValues typing in @aws-sdk/lib-dynamodb can be strict; cast to any for flexibility here
    ReturnValues: 'ALL_NEW' as any,
  };

  const res = await docClient.send(new UpdateCommand(params as any));
  return (res as any).Attributes;
}

export async function hasBeenSentRecently(familyId: string, notificationId: string, channel: string, frequency: string, windowMs: number) {
  const key = ledgerKey(channel, frequency);
  // Read the notification item and inspect deliveryLedger for the given channel/frequency
  try {
    const res = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `FAMILY#${familyId}`, SK: `NOTIFICATION#${notificationId}` },
      } as any)
    );

    const item: any = (res as any).Item;
    if (!item || !item['deliveryLedger'] || !item['deliveryLedger'][key]) return false;

    const lastSentAt = item['deliveryLedger'][key].lastSentAt as string | undefined;
    if (!lastSentAt) return false;

    const lastMs = Date.parse(lastSentAt);
    if (Number.isNaN(lastMs)) return false;

    const now = Date.now();
    return now - lastMs <= windowMs;
  } catch (err) {
    // On error, conservatively return false (not recently sent)
    return false;
  }
}

export default { ledgerKey, markDelivered, hasBeenSentRecently };
