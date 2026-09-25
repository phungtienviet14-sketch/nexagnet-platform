import type { OutboxEngine, SyncStatus } from '@netviet/driver-outbox';
import { PAUSE_UNAUTHENTICATED } from './field-actions';

/**
 * NGUOI CHAY HANG DOI — goi `drain()` khi co ly do (vua xep viec, co mang lai, mo ung dung, dinh ky)
 * va bao dam HAI dieu ma may chu doi:
 *
 *   · MOT luong xa hang tai mot thoi diem. Hai lan xa song song cung mot `clientEventId` dua nhau
 *     tren chi muc UNIQUE phia may chu va lo ra 500 (do tren ma `tracking.service.ts`).
 *   · Het phien (401) thi DUNG — khong xa tiep, khong chan viec nao. Dang nhap lai thi `resume()`.
 *
 * Viec BAM (PROOF) xa truoc ban dinh vi nen (OBSERVATION): mot moc "Đã giao" quan trong hon mot
 * diem tren duong di.
 */
export interface RunnerState extends SyncStatus {
  readonly running: boolean;
  readonly paused: boolean;
}

export class OutboxRunner {
  private inFlight: Promise<void> | null = null;
  private again = false;
  private paused = false;

  constructor(
    private readonly engine: Pick<OutboxEngine, 'drain' | 'status'>,
    private readonly onChange: (state: RunnerState) => void,
    private readonly maxRounds = 20,
  ) {}

  get isPaused(): boolean {
    return this.paused;
  }

  resume(): void {
    this.paused = false;
  }

  /** Yeu cau xa. Neu dang xa, danh dau "xa them mot vong" thay vi mo luong thu hai. */
  kick(): Promise<void> {
    if (this.inFlight) {
      this.again = true;
      return this.inFlight;
    }
    this.inFlight = this.loop().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  async publish(): Promise<void> {
    const status = await this.engine.status();
    this.onChange({ ...status, running: this.inFlight !== null, paused: this.paused });
  }

  private async loop(): Promise<void> {
    await this.publish();
    let rounds = 0;
    do {
      this.again = false;
      if (this.paused) break;
      const proofs = await this.engine.drain('PROOF');
      if (await this.pausedByAuth()) break;
      const points = await this.engine.drain('OBSERVATION');
      if (await this.pausedByAuth()) break;
      rounds += 1;
      if (proofs + points === 0 && !this.again) break;
    } while (rounds < this.maxRounds);
    this.inFlight = null;
    await this.publish();
  }

  private async pausedByAuth(): Promise<boolean> {
    const status = await this.engine.status();
    if (status.lastError === PAUSE_UNAUTHENTICATED) this.paused = true;
    return this.paused;
  }
}
