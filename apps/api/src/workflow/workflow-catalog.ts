import { INTEGRATION_HANDOFF_KEY, SALES_HANDOFF_FOLLOWUP_KEY } from './workflow-registry.js';

/**
 * DANH BA NGUOI-DOC cua khuon workflow — anh xa DANH TINH KY THUAT sang NGON NGU NGHIEP VU.
 *
 * ---------------------------------------------------------------------------
 * VI SAO CO TEP NAY, va vi sao no KHONG nam trong `workflow-registry.ts`:
 *
 * Danh ba khuon tra loi cau "engine phai chay cai gi": khoa on dinh, phien ban, hop dong dau
 * vao. Tep nay tra loi mot cau khac han: "con nguoi dang nhin thay cai gi". Hai cau do doi lech
 * nhau — them mot nhan tieng Viet KHONG duoc phep dung toi hop dong dau vao, va doi mot hop dong
 * dau vao khong nhat thiet doi cai ten nguoi ta doc.
 *
 * Gop chung se de mot nguoi sua ten hien thi tien tay sua luon khoa engine dinh tuyen. Do khong
 * phai gia thuyet: khoa la thu nam trong `actionId`, va doi no la lam mo coi moi run dang cho.
 *
 * ---------------------------------------------------------------------------
 * RANH GIOI NGON NGU (quy tac cua ca Debug Control Plane, khong rieng tep nay):
 *
 *   THU CON NGUOI NHIN     -> tieng Viet. `displayName`, `description`, `label`.
 *   HOP DONG / DINH DANH   -> giu nguyen. `key`, ten buoc, `operationKey`, `engineRunId`.
 *
 * Nen o day KHOA VA NHAN nam canh nhau trong cung mot ban ghi, va console hien ca hai. Nguoi
 * dung hieu nghiep vu tu cai thu nhat; nguoi debug tra cuu engine bang cai thu hai.
 *
 * ---------------------------------------------------------------------------
 * GIOI HAN DA BIET CUA ENGINE (do duoc tren `@hatchet-dev/typescript-sdk` 1.28.2):
 *
 *   workflow  `CreateBaseWorkflowOpts` co `name` + `description`.
 *   buoc      `CreateBaseTaskOpts` chi co `name`. KHONG co `description`, khong co `displayName`.
 *
 * Nghia la dashboard cua engine KHONG hien duoc nhan tieng Viet cho tung buoc — no chi co chuoi
 * may. Do chinh la ly do danh ba nay ton tai o phia Nexagnet thay vi duoc day sang engine.
 */

export interface WorkflowStepDescription {
  /** KHOA MAY — dung y nguyen ten buoc ma worker dang ky voi engine. Khong dich. */
  readonly key: string;
  /** Nhan nguoi doc. Bang chinh `key` khi buoc chua duoc khai — khong bao gio rong. */
  readonly label: string;
  readonly description: string;
}

export interface WorkflowDescription {
  /** KHOA MAY on dinh (`sales-handoff-followup`). Khong bao gio dich, khong bao gio doi. */
  readonly key: string;
  readonly displayName: string;
  readonly description: string;
  /** Theo DUNG thu tu chay, khong phai thu tu bang chu cai. */
  readonly steps: readonly WorkflowStepDescription[];
  /**
   * `false` = ban dang chay co mot khuon ma danh ba nay chua biet.
   *
   * Noi goi PHAI phan biet duoc voi `true`: mot cai ten tieng Viet bia ra cho khuon la con te
   * hon mot chuoi may, vi no doc len nghe nhu that.
   */
  readonly known: boolean;
}

/** Mot muc trong danh ba, truoc khi gan `key`/`known`. */
interface CatalogEntry {
  readonly displayName: string;
  readonly description: string;
  readonly steps: readonly WorkflowStepDescription[];
}

/**
 * `integration-handoff` — khuon NEN TANG TRUNG TINH.
 *
 * Ten hien thi noi ve CO CHE ("ban giao sang he ngoai"), khong noi ve mot he cu the: cung khuon
 * nay phuc vu ERP, CRM va webhook, va goi khach moi la cho quyet dinh dich den that.
 */
const INTEGRATION_HANDOFF: CatalogEntry = {
  displayName: 'Bàn giao sang hệ ngoài',
  description:
    'Đưa một tham chiếu thực thể sang hệ thống bên ngoài do khách cấu hình, một cách bền vững ' +
    'và có khoá chống trùng. Nếu hệ ngoài lỗi hoặc không trả lời, việc được thử lại chứ không mất.',
  steps: [
    {
      key: 'resolve',
      label: 'Tra đích đến',
      description:
        'Đổi tên đích đến logic thành địa chỉ thật lấy từ cấu hình hạ tầng. Không thử lại: ' +
        'thiếu cấu hình thì lần sau vẫn thiếu.',
    },
    {
      key: 'preflight',
      label: 'Hỏi trước khi ghi',
      description:
        'Chỉ có ở v2. Hỏi hệ ngoài xem việc này đã được ghi chưa — dùng cho hệ ngoài tra cứu ' +
        'được nhưng không nhận khoá chống trùng.',
    },
    {
      key: 'dispatch',
      label: 'Gửi sang hệ ngoài',
      description:
        'Bước duy nhất có tác dụng ra bên ngoài. Gửi kèm khoá thao tác để hệ ngoài tự chặn trùng.',
    },
    {
      key: 'settle',
      label: 'Chốt kết quả',
      description:
        'Ghi lại mã tham chiếu bên hệ ngoài và dấu vân tay phiên bản mã đã chạy, để sau này ' +
        'đối soát được.',
    },
  ],
};

/**
 * `sales-handoff-followup` — khuon NGHIEP VU dau tien.
 *
 * Ten buoc `wait` la khoa may THAT ma worker dang ky (`hatchet-workflow-worker.adapter.ts`),
 * khong phai `durable-wait`. Danh ba phai bam theo cai CO THAT, khong bam theo cai de doc — neu
 * khong thi tra cuu tren dashboard engine se khong ra.
 */
const SALES_HANDOFF_FOLLOWUP: CatalogEntry = {
  displayName: 'Nhắc Sale sau bàn giao',
  description:
    'Sau khi một việc được bàn giao cho người thật, chờ đến hạn rồi đọc lại trạng thái. ' +
    'Nếu việc vẫn còn treo thì đánh dấu là cần nhắc; nếu người đã xử lý xong trong lúc chờ ' +
    'thì kết thúc im lặng, không làm phiền.',
  steps: [
    {
      key: 'load-state',
      label: 'Đọc trạng thái bàn giao',
      description:
        'Đọc trạng thái mới nhất từ nguồn sự thật nghiệp vụ và tính xem còn phải chờ bao lâu. ' +
        'Chạy TRƯỚC lúc chờ, vì việc có thể đã được xử lý ngay khi vừa xếp hàng.',
    },
    {
      key: 'wait',
      label: 'Chờ đến hạn nhắc',
      description:
        'Lần chờ bền vững do engine giữ lịch. Worker khởi động lại, máy chủ deploy lại đều ' +
        'không làm mất lần chờ này — khác hẳn một hẹn giờ nằm trong tiến trình.',
    },
    {
      key: 'recheck-mark',
      label: 'Kiểm tra lại và đánh dấu nhắc',
      description:
        'Đọc lại trạng thái một lần nữa rồi mới đánh dấu. Đây là chỗ con người "thắng" quy ' +
        'trình: đã xử lý xong trong lúc chờ thì không nhắc nữa.',
    },
  ],
};

/**
 * Danh ba theo KHOA MAY.
 *
 * Xuat ra de bai kiem quet duoc toan bo, va de mot khuon moi them vao day la mot thay doi
 * NHIN THAY DUOC trong diff chu khong phai mot dong lot vao giua mot ham.
 */
export const WORKFLOW_CATALOG: Readonly<Record<string, CatalogEntry>> = {
  [INTEGRATION_HANDOFF_KEY]: INTEGRATION_HANDOFF,
  [SALES_HANDOFF_FOLLOWUP_KEY]: SALES_HANDOFF_FOLLOWUP,
};

/**
 * Metadata nguoi-doc cua mot khuon. KHONG NEM voi khoa la — khac han `workflowTemplate()`.
 *
 * Ly do hai ham xu ly khoa la khac nhau: `workflowTemplate()` quyet dinh code nao CHAY, nen mot
 * khoa la o do la loi phai lo ra ngay. Ham nay chi quyet dinh nguoi ta DOC THAY gi, va lam sap
 * mot man hinh chan doan vi thieu mot nhan la doi nguoc uu tien — dung luc can nhin nhat thi
 * khong con gi de nhin.
 */
export function describeWorkflow(key: string): WorkflowDescription {
  const entry = WORKFLOW_CATALOG[key];
  if (!entry) {
    return { key, displayName: key, description: '', steps: [], known: false };
  }
  return { key, ...entry, known: true };
}

/**
 * Metadata cua MOT buoc. Buoc chua khai -> lay chinh khoa may lam nhan.
 *
 * KHONG doan mot ban dich: mot buoc moi ten `recheck-mark-v2` ma tu dong thanh "Kiem tra lai v2"
 * se doc len nhu that trong khi khong ai viet cau do.
 */
export function describeWorkflowStep(
  workflowKey: string,
  stepKey: string,
): WorkflowStepDescription {
  const found = WORKFLOW_CATALOG[workflowKey]?.steps.find((step) => step.key === stepKey);
  return found ?? { key: stepKey, label: stepKey, description: '' };
}
