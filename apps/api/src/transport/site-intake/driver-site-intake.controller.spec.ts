import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import { DriverSiteIntakeController } from './driver-site-intake.controller.js';
import type { SiteIntakeCommercialService } from './site-intake-commercial.service.js';
import type { SiteIntakePlaceSearchBridge } from './site-intake-place-search.bridge.js';
import type { SiteIntakeReviewService } from './site-intake-review.service.js';
import type { SiteIntakeService } from './site-intake.service.js';
import type {
  ConfirmSiteIntakeCommand,
  ProposeSiteIntakeCommand,
  SiteIntakeProposal,
  SiteIntakeResult,
} from './site-intake.types.js';

/**
 * `#398` §3.1 — `locationAgeMs` PHAI toi duoc dich vu.
 *
 * Phep kiem tuoi nam o dich vu; controller chi chep truong. Quen chep MOT truong o day la lo hong
 * im lang nhat co the: than yeu cau van hop le, dich vu van chay, va moi cap toa do lai duoc coi
 * nhu "vua doc" — dung cai lo `#398` vua dong. Bai nay ghim ca hai tuyen, va ghim rang mot tuoi di
 * sai cho (kem `observationId`) dung o bien voi 400 truoc khi toi dich vu.
 */

const REQUEST = { authUser: { id: 'lai-xe-mot' } } as unknown as AuthenticatedRequest;
const POINT = { latitude: 20.8449, longitude: 106.6881, accuracyMetres: 10 };

function controllerRecording() {
  const proposed: ProposeSiteIntakeCommand[] = [];
  const confirmed: ConfirmSiteIntakeCommand[] = [];
  const intake = {
    propose: async (command: ProposeSiteIntakeCommand) => {
      proposed.push(command);
      return {} as SiteIntakeProposal;
    },
    confirm: async (command: ConfirmSiteIntakeCommand) => {
      confirmed.push(command);
      return {} as SiteIntakeResult;
    },
  } as unknown as SiteIntakeService;
  const controller = new DriverSiteIntakeController(
    intake,
    {} as SiteIntakeCommercialService,
    {} as SiteIntakeReviewService,
    {} as SiteIntakePlaceSearchBridge,
  );
  return { controller, proposed, confirmed };
}

describe('DriverSiteIntakeController — `locationAgeMs` (#398 §3.1)', () => {
  it('de nghi chep tuoi toi dich vu', async () => {
    const { controller, proposed } = controllerRecording();
    await controller.propose(REQUEST, { ...POINT, locationAgeMs: 600_000 });

    expect(proposed).toHaveLength(1);
    expect(proposed[0]?.locationAgeMs).toBe(600_000);
    expect(proposed[0]?.authUserId).toBe('lai-xe-mot');
  });

  it('xac nhan chep tuoi toi dich vu', async () => {
    const { controller, confirmed } = controllerRecording();
    await controller.confirm(REQUEST, {
      ...POINT,
      siteId: 'site-1',
      clientEventId: 'cham-mot',
      locationAgeMs: 5_000,
    });

    expect(confirmed[0]?.locationAgeMs).toBe(5_000);
  });

  /** May khach `#267` cu: khong co truong nao, va lenh KHONG mang mot `locationAgeMs: undefined`. */
  it('khong gui tuoi thi lenh khong co khoa tuoi', async () => {
    const { controller, proposed, confirmed } = controllerRecording();
    await controller.propose(REQUEST, POINT);
    await controller.confirm(REQUEST, { ...POINT, siteId: 'site-1', clientEventId: 'cham-mot' });

    expect('locationAgeMs' in (proposed[0] ?? {})).toBe(false);
    expect('locationAgeMs' in (confirmed[0] ?? {})).toBe(false);
  });

  it('tuoi di kem observationId -> 400, dich vu khong duoc goi', () => {
    const { controller, proposed, confirmed } = controllerRecording();

    // Hai tuyen kiem than DONG BO (truoc moi `await`), nen loi nem ngay luc goi.
    expect(() =>
      controller.propose(REQUEST, { observationId: 'obs-1', locationAgeMs: 5_000 }),
    ).toThrow(BadRequestException);
    expect(() =>
      controller.confirm(REQUEST, {
        siteId: 'site-1',
        clientEventId: 'cham-mot',
        observationId: 'obs-1',
        locationAgeMs: 5_000,
      }),
    ).toThrow(BadRequestException);

    expect(proposed).toEqual([]);
    expect(confirmed).toEqual([]);
  });

  it('tuoi am hoac khong nguyen -> 400', () => {
    const { controller } = controllerRecording();
    for (const locationAgeMs of [-1, 12.5]) {
      expect(() => controller.propose(REQUEST, { ...POINT, locationAgeMs })).toThrow(
        BadRequestException,
      );
    }
  });
});
