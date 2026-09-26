import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { attemptFor, type CommandAttempt } from '../../api/command-attempt';
import { useOutbox } from '../../outbox/OutboxProvider';
import { useHttp } from '../../session/SessionProvider';
import { BEST_EFFORT_FIX_TIMEOUT_MS } from './field-commands';
import { captureFixWithin } from './fix-capture';
import {
  classifyIntakeFailure,
  classifyLoadFailure,
  confirmBody,
  confirmLocation,
  destinationBody,
  destinationIdentity,
  INITIAL_INTAKE_FLOW,
  intakeFlowReducer,
  locationFromFix,
  proposalBody,
  proposalPrimary,
  searchOutcome,
  searchQueryProblem,
  type DestinationRow,
  type IntakeFlowState,
  type SearchOutcome,
} from './site-intake-flow';
import type {
  DriverDestinationResponse,
  DriverIntakeView,
  PlaceSearchResponse,
  SiteIntakeProposal,
  SiteIntakeResult,
} from './types';

/**
 * NOI DAY cua man "Nhận chuyến" — goi may chu, giu KHOA cua tung lan thu, day su kien vao bo may
 * trang thai thuan (`site-intake-flow.ts`). Moi quyet dinh nam ben kia; o day chi co I/O.
 *
 * Hai khoa, moi khoa mot LENH: `clientEventId` cua lan nhan chuyen va cua lan chon diem giao. Khoa
 * sinh luc bam lan dau cho MOT noi dung, giu qua moi lan bam lai sau loi mang, va chi bo khi may chu
 * da nhan (`attemptFor`). Tat ca TRUC TUYEN — khong mot dong nao vao hang doi ngoai tuyen.
 */
const BASE = '/transport/me/site-intake';

export interface DestinationSearch {
  readonly busy: boolean;
  readonly problem: string | null;
  readonly outcome: SearchOutcome | null;
}

const NO_SEARCH: DestinationSearch = { busy: false, problem: null, outcome: null };

export function useSiteIntakeFlow(resumeIntakeId: string | null) {
  const http = useHttp();
  const httpRef = useRef(http);
  const { online } = useOutbox();
  const [state, dispatch] = useReducer(intakeFlowReducer, INITIAL_INTAKE_FLOW);
  const [search, setSearch] = useState<DestinationSearch>(NO_SEARCH);
  const stateRef = useRef<IntakeFlowState>(state);
  const onlineRef = useRef(online);
  const busyRef = useRef(false);
  const generation = useRef(0);
  const confirmAttempt = useRef<CommandAttempt | null>(null);
  const destinationAttempt = useRef<CommandAttempt | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    onlineRef.current = online;
  }, [online]);
  // Phien lam moi (xac minh nen) doi `http` — KHONG duoc khoi dong lai buoc dang lam.
  useEffect(() => {
    httpRef.current = http;
  }, [http]);

  /** Doc mang -> (doc lai viec | vi tri -> de nghi). Lan chay cu bi bo neu nguoi dung da thu lai. */
  const locate = useCallback(async () => {
    const run = ++generation.current;
    const current = () => run === generation.current;
    dispatch({ type: 'LOCATE' });
    setSearch(NO_SEARCH);
    if (!onlineRef.current) {
      dispatch({ type: 'OFFLINE' });
      return;
    }
    try {
      if (resumeIntakeId) {
        const intake = await httpRef.current.get<DriverIntakeView>(
          `${BASE}/${encodeURIComponent(resumeIntakeId)}`,
        );
        if (current()) dispatch({ type: 'RESUMED', intake });
        return;
      }
      const fix = await captureFixWithin(BEST_EFFORT_FIX_TIMEOUT_MS);
      const { captured, note } = locationFromFix(fix, Date.now());
      if (!current()) return;
      const proposal = await httpRef.current.post<SiteIntakeProposal>(
        `${BASE}/proposals`,
        proposalBody(captured, Date.now()),
      );
      if (current()) dispatch({ type: 'PROPOSAL_LOADED', proposal, captured, locationNote: note });
    } catch (error) {
      if (!current()) return;
      const failure = classifyLoadFailure(error);
      dispatch(
        failure.offline ? { type: 'OFFLINE' } : { type: 'LOAD_FAILED', message: failure.message },
      );
    }
  }, [resumeIntakeId]);

  // MOT lan khi vao man (man duoc go khi roi di, va duoc `key` theo `intakeId`).
  useEffect(() => {
    void locate();
  }, [locate]);

  /** Chay MOT lenh ghi: chan bam doi, kiem mang truoc, phan loai that bai. */
  const send = useCallback(async (work: () => Promise<void>, onError: (error: unknown) => void) => {
    if (busyRef.current) return;
    if (!onlineRef.current) {
      dispatch({ type: 'OFFLINE' });
      return;
    }
    busyRef.current = true;
    dispatch({ type: 'SENDING' });
    try {
      await work();
    } catch (error) {
      onError(error);
    } finally {
      busyRef.current = false;
    }
  }, []);

  const confirm = useCallback(async () => {
    const snapshot = stateRef.current;
    const siteId = proposalPrimary(snapshot, true)?.siteId ?? null;
    if (siteId === null) return;
    await send(
      async () => {
        const attempt = attemptFor(confirmAttempt.current, siteId, randomUUID);
        confirmAttempt.current = attempt;
        // Ban chup luc mo man da cu (lai xe bam sau vai phut) -> chup lai truoc khi gui; khong co
        // ban moi thi gui KHONG toa do (`confirmLocation`). Tuoi tinh dung luc gui.
        const captured = await confirmLocation(
          snapshot.captured,
          () => captureFixWithin(BEST_EFFORT_FIX_TIMEOUT_MS),
          () => Date.now(),
        );
        const result = await httpRef.current.post<SiteIntakeResult>(
          `${BASE}/confirmations`,
          confirmBody(siteId, attempt.key, captured, Date.now()),
        );
        confirmAttempt.current = null;
        dispatch({ type: 'CONFIRMED', result });
      },
      (error) => dispatch({ type: 'FAILED', failure: classifyIntakeFailure(error, 'CONFIRM') }),
    );
  }, [send]);

  const submitDestination = useCallback(async () => {
    const { pick, received } = stateRef.current;
    if (pick === null || received === null) return;
    await send(
      async () => {
        const attempt = attemptFor(
          destinationAttempt.current,
          destinationIdentity(pick.choice),
          randomUUID,
        );
        destinationAttempt.current = attempt;
        const response = await httpRef.current.post<DriverDestinationResponse>(
          `${BASE}/${encodeURIComponent(received.intakeId)}/destination`,
          destinationBody(attempt.key, pick.choice),
        );
        destinationAttempt.current = null;
        dispatch({ type: 'DESTINATION_SAVED', response });
      },
      (error) => dispatch({ type: 'FAILED', failure: classifyIntakeFailure(error, 'DESTINATION') }),
    );
  }, [send]);

  /** Tim theo ten — chi DOC. Chuoi gui di duoc giu trong ket qua de may chu doi chieu lai. */
  const runSearch = useCallback(async (query: string) => {
    const problem = searchQueryProblem(query);
    if (problem !== null) {
      setSearch({ busy: false, problem, outcome: null });
      return;
    }
    setSearch({ busy: true, problem: null, outcome: null });
    try {
      const response = await httpRef.current.post<PlaceSearchResponse>(
        `${BASE}/destinations/search`,
        {
          query: query.trim(),
        },
      );
      setSearch({ busy: false, problem: null, outcome: searchOutcome(response, query) });
    } catch (error) {
      setSearch({ busy: false, problem: classifyLoadFailure(error).message, outcome: null });
    }
  }, []);

  return {
    state,
    search,
    locate,
    confirm,
    submitDestination,
    runSearch,
    chooseSite: (siteId: string) => dispatch({ type: 'CHOOSE_SITE', siteId }),
    openPicker: () => dispatch({ type: 'OPEN_PICKER' }),
    closePicker: () => dispatch({ type: 'CLOSE_PICKER' }),
    pick: (row: DestinationRow | null) => dispatch({ type: 'PICK', row }),
    unknownDestination: () => dispatch({ type: 'DESTINATION_UNKNOWN' }),
  };
}

export type SiteIntakeFlow = ReturnType<typeof useSiteIntakeFlow>;
