import type { DecisionFailure } from '../decision-errors';
import { Notice } from './Blocks';

/**
 * THAT BAI cua mot quyet dinh, noi theo VIEC phai lam: `RETRY` (xanh duong — bam lai, cung lenh) hay
 * `REFUSED` (do — ly do cua may chu, nguyen van). `ALREADY_DONE` khong den day: no la mot ket qua.
 */
export function FailureNotice({ failure }: { readonly failure: DecisionFailure | null }) {
  if (failure === null) return null;
  if (failure.kind === 'RETRY') {
    return (
      <Notice
        tone="pending"
        title="Chưa gửi được"
        detail={failure.message}
        testID="decision-retry-notice"
      />
    );
  }
  return (
    <Notice
      tone="danger"
      title="Máy chủ không nhận"
      detail={failure.message}
      testID="decision-refused-notice"
    />
  );
}
