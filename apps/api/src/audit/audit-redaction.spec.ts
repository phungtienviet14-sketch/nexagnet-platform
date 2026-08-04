import { describe, expect, it } from 'vitest';
import { AUDIT_REDACTED, redactAuditValue } from './audit-redaction.js';

describe('redactAuditValue', () => {
  it('redacts credentials, raw messages, phone numbers and addresses recursively', () => {
    const input = {
      accessToken: 'token-value',
      nested: {
        customerPhone: '0912345678',
        customer_address: '123 Nguyen Trai, Ha Noi',
        rawMessage: 'gui hang ve 123 Nguyen Trai',
        safe: 'active',
      },
      rows: [{ cookie: 'session=value' }, { quantity: 2 }],
    };

    expect(redactAuditValue(input)).toEqual({
      accessToken: AUDIT_REDACTED,
      nested: {
        customerPhone: AUDIT_REDACTED,
        customer_address: AUDIT_REDACTED,
        rawMessage: AUDIT_REDACTED,
        safe: 'active',
      },
      rows: [{ cookie: AUDIT_REDACTED }, { quantity: 2 }],
    });
  });

  it('does not mutate the input value', () => {
    const input = { nested: { password: 'secret', safe: 'value' } };

    redactAuditValue(input);

    expect(input).toEqual({ nested: { password: 'secret', safe: 'value' } });
  });

  it('redacts common credential and PII key variants conservatively', () => {
    expect(
      redactAuditValue({
        token: 'secret-token',
        clientSecret: 'secret-value',
        secret_key: 'secret-key',
        recipientAddress: 'Ha Noi',
        recipientPhoneNumber: '0912345678',
        externalUserId: 'zalo-user-123',
        senderExternalId: 'zalo-sender-456',
      }),
    ).toEqual({
      token: AUDIT_REDACTED,
      clientSecret: AUDIT_REDACTED,
      secret_key: AUDIT_REDACTED,
      recipientAddress: AUDIT_REDACTED,
      recipientPhoneNumber: AUDIT_REDACTED,
      externalUserId: AUDIT_REDACTED,
      senderExternalId: AUDIT_REDACTED,
    });
  });
});
