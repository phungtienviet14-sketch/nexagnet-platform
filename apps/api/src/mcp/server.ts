import { PrismaClient } from '@prisma/client';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  addGlossary,
  addGlossaryInput,
  listDealers,
  listGroups,
  listGroupsInput,
  listProducts,
  listUnmappedGroups,
  mapGroup,
  mapGroupInput,
  setPrice,
  setPriceInput,
  type ToolResult,
  upsertDealer,
  upsertDealerInput,
} from './source-of-truth.tools.js';
import { recordSourceTruthAudit } from '../audit/source-truth-audit.js';
import {
  canUseFact,
  canUseFactInput,
  factAddressInput,
  getEffectiveFact,
  getFactHistory,
  getSource,
  getSourceInput,
  listConflicts,
  listSources,
  listSourcesInput,
} from './source-registry.tools.js';
import { PrismaSourceRegistryRepository } from '../source-registry/prisma-source-registry.repository.js';
import { SourceReadinessService } from '../source-registry/source-readiness.service.js';
import { SourceRegistryService } from '../source-registry/source-registry.service.js';
import { trustedTenantScope } from '../source-registry/tenant-scope.js';

/**
 * MCP stdio server: phoi "Nguon su that" (Postgres) ra thanh tool cho Claude/agent sua bang
 * hoi thoai. La TIEN TRINH RIENG (khong nam trong NestJS) — tu tao PrismaClient (doc DATABASE_URL).
 * Chay: `pnpm --filter @netviet/api mcp` (tsx src/mcp/server.ts).
 *
 * QUAN TRONG: stdout la KENH GIAO THUC JSON-RPC — MOI log phai ra STDERR, khong ra stdout.
 */

const prisma = new PrismaClient();

// Log ra stderr (stdout danh cho JSON-RPC).
function log(message: string): void {
  process.stderr.write(`[netviet-mcp] ${message}\n`);
}

// Nice-to-have: goi API dang chay nap lai snapshot in-memory sau khi ghi (DB da ghi xong roi;
// fetch loi -> bo qua). MCP la tien trinh rieng nen khong goi truc tiep KnowledgeService.reload().
const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3001';
async function bestEffortReload(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE_URL}/knowledge/reload`, { method: 'POST' });
    if (res.ok) log(`Đã gọi ${API_BASE_URL}/knowledge/reload (API nạp lại nguồn sự thật).`);
  } catch {
    // API khong chay/khong voi toi -> bo qua (ghi DB da hoan tat, day chi la dong bo song).
  }
}

async function auditMcpWrite(
  action: string,
  entityType: string,
  entityId: string,
  after: unknown,
): Promise<void> {
  await recordSourceTruthAudit(prisma, {
    actor: 'mcp-agent',
    action,
    entityType,
    entityId,
    after,
  });
}

/** Boc ket qua logic thanh noi dung tool MCP; isError=true khi that bai. */
function toToolContent(result: ToolResult): {
  content: { type: 'text'; text: string }[];
  isError: boolean;
} {
  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    isError: result.ok === false,
  };
}

const READ_ONLY = { readOnlyHint: true } as const;
const WRITE_HINTS = { readOnlyHint: false, destructiveHint: false, idempotentHint: true } as const;

const server = new McpServer({ name: 'netviet-source-of-truth', version: '0.1.0' });

// ----- READ tools -----
server.registerTool(
  'list_products',
  {
    description: 'Liệt kê danh mục sản phẩm kèm giá sỉ (Đơn giá CTV) và giá bán lẻ tham chiếu.',
    annotations: READ_ONLY,
  },
  async () => toToolContent(await listProducts(prisma)),
);

server.registerTool(
  'list_dealers',
  {
    description: 'Liệt kê đại lý/CTV (cấp + chính sách công nợ mặc định).',
    annotations: READ_ONLY,
  },
  async () => toToolContent(await listDealers(prisma)),
);

server.registerTool(
  'list_groups',
  {
    description: 'Liệt kê nhóm Zalo (tuỳ chọn lọc theo status: pending | mapped | ignored).',
    inputSchema: listGroupsInput.shape,
    annotations: READ_ONLY,
  },
  async (args) => toToolContent(await listGroups(prisma, args)),
);

server.registerTool(
  'list_unmapped_groups',
  {
    description: 'Hộp thư "nhóm chưa map" (status=pending) — nhóm mới thấy, chưa gán đại lý.',
    annotations: READ_ONLY,
  },
  async () => toToolContent(await listUnmappedGroups(prisma)),
);

// ----- READ tools: QUAN TRI NGUON SU THAT -----
//
// Tam tool tren tra loi "hang nguon su that dang co gi". Nam tool duoi tra loi cau KHAC HAN:
// "so lieu do tu dau ra, ai duyet, va con gi dang tranh chap".
//
// CHI DOC — co y. Cong ghi cua tang nay (duyet nguon, dong xung dot) doi mot NGUOI CO THAM QUYEN
// va mot DAN CHUNG; mot phien agent khong cung cap duoc hai thu do mot cach trung thuc, va mo
// chung ra o day la tao dung con duong ma ca tang do sinh ra de chan.
const registryRepository = new PrismaSourceRegistryRepository(prisma);
const sourceRegistry = new SourceRegistryService(registryRepository);
const sourceReadiness = new SourceReadinessService(registryRepository);
// Pham vi khach doc tu CAU HINH TRIEN KHAI, khong tu doi so cua tool.
const registryScope = trustedTenantScope();

server.registerTool(
  'list_sources',
  {
    description:
      'Liệt kê nguồn sự thật đã đăng ký (tuỳ chọn lọc theo status: RECEIVED | NORMALIZED | REVIEWED | APPROVED | EFFECTIVE | SUPERSEDED | REJECTED | QUARANTINED).',
    inputSchema: listSourcesInput.shape,
    annotations: READ_ONLY,
  },
  async (args) => toToolContent(await listSources(sourceRegistry, registryScope, args)),
);

server.registerTool(
  'get_source',
  {
    description: 'Chi tiết một nguồn: phiên bản, nguồn gốc, thẩm quyền, phân loại, hash, hiệu lực.',
    inputSchema: getSourceInput.shape,
    annotations: READ_ONLY,
  },
  async (args) => toToolContent(await getSource(sourceRegistry, registryScope, args)),
);

server.registerTool(
  'list_conflicts',
  {
    description:
      'Liệt kê xung đột giữa các sự thật cạnh tranh. Xung đột OPEN là thứ đang chặn — không được tự chọn bên thắng.',
    annotations: READ_ONLY,
  },
  async () => toToolContent(await listConflicts(sourceRegistry, registryScope)),
);

server.registerTool(
  'get_effective_fact',
  {
    description:
      'Bản đang hiệu lực tại một địa chỉ (domain + key). Không bao giờ rơi về bản đã bị thay thế.',
    inputSchema: factAddressInput.shape,
    annotations: READ_ONLY,
  },
  async (args) => toToolContent(await getEffectiveFact(sourceReadiness, registryScope, args)),
);

server.registerTool(
  'get_fact_history',
  {
    description: 'Toàn bộ các bản tại một địa chỉ, kể cả bản đã SUPERSEDED/REJECTED.',
    inputSchema: factAddressInput.shape,
    annotations: READ_ONLY,
  },
  async (args) => toToolContent(await getFactHistory(sourceReadiness, registryScope, args)),
);

server.registerTool(
  'can_use_fact',
  {
    description:
      'Hỏi TRƯỚC khi trả lời: số liệu này dùng được cho việc này không? Trả về mã lý do khi không — "đang có xung đột chưa chốt" khác hẳn "chưa ai duyệt" và khác "đây mới là giả định".',
    inputSchema: canUseFactInput.shape,
    annotations: READ_ONLY,
  },
  async (args) => toToolContent(await canUseFact(sourceReadiness, registryScope, args)),
);

// ----- WRITE tools -----
server.registerTool(
  'upsert_dealer',
  {
    description: 'Thêm/cập nhật đại lý theo id (name, aliases, tier, defaultPolicy, phone?).',
    inputSchema: upsertDealerInput.shape,
    annotations: WRITE_HINTS,
  },
  async (args) => {
    const result = await upsertDealer(prisma, args);
    if (result.ok) {
      await auditMcpWrite('source_truth.dealer.upsert', 'Dealer', args.id, result);
      await bestEffortReload();
    }
    return toToolContent(result);
  },
);

server.registerTool(
  'map_group',
  {
    description:
      'Gán 1 nhóm Zalo (chatId) cho đại lý (dealerId) và đặt status=mapped. Kiểm tra đại lý tồn tại.',
    inputSchema: mapGroupInput.shape,
    annotations: WRITE_HINTS,
  },
  async (args) => {
    const result = await mapGroup(prisma, args);
    if (result.ok) {
      await auditMcpWrite('source_truth.group.map', 'Group', args.chatId, result);
      await bestEffortReload();
    }
    return toToolContent(result);
  },
);

server.registerTool(
  'set_price',
  {
    description:
      'Cập nhật NHÁP bảng giá cho 1 SKU (wholesale + validMonth bắt buộc; không tự kích hoạt). Kiểm tra SKU tồn tại.',
    inputSchema: setPriceInput.shape,
    annotations: WRITE_HINTS,
  },
  async (args) => {
    const result = await setPrice(prisma, args);
    if (result.ok) {
      await auditMcpWrite('source_truth.price.update', 'Price', args.sku, result);
      await bestEffortReload();
    }
    return toToolContent(result);
  },
);

server.registerTool(
  'add_glossary',
  {
    description: 'Thêm/cập nhật 1 mục glossary (term viết tắt -> meaning). Upsert theo term.',
    inputSchema: addGlossaryInput.shape,
    annotations: WRITE_HINTS,
  },
  async (args) => {
    const result = await addGlossary(prisma, args);
    if (result.ok) {
      await auditMcpWrite('source_truth.glossary.upsert', 'GlossaryEntry', args.term, result);
      await bestEffortReload();
    }
    return toToolContent(result);
  },
);

// ----- Vong doi -----
let shuttingDown = false;
async function shutdown(code = 0): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await prisma.$disconnect();
  } catch {
    // bo qua loi disconnect khi tat.
  }
  process.exit(code);
}

process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));

const transport = new StdioServerTransport();
transport.onclose = () => void shutdown(0); // client dong stdin -> tat sach.

await server.connect(transport);
log('MCP stdio server sẵn sàng (netviet-source-of-truth): 8 tool nguồn sự thật + 6 tool CHỈ ĐỌC quản trị nguồn.');
