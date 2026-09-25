import { useCallback, useRef, useState } from 'react';
import {
  classifyDecisionFailure,
  type DecisionErrorPolicy,
  type DecisionFailure,
} from './decision-errors';

/**
 * CHAY MOT QUYET DINH TRUC TUYEN — chan bam doi, dem lan gui, phan loai that bai.
 *
 * `busy` giu trong REF chu khong chi trong state: hai lan cham lien tiep den TRUOC khi React ve lai,
 * va neu chi doc state thi ca hai deu thay `busy === false`. `attempts` biet day co phai lan GUI LAI
 * khong — mot so ma chi nghia "da xong" khi la lan gui lai (xem `FUEL_POLICY`).
 *
 * Mot lan that bai `RETRY` KHONG dong to truot va KHONG doi khoa: nguoi goi giu nguyen khoa trong
 * state cua chinh to truot, nen lan bam ke tiep la phat lai lenh cu.
 */
export interface DecisionRunner {
  readonly busy: boolean;
  readonly failure: DecisionFailure | null;
  run<T>(
    send: () => Promise<T>,
    handlers: {
      readonly onSuccess: (result: T) => void;
      readonly onAlreadyDone: (failure: DecisionFailure) => void;
      /** Goi TRUOC khi gui (vd go muc khoi hang cho); tra ve ham hoan tac khi that bai. */
      readonly optimistic?: () => () => void;
      /** That bai CO phan loai (`RETRY`/`REFUSED`) — vd doc lai ho so khi bi nguoi khac quyet truoc. */
      readonly onFailure?: (failure: DecisionFailure) => void;
    },
  ): Promise<void>;
  reset(): void;
}

export function useDecision(policy: DecisionErrorPolicy): DecisionRunner {
  const busyRef = useRef(false);
  const attemptsRef = useRef(0);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<DecisionFailure | null>(null);

  const reset = useCallback(() => {
    attemptsRef.current = 0;
    setFailure(null);
  }, []);

  const run = useCallback<DecisionRunner['run']>(
    async (send, handlers) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setFailure(null);
      const rollback = handlers.optimistic?.();
      const isRetry = attemptsRef.current > 0;
      attemptsRef.current += 1;
      try {
        const result = await send();
        attemptsRef.current = 0;
        handlers.onSuccess(result);
      } catch (error) {
        const classified = classifyDecisionFailure(error, policy, isRetry);
        if (classified.kind === 'ALREADY_DONE') {
          attemptsRef.current = 0;
          handlers.onAlreadyDone(classified);
        } else {
          rollback?.();
          setFailure(classified);
          handlers.onFailure?.(classified);
        }
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [policy],
  );

  return { busy, failure, run, reset };
}
