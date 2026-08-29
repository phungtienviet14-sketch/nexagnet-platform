import { defineDecisionVocabulary } from '../observability/decision-vocabulary.js';
import {
  APPROVAL_DENIED_REASONS,
  SOURCE_TRANSITION_DENIED_REASONS,
} from './source-lifecycle.js';
import { FACT_TRANSITION_DENIED_REASONS, FACT_USAGE_DENIED_REASONS } from './fact-lifecycle.js';
import { CONFLICT_RESOLUTION_DENIED_REASONS } from './conflict-lifecycle.js';
import { TENANT_SCOPE_DENIED_REASONS } from './tenant-scope.js';

/**
 * TU VUNG QUYET DINH cua tang NGUON SU THAT.
 *
 * Nam trong thu muc cua chinh mien, khong o `observability/`: nguon, su that, xung dot va gia dinh
 * la thuat ngu cua tang nay. `decision-vocabulary.spec.ts` khoa dieu do lai o phia nen tang.
 *
 * Ma o day tra loi nhung cau hoi ma doc log thuong khong tra loi duoc: "vi sao bang gia thang 8
 * chua co hieu luc?", "vi sao he thong khong chiu tra loi cau hoi gia nay?", "ai da chot cai xung
 * dot do va bang chung nao?".
 */

export const SOURCE_TRANSITION_REASONS = [
  'SOURCE_TRANSITION_ALLOWED',
  ...SOURCE_TRANSITION_DENIED_REASONS,
] as const;
export type SourceTransitionReason = (typeof SOURCE_TRANSITION_REASONS)[number];

export const SOURCE_APPROVAL_REASONS = ['APPROVAL_RECORDED', ...APPROVAL_DENIED_REASONS] as const;
export type SourceApprovalReason = (typeof SOURCE_APPROVAL_REASONS)[number];

export const FACT_TRANSITION_REASONS = [
  'FACT_TRANSITION_ALLOWED',
  ...FACT_TRANSITION_DENIED_REASONS,
] as const;
export type FactTransitionReason = (typeof FACT_TRANSITION_REASONS)[number];

export const FACT_USAGE_REASONS = ['FACT_USABLE', ...FACT_USAGE_DENIED_REASONS] as const;
export type FactUsageReason = (typeof FACT_USAGE_REASONS)[number];

export const CONFLICT_REASONS = [
  'CONFLICT_OPENED',
  'CONFLICT_RESOLUTION_RECORDED',
  ...CONFLICT_RESOLUTION_DENIED_REASONS,
] as const;
export type ConflictReason = (typeof CONFLICT_REASONS)[number];

export const TENANT_SCOPE_REASONS = [
  'TENANT_SCOPE_GRANTED',
  ...TENANT_SCOPE_DENIED_REASONS,
] as const;
export type TenantScopeReason = (typeof TENANT_SCOPE_REASONS)[number];

export type SourceRegistryDecisionReason =
  | SourceTransitionReason
  | SourceApprovalReason
  | FactTransitionReason
  | FactUsageReason
  | ConflictReason
  | TenantScopeReason;

export const SOURCE_REGISTRY_DECISIONS = defineDecisionVocabulary({
  owner: 'source-registry',
  points: [
    'source.transition',
    'source.approval',
    'fact.transition',
    'fact.usability',
    'conflict.resolution',
    'registry.tenant_scope',
  ],
  labels: {
    SOURCE_TRANSITION_ALLOWED: 'Cho phép chuyển trạng thái nguồn',
    SOURCE_ALREADY_TERMINAL: 'Nguồn đã ở điểm cuối (đã thay thế hoặc đã bác bỏ)',
    SOURCE_ALREADY_IN_STATE: 'Nguồn đã ở đúng trạng thái đó rồi',
    SOURCE_TRANSITION_NOT_PERMITTED: 'Máy trạng thái nguồn không có cạnh này — tải lên không phải là đã duyệt',
    SOURCE_APPROVAL_MISSING: 'Duyệt nguồn mà không có bản ghi phê duyệt tường minh',
    SOURCE_HASH_MISSING: 'Chưa đo SHA-256 nên không biết đang kích hoạt đúng bản nào',
    SOURCE_LOCATOR_MISSING: 'Không biết tệp gốc nằm ở đâu để kiểm chứng lại',
    SOURCE_EFFECTIVE_FROM_MISSING: 'Chưa đặt mốc hiệu lực — "có hiệu lực từ bao giờ" không trả lời được',
    SOURCE_SUPERSEDER_MISSING: 'Đánh dấu bị thay thế mà không chỉ ra bản nào thay',

    APPROVAL_RECORDED: 'Đã ghi nhận phê duyệt',
    APPROVAL_ORIGIN_NOT_CUSTOMER: 'Bản nội bộ/bản test không được đóng dấu khách xác nhận',
    APPROVAL_ACTOR_MISSING: 'Phê duyệt vô danh — không biết ai duyệt',
    APPROVAL_EVIDENCE_MISSING: 'Phê duyệt không kèm dẫn chứng',

    FACT_TRANSITION_ALLOWED: 'Cho phép chuyển trạng thái sự thật',
    FACT_ALREADY_TERMINAL: 'Sự thật đã ở điểm cuối',
    FACT_ALREADY_IN_STATE: 'Sự thật đã ở đúng trạng thái đó rồi',
    FACT_TRANSITION_NOT_PERMITTED: 'Máy trạng thái sự thật không có cạnh này',
    FACT_SOURCE_NOT_EFFECTIVE: 'Nguồn của sự thật này chưa có hiệu lực',
    FACT_APPROVAL_MISSING: 'Xác nhận sự thật mà không có phê duyệt tường minh',
    FACT_ASSUMPTION_NEEDS_CUSTOMER_CONFIRMATION:
      'Giả định làm việc chỉ thành sự thật khi khách xác nhận, không phải khi duyệt nội bộ',
    FACT_ASSUMPTION_EVIDENCE_MISSING: 'Giả định thiếu lý do / rủi ro / cách đảo ngược / chủ sở hữu',
    FACT_SUPERSEDER_MISSING: 'Đánh dấu bị thay thế mà không chỉ ra bản nào thay',

    FACT_USABLE: 'Sự thật dùng được cho việc đang hỏi',
    FACT_NOT_APPROVED: 'Mới là đề xuất, chưa ai duyệt',
    FACT_NO_LONGER_EFFECTIVE: 'Đã bị thay thế hoặc bác bỏ',
    FACT_OUTSIDE_EFFECTIVE_WINDOW: 'Ngoài cửa sổ hiệu lực tại thời điểm hỏi',
    FACT_BLOCKED_BY_OPEN_CONFLICT: 'Có xung đột đang mở chạm vào sự thật này — dừng an toàn',
    FACT_IS_WORKING_ASSUMPTION: 'Đây là giả định của chúng ta, việc này đòi sự thật đã xác nhận',

    CONFLICT_OPENED: 'Đã mở xung đột giữa các sự thật cạnh tranh',
    CONFLICT_RESOLUTION_RECORDED: 'Đã ghi nhận quyết định đóng xung đột',
    CONFLICT_ALREADY_TERMINAL: 'Xung đột đã đóng trước đó',
    CONFLICT_ACTOR_MISSING: 'Không biết ai chốt xung đột',
    CONFLICT_EVIDENCE_MISSING: 'Đóng xung đột mà không có dẫn chứng',
    CONFLICT_WINNER_MISSING: 'Chưa chỉ ra bên nào thắng',
    CONFLICT_WINNER_NOT_COMPETING: 'Bên được chọn không nằm trong các bên đang tranh chấp',

    TENANT_SCOPE_GRANTED: 'Truy cập đúng phạm vi khách của chính mình',
    TENANT_SCOPE_UNRESOLVED: 'Không xác định được đang phục vụ khách nào — đóng cổng',
    TENANT_SCOPE_CROSS_TENANT: 'Chạm vào dữ liệu của khách khác',
  } satisfies Record<SourceRegistryDecisionReason, string>,
});
