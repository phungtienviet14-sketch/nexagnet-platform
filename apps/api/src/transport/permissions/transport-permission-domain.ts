import { Injectable } from '@nestjs/common';
import type { PermissionDomain } from '../../auth/access/permission-domain.js';
import { PermissionDomainRegistry } from '../../auth/access/permission-domain.registry.js';
import { transportPermissionCatalog } from './transport-permission-catalog.js';
import {
  effectiveTransportActionList,
  escalatedActions,
  validateTransportGrants,
} from './transport-permission-rules.js';

/**
 * MIEN PHAN QUYEN `transport` — noi quy tac thuan (`transport-permission-rules.ts`) va danh muc
 * (`transport-permission-catalog.ts`) vao hop dong cua nen tang (`PermissionDomain`, `#395`).
 *
 * S0 chi co phan THUAN: danh muc, tap hieu luc, kiem bo quyen, quyen leo thang. Ba phan doc DU LIEU
 * lien ket (`checkAccessChange`, `describeScopes`, `reservedUsernames`) den o lat sau, khi co kho
 * lien ket ho so lai xe / ben gop von.
 */
export function transportPermissionDomain(): PermissionDomain {
  return {
    id: 'transport',
    catalog: transportPermissionCatalog,
    effective: effectiveTransportActionList,
    validate: validateTransportGrants,
    escalated: escalatedActions,
  };
}

/**
 * Dang ky mien `transport` vao so cua nen tang — trong HAM DUNG, nen xay ra luc Nest khoi tao
 * `TransportModule` (moi provider duoc khoi tao luc boot, ke ca khi khong ai tiem lop nay), khong
 * phu thuoc thu tu hook `onModuleInit`. Cung khuon `OperationalDocumentFileAuthorizer`.
 */
@Injectable()
export class TransportPermissionDomainRegistrar {
  constructor(registry: PermissionDomainRegistry) {
    registry.register(transportPermissionDomain());
  }
}
