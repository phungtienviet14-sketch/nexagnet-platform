import { randomUUID } from 'node:crypto';
import type {
  AdviceContentView,
  ContentAssetView,
  ContentLinkView,
  ContentProvenanceView,
  ContentReadinessView,
  ContentSnapshotView,
  FaqView,
} from '@netviet/shared';

export type ContentEntityKind = 'asset' | 'faq' | 'advice' | 'link';
export type ContentRecord = ContentAssetView | FaqView | AdviceContentView | ContentLinkView;

const EMPTY: ContentSnapshotView = {
  provenance: [],
  assets: [],
  faqs: [],
  advice: [],
  links: [],
  readiness: [],
};

export abstract class ContentRepository {
  abstract snapshot(): Promise<ContentSnapshotView>;
  abstract productSkus(): Promise<string[]>;
  abstract saveProvenance(value: ContentProvenanceView): Promise<void>;
  abstract upsert(kind: ContentEntityKind, value: ContentRecord): Promise<void>;
  abstract setStatus(
    kind: ContentEntityKind,
    id: string,
    status: ContentRecord['status'],
    operatorEdited: boolean,
  ): Promise<ContentRecord | null>;
  abstract setReadiness(value: ContentReadinessView): Promise<void>;
}

export class InMemoryContentRepository extends ContentRepository {
  private state: ContentSnapshotView;
  private readonly knownProductSkus: string[];

  constructor(initial: Partial<ContentSnapshotView> = {}, knownProductSkus?: string[]) {
    super();
    this.state = clone({ ...EMPTY, ...initial });
    this.knownProductSkus =
      knownProductSkus ??
      Array.from(
        new Set([
          ...this.state.assets.flatMap((asset) => asset.productSkus),
          ...this.state.faqs.flatMap((faq) => (faq.productSku ? [faq.productSku] : [])),
          ...this.state.advice.flatMap((item) => (item.productSku ? [item.productSku] : [])),
          ...this.state.links.flatMap((link) => (link.productSku ? [link.productSku] : [])),
        ]),
      );
  }

  async snapshot(): Promise<ContentSnapshotView> {
    return clone(this.state);
  }

  async productSkus(): Promise<string[]> {
    return [...this.knownProductSkus];
  }

  async saveProvenance(value: ContentProvenanceView): Promise<void> {
    const rows = this.state.provenance.filter((item) => item.id !== value.id);
    this.state = { ...this.state, provenance: [...rows, clone(value)] };
  }

  async upsert(kind: ContentEntityKind, value: ContentRecord): Promise<void> {
    const key = collectionKey(kind);
    const current = this.state[key] as ContentRecord[];
    const next = [...current.filter((item) => item.id !== value.id), clone(value)];
    this.state = { ...this.state, [key]: next };
  }

  async setStatus(
    kind: ContentEntityKind,
    id: string,
    status: ContentRecord['status'],
    operatorEdited: boolean,
  ): Promise<ContentRecord | null> {
    const key = collectionKey(kind);
    const current = this.state[key] as ContentRecord[];
    const found = current.find((item) => item.id === id);
    if (!found) return null;
    const updated = { ...found, status, operatorEdited } as ContentRecord;
    this.state = {
      ...this.state,
      [key]: current.map((item) => (item.id === id ? updated : item)),
    };
    return clone(updated);
  }

  async setReadiness(value: ContentReadinessView): Promise<void> {
    const key = value.productSku ?? '__global__';
    this.state = {
      ...this.state,
      readiness: [
        ...this.state.readiness.filter((item) => (item.productSku ?? '__global__') !== key),
        clone(value),
      ],
    };
  }
}

export function importedId(
  kind: ContentEntityKind,
  provenanceKey: string,
  externalId: string,
): string {
  return `${kind}:${provenanceKey}:${externalId}`;
}

export function operatorId(kind: ContentEntityKind): string {
  return `${kind}:operator:${randomUUID()}`;
}

function collectionKey(kind: ContentEntityKind): 'assets' | 'faqs' | 'advice' | 'links' {
  return kind === 'asset'
    ? 'assets'
    : kind === 'faq'
      ? 'faqs'
      : kind === 'advice'
        ? 'advice'
        : 'links';
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
