import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { STORE, openOutboxIdb } from './idb';
import { IdbOutboxStore, referencedUrisIn } from './idb-outbox-store';
import { contractItem, describeOutboxStoreContract } from './outbox-store.contract';

/**
 * KHO CUA PWA chay DUNG bo hop dong cua kho SQLite, tren `fake-indexeddb` (cai dat IndexedDB theo
 * dac ta, qua bo kiem web-platform-tests). Moi bai mot `IDBFactory` moi — khong bai nao thay du
 * lieu cua bai khac.
 */
async function freshDb(): Promise<IDBDatabase> {
  const factory = new IDBFactory();
  // Mo hai lan: nang cap chi chay o lan dau, lan sau mo lai khong hong (ung dung mo moi lan chay).
  (await openOutboxIdb(factory)).close();
  return openOutboxIdb(factory);
}

describeOutboxStoreContract('IdbOutboxStore (IndexedDB)', async () => {
  const db = await freshDb();
  return (scope, now) => new IdbOutboxStore(db, scope, now);
});

describe('IdbOutboxStore — rieng IndexedDB', () => {
  it('tep dinh kem duoc tham chieu boi MOI pham vi deu tinh (don tep khong xoa nham)', async () => {
    const db = await freshDb();
    const mine = new IdbOutboxStore(db, 'https://a.vn|user-1');
    const theirs = new IdbOutboxStore(db, 'https://a.vn|user-2');
    const photo = (uri: string) => [
      { uri, contentType: 'image/jpeg', captureMode: 'GALLERY' as const },
    ];
    await mine.append(contractItem({ id: 'a', clientEventId: 'a', attachments: photo('idb://1') }));
    await theirs.append(
      contractItem({ id: 'b', clientEventId: 'b', attachments: photo('idb://2') }),
    );

    expect([...(await referencedUrisIn(db))].sort()).toEqual(['idb://1', 'idb://2']);
  });

  it('du lieu nam o kho ben: mo lai co so (tai lai trang) van con hang', async () => {
    const factory = new IDBFactory();
    const first = await openOutboxIdb(factory);
    await new IdbOutboxStore(first, 's').append(contractItem({ id: 'r1', clientEventId: 'e1' }));
    first.close();

    const reopened = await openOutboxIdb(factory);
    expect(await new IdbOutboxStore(reopened, 's').countByState()).toEqual({
      pending: 1,
      blocked: 0,
    });
    expect(Array.from(reopened.objectStoreNames).sort()).toEqual(Object.values(STORE).sort());
  });
});
