/**
 * BE MAT API DUOC PHEP CHAM VAO — khai bao bang tay, co chu dich.
 *
 * Tep nay KHONG phai mot ban `@types/chrome` rut gon cho tien. No la mot RANH GIOI: `checkJs` cua
 * TypeScript se bao loi neu ma nguon dung mot API khong khai o day, nen "them mot loi goi" va
 * "mo rong be mat da duyet" tro thanh cung mot hanh dong, nhin thay duoc trong diff.
 *
 * Co bai kiem hop dong (`tests/input-only-contract.test.mjs`) doi hoi tep nay KHONG khai bat ky
 * duong nao doc duoc kho banh quy, luu luong mang, lich su duyet, trinh go loi, anh chup man hinh,
 * hay noi dung cua mot nut trong trang.
 */

/** Phan tu DOM ma bo noi khung soan duoc cham vao. Khong co truong nao doc duoc NOI DUNG. */
interface BridgeElement {
  readonly isContentEditable?: boolean;
  readonly disabled?: boolean;
  value?: string;
  focus(): void;
  click(): void;
  dispatchEvent(event: unknown): boolean;
  closest(selector: string): BridgeElement | null;
  querySelectorAll(selector: string): ArrayLike<BridgeElement>;
}

interface BridgeDocument {
  querySelectorAll(selector: string): ArrayLike<BridgeElement>;
  execCommand(command: string, showUi?: boolean, value?: string): boolean;
}

declare var document: BridgeDocument | undefined;
declare var location: { href: string } | undefined;
declare class Event {
  constructor(type: string, init?: { bubbles?: boolean });
}

declare namespace chrome {
  namespace runtime {
    interface Port {
      onMessage: { addListener(listener: (message: unknown) => void): void };
      onDisconnect: { addListener(listener: () => void): void };
      postMessage(message: unknown): void;
      disconnect(): void;
    }
    function connectNative(application: string): Port;
    const lastError: { message?: string } | undefined;
    const onStartup: { addListener(listener: () => void): void };
    const onInstalled: { addListener(listener: () => void): void };
  }
  namespace storage {
    interface Area {
      get(keys: string | string[]): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
    }
    const local: Area;
  }
  namespace scripting {
    function executeScript(injection: {
      target: { tabId: number };
      world?: 'ISOLATED';
      func: (...args: never[]) => unknown;
      args?: unknown[];
    }): Promise<Array<{ result?: unknown }>>;
  }
  namespace tabs {
    function query(info: { url: string }): Promise<Array<{ id?: number; url?: string }>>;
  }
  namespace permissions {
    function request(permissions: { origins: string[] }): Promise<boolean>;
    function contains(permissions: { origins: string[] }): Promise<boolean>;
    function remove(permissions: { origins: string[] }): Promise<boolean>;
  }
}
