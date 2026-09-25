import NetInfo from '@react-native-community/netinfo';
import type { OutboxAttachment, OutboxItem } from '@netviet/driver-outbox';
import { useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { PwaUpdatePrompt } from '../pwa/PwaUpdatePrompt';
import { useSession } from '../session/SessionProvider';
import { sweepAttachments } from './attachments';
import type { FieldAction } from './field-actions';
import {
  createOutboxRuntime,
  referencedAttachmentUris,
  type OutboxRuntime,
} from './outbox-runtime';
import { OutboxRunner, type RunnerState } from './runner';
import type { SentEntry } from './sqlite-outbox-store';

/**
 * HANG DOI tren giao dien: xep viec, xa khi co ly do, va noi thang BA con so ma lai xe can
 * (con cho gui, KHONG gui duoc, lan cuoi noi duoc may chu). Nguoi dung THAY duoc tung viec — ca
 * viec da gui (so nho) — vi "no len chua?" la cau hoi lai xe hoi nhieu nhat khi mat song.
 */
export interface OutboxSnapshot extends RunnerState {
  readonly online: boolean;
  readonly ready: boolean;
}

interface OutboxApi extends OutboxSnapshot {
  enqueue(action: FieldAction, options?: EnqueueOptions): Promise<OutboxItem>;
  syncNow(): Promise<void>;
  listPending(): Promise<readonly OutboxItem[]>;
  listBlocked(): Promise<readonly OutboxItem[]>;
  listSent(): Promise<readonly SentEntry[]>;
  requeue(id: string): Promise<void>;
  discard(id: string): Promise<void>;
  /** Tang moi khi hang doi doi — de man hinh doc lai danh sach. */
  readonly revision: number;
}

export interface EnqueueOptions {
  /** Sinh MOT lan luc bam va giu qua moi lan thu (bam doi = cung khoa = mot hang). */
  readonly clientEventId?: string;
  readonly capturedAt?: string;
  readonly attachments?: readonly OutboxAttachment[];
}

const EMPTY: OutboxSnapshot = {
  pending: 0,
  blocked: 0,
  lastAttemptAt: null,
  lastError: null,
  running: false,
  paused: false,
  online: true,
  ready: false,
};

const OutboxContext = createContext<OutboxApi | null>(null);
const PERIODIC_MS = 20_000;

export function OutboxProvider({ children }: { readonly children: ReactNode }) {
  const { session, http, status } = useSession();
  const queryClient = useQueryClient();
  const [snapshot, setSnapshot] = useState<OutboxSnapshot>(EMPTY);
  const [revision, setRevision] = useState(0);
  const runtimeRef = useRef<OutboxRuntime | null>(null);
  const runnerRef = useRef<OutboxRunner | null>(null);
  const onlineRef = useRef(true);

  useEffect(() => {
    if (status !== 'signedIn' || !session || !http) {
      runtimeRef.current = null;
      runnerRef.current = null;
      setSnapshot(EMPTY);
      return;
    }
    let cancelled = false;
    void createOutboxRuntime(session, http).then(
      (runtime) => {
        if (cancelled) return;
        runtimeRef.current = runtime;
        const runner = new OutboxRunner(runtime.engine, (state) => {
          setSnapshot({ ...state, online: onlineRef.current, ready: true });
          setRevision((value) => value + 1);
          // Viec vua len may chu lam doi du lieu doc (moc moi, phieu moi) — doc lai.
          if (!state.running) void queryClient.invalidateQueries({ queryKey: ['me'] });
        });
        runnerRef.current = runner;
        void runner.kick();
      },
      // Kho tren may khong mo duoc (trinh duyet chan luu tru o che do rieng tu): giu `ready: false`
      // — `enqueue` noi thang "chưa sẵn sàng" — va ghi ly do, khong de Promise bi tu choi lang le.
      (error: unknown) => {
        if (cancelled) return;
        const reason = error instanceof Error ? error.message : 'Không mở được bộ nhớ trên máy';
        setSnapshot({ ...EMPTY, lastError: reason });
      },
    );
    return () => {
      cancelled = true;
    };
    // Tao lai khi DOI phien (nguoi khac dang nhap / token moi), khong phai moi lan render.
  }, [status, session?.token, session?.user.id, http, queryClient]);

  const syncNow = useCallback(async () => {
    const runner = runnerRef.current;
    if (!runner) return;
    runner.resume();
    await runner.kick();
    const runtime = runtimeRef.current;
    // Web: Promise (IndexedDB), khong bao gio nem; native: dong bo.
    if (runtime) void sweepAttachments(await referencedAttachmentUris());
  }, []);

  // Web (PWA): NetInfo doc `navigator.onLine` + su kien online/offline va do `HEAD /` cung origin;
  // AppState cua react-native-web theo `visibilitychange` — cung mot noi day cho ca ba nen tang.
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = state.isConnected !== false && state.isInternetReachable !== false;
      const cameBack = online && !onlineRef.current;
      onlineRef.current = online;
      setSnapshot((previous) => ({ ...previous, online }));
      if (cameBack) void runnerRef.current?.kick();
    });
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') void runnerRef.current?.kick();
    });
    const timer = setInterval(() => {
      if (AppState.currentState === 'active' && onlineRef.current) void runnerRef.current?.kick();
    }, PERIODIC_MS);
    return () => {
      unsubscribe();
      appState.remove();
      clearInterval(timer);
    };
  }, []);

  const enqueue = useCallback(async (action: FieldAction, options: EnqueueOptions = {}) => {
    const runtime = runtimeRef.current;
    if (!runtime) throw new Error('Hàng đợi trên máy chưa sẵn sàng — thử lại sau vài giây.');
    const item = await runtime.engine.enqueue({
      clientEventId: options.clientEventId ?? randomUUID(),
      kind: 'PROOF',
      capturedAt: options.capturedAt ?? new Date().toISOString(),
      payload: action as unknown as Record<string, unknown>,
      attachments: options.attachments,
    });
    setRevision((value) => value + 1);
    void runnerRef.current?.kick();
    return item;
  }, []);

  const api = useMemo<OutboxApi>(
    () => ({
      ...snapshot,
      revision,
      enqueue,
      syncNow,
      listPending: async () => runtimeRef.current?.store.listPending() ?? [],
      listBlocked: async () => runtimeRef.current?.store.listBlocked() ?? [],
      listSent: async () => runtimeRef.current?.store.listSent() ?? [],
      requeue: async (id) => {
        await runtimeRef.current?.store.requeue(id, new Date());
        setRevision((value) => value + 1);
        void runnerRef.current?.kick();
      },
      discard: async (id) => {
        await runtimeRef.current?.store.discard(id);
        setRevision((value) => value + 1);
        await runnerRef.current?.publish();
      },
    }),
    [snapshot, revision, enqueue, syncNow],
  );

  return (
    <OutboxContext.Provider value={api}>
      {children}
      {/* PWA: hoi cap nhat, doi hang doi gui xong luot dang chay. Native: khong ve gi. */}
      <PwaUpdatePrompt busy={snapshot.running} />
    </OutboxContext.Provider>
  );
}

export function useOutbox(): OutboxApi {
  const value = useContext(OutboxContext);
  if (!value) throw new Error('useOutbox phai nam trong OutboxProvider');
  return value;
}
