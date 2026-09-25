/**
 * CAU NOI giua man goi va man MAY ANH — thuan, test tren Node.
 *
 * Man may anh la mot ROUTE rieng (toan man hinh, khong the tab), nen ket qua khong tra qua props.
 * Man goi `awaitCapture()` roi dieu huong sang; man may anh goi `deliverCapture(anh)` hoac
 * `deliverCapture(null)` khi dong. MOT yeu cau tai mot thoi diem: yeu cau moi huy yeu cau cu
 * (tra `null`) — khong bao gio de mot anh roi vao nham lan bam.
 */
export interface CapturedPhoto {
  readonly uri: string;
  readonly width: number;
  readonly height: number;
}

interface PendingCapture {
  readonly id: number;
  readonly resolve: (photo: CapturedPhoto | null) => void;
}

export class CaptureBridge {
  private pending: PendingCapture | null = null;
  private sequence = 0;

  /** Bat dau mot yeu cau; yeu cau dang treo (neu co) ket thuc bang `null`. */
  awaitCapture(): Promise<CapturedPhoto | null> {
    this.pending?.resolve(null);
    this.sequence += 1;
    const id = this.sequence;
    return new Promise((resolve) => {
      this.pending = { id, resolve };
    });
  }

  /** Man may anh co dang phuc vu mot yeu cau khong (mo thang route thi khong). */
  hasPending(): boolean {
    return this.pending !== null;
  }

  /** Giao ket qua (hoac `null` = huy). Goi lan hai la vo hai. */
  deliverCapture(photo: CapturedPhoto | null): void {
    const pending = this.pending;
    this.pending = null;
    pending?.resolve(photo);
  }
}

/** Mot cau noi cho ca ung dung — mot tien trinh JS, mot man may anh. */
export const captureBridge = new CaptureBridge();
