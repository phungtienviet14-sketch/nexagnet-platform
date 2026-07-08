import { describe, expect, it } from 'vitest';
import { AGENT_ROLES, INTENT_LABELS, INTENT_TO_ROLE, ROLE_LABELS } from '../agents.js';
import { INTENTS } from '../order.js';

describe('agents metadata', () => {
  it('co du 6 vai va moi vai co nhan tieng Viet', () => {
    expect(AGENT_ROLES).toHaveLength(6);
    for (const role of AGENT_ROLES) {
      expect(ROLE_LABELS[role]?.length).toBeGreaterThan(0);
    }
  });

  it('INTENT_TO_ROLE phu du 7 intent va tro toi vai hop le', () => {
    for (const intent of INTENTS) {
      const role = INTENT_TO_ROLE[intent];
      expect(AGENT_ROLES).toContain(role);
      expect(INTENT_LABELS[intent]?.length).toBeGreaterThan(0);
    }
  });

  it('dat_don -> sales; bao_hanh -> after_sales; khac -> router', () => {
    expect(INTENT_TO_ROLE.dat_don).toBe('sales');
    expect(INTENT_TO_ROLE.bao_hanh_khieu_nai).toBe('after_sales');
    expect(INTENT_TO_ROLE.khac).toBe('router');
  });
});
