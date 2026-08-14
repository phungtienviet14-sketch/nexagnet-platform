import type { PrismaClient } from '@prisma/client';
import type { ActionContext, ActionRequest, ActionResponse, ResourceWithOptions } from 'adminjs';
import { refreshKnowledge } from './knowledge-refresh.js';
import { recordSourceTruthAudit } from '../audit/source-truth-audit.js';

/**
 * Cau hinh 6 resource "Nguon su that" cho AdminJS (auto CRUD list/filter/create/edit/delete qua
 * @adminjs/prisma). KHONG tu viet CRUD — chi khai bao. Diem tuy bien duy nhat:
 *   - Group: action "Map toi dai ly" (record) + mac dinh loc status=pending ("hop thu nhom chua map").
 *   - Moi thay doi ghi (new/edit/delete + map) -> refreshKnowledge() nap lai snapshot pipeline dang doc.
 */

/** @adminjs/prisma: lay model tu DMMF theo ten (PascalCase nhu trong schema.prisma). */
type GetModelByName = (name: string, clientModule?: unknown) => object;

const NAV = { name: 'Nguồn sự thật', icon: 'Database' } as const;

function writeHooks(prisma: PrismaClient, entityType: string) {
  const afterWrite =
    (action: string) =>
    async (
      response: ActionResponse,
      request: ActionRequest,
      context: ActionContext,
    ): Promise<ActionResponse> => {
      const record = response.record as
        { id?: string; params?: Record<string, unknown> } | undefined;
      const admin = context.currentAdmin as { email?: string } | undefined;
      await recordSourceTruthAudit(prisma, {
        actor: admin?.email ?? 'adminjs',
        action: `source_truth.${action}`,
        entityType,
        entityId: record?.id ?? null,
        after: action === 'delete' ? null : (record?.params ?? request.payload ?? null),
      });
      await refreshKnowledge();
      return response;
    };
  return {
    new: { after: afterWrite('create') },
    edit: { after: afterWrite('update') },
    delete: { after: afterWrite('delete') },
  };
}

function stripGroupIdentityFields(request: ActionRequest): ActionRequest {
  const payload = request.payload as Record<string, unknown> | undefined;
  if (!payload) return request;
  const { chatId: _chatId, globalId: _globalId, platform: _platform, ...editable } = payload;
  return { ...request, payload: editable };
}

export function buildKnowledgeResources(
  prisma: PrismaClient,
  getModelByName: GetModelByName,
): ResourceWithOptions[] {
  const res = (model: string): { model: object; client: PrismaClient } => ({
    model: getModelByName(model),
    client: prisma,
  });

  return [
    {
      resource: res('Dealer'),
      options: {
        navigation: NAV,
        listProperties: ['code', 'name', 'tier', 'defaultPolicy', 'phone'],
        editProperties: ['code', 'name', 'aliases', 'tier', 'defaultPolicy', 'phone'],
        actions: { ...writeHooks(prisma, 'Dealer') },
      },
    },
    {
      resource: res('Product'),
      options: {
        navigation: NAV,
        listProperties: ['sku', 'name', 'unit'],
        actions: { ...writeHooks(prisma, 'Product') },
      },
    },
    {
      resource: res('PricePeriod'),
      options: {
        navigation: NAV,
        listProperties: ['validMonth', 'status', 'source', 'activatedAt', 'updatedAt'],
        actions: {
          new: { isAccessible: false },
          edit: { isAccessible: false },
          delete: { isAccessible: false },
        },
      },
    },
    {
      resource: res('Price'),
      options: {
        navigation: NAV,
        listProperties: [
          'periodId',
          'sku',
          'wholesale',
          'minRetailPrice',
          'retailPrice',
          'listPrice',
          'updatedAt',
        ],
        actions: {
          new: { isAccessible: false },
          edit: { isAccessible: false },
          delete: { isAccessible: false },
        },
      },
    },
    {
      resource: res('DealerPriceOverride'),
      options: {
        navigation: NAV,
        listProperties: ['dealerId', 'sku', 'price'],
        actions: { ...writeHooks(prisma, 'DealerPriceOverride') },
      },
    },
    {
      resource: res('GlossaryEntry'),
      options: {
        navigation: NAV,
        listProperties: ['term', 'meaning'],
        actions: { ...writeHooks(prisma, 'GlossaryEntry') },
      },
    },
    {
      resource: res('Group'),
      options: {
        navigation: NAV,
        listProperties: [
          'chatId',
          'globalId',
          'name',
          'branch',
          'status',
          'dealerId',
          'lastSeenAt',
        ],
        editProperties: ['name', 'branch', 'status', 'dealerId'],
        filterProperties: ['status', 'platform', 'dealerId', 'branch'],
        sort: { sortBy: 'lastSeenAt', direction: 'desc' },
        actions: {
          ...writeHooks(prisma, 'Group'),
          new: { isAccessible: false },
          delete: { isAccessible: false },
          edit: {
            before: stripGroupIdentityFields,
            after: writeHooks(prisma, 'Group').edit.after,
          },
          // Mac dinh mo "hop thu nhom chua map": chua co filter nao -> loc status=pending.
          list: {
            before: async (request: ActionRequest): Promise<ActionRequest> => {
              const query = (request.query ?? {}) as Record<string, string>;
              const hasFilter = Object.keys(query).some((key) => key.startsWith('filters.'));
              if (hasFilter) return request;
              return { ...request, query: { ...query, 'filters.status': 'pending' } };
            },
          },
          // Action tuy bien (record): gan nhom -> dai ly + danh dau da map. component:false = khong React.
          // "Chon" dai ly: sua truong dealer (AdminJS render dropdown quan he san) roi bam Map; hoac
          // truyen ?dealerId=... khi goi. Sau do refreshKnowledge() de pipeline thay ngay.
          mapToDealer: {
            actionType: 'record',
            icon: 'Link',
            guard: 'Gán nhóm này cho đại lý đã chọn và đánh dấu đã map?',
            component: false,
            handler: async (
              request: ActionRequest,
              _response: unknown,
              context: ActionContext,
            ): Promise<ActionResponse> => {
              const { record, currentAdmin } = context;
              if (!record) throw new Error('Không tìm thấy bản ghi Group.');
              const payload = (request.payload ?? {}) as Record<string, unknown>;
              const query = (request.query ?? {}) as Record<string, unknown>;
              const dealerId =
                (payload.dealerId as string | undefined) ??
                (query.dealerId as string | undefined) ??
                (record.get('dealerId') as string | undefined);
              if (!dealerId) {
                return {
                  record: record.toJSON(currentAdmin),
                  notice: {
                    message: 'Chọn đại lý (sửa trường "dealer") trước, rồi bấm Map tới đại lý.',
                    type: 'error',
                  },
                };
              }
              await record.update({ dealerId, status: 'mapped' });
              await recordSourceTruthAudit(prisma, {
                actor: (currentAdmin as { email?: string } | undefined)?.email ?? 'adminjs',
                action: 'source_truth.group.map',
                entityType: 'Group',
                entityId: String(record.id()),
                after: { dealerId, status: 'mapped' },
              });
              await refreshKnowledge();
              return {
                record: record.toJSON(currentAdmin),
                notice: {
                  message: 'Đã map nhóm tới đại lý và làm mới nguồn sự thật.',
                  type: 'success',
                },
              };
            },
          },
        },
      },
    },
  ];
}
