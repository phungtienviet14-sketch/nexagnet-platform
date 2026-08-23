import { SAMPLE_DOCUMENTS } from '../fixtures/documents';
import type { DocumentItem } from './types';

export interface DocumentAnalysisClient {
  getDocuments(): Promise<readonly DocumentItem[]>;
  getDocumentById(id: string): Promise<DocumentItem | undefined>;
  uploadDocument(file: { name: string; size: string; type: 'contract' | 'invoice' | 'sop' | 'report' }): Promise<DocumentItem>;
}

export class DemoDocumentAnalysisClient implements DocumentAnalysisClient {
  private documents: DocumentItem[] = [...SAMPLE_DOCUMENTS];

  async getDocuments(): Promise<readonly DocumentItem[]> {
    return [...this.documents];
  }

  async getDocumentById(id: string): Promise<DocumentItem | undefined> {
    return this.documents.find((doc) => doc.id === id);
  }

  async uploadDocument(file: {
    name: string;
    size: string;
    type: 'contract' | 'invoice' | 'sop' | 'report';
  }): Promise<DocumentItem> {
    const isContract = file.type === 'contract' || file.name.toLowerCase().includes('hd') || file.name.toLowerCase().includes('hop dong');
    const isInvoice = file.type === 'invoice' || file.name.toLowerCase().includes('vat') || file.name.toLowerCase().includes('hoa don');

    const newDoc: DocumentItem = {
      id: `doc-${Date.now()}`,
      title: file.name,
      type: file.type,
      uploadedAt: 'Vừa tải lên',
      fileSize: file.size,
      status: 'analyzed',
      mode: isContract ? 'contract_review' : isInvoice ? 'invoice_extraction' : 'general',
      analysis: isContract
        ? {
            metadata: {
              'Tên văn bản': file.name,
              'Phân loại': 'Hợp đồng thương mại đối tác',
              'Trạng thái rà soát': 'Hoàn thành bóc tách điều khoản',
              'Thời gian phân tích': '1.2s',
            },
            keyClausesOrItems: [
              {
                name: 'Điều khoản thời hạn thanh toán',
                value: 'Thanh toán đợt theo biên bản nghiệm thu từng giai đoạn (Net-30).',
                riskLevel: 'safe',
                note: 'Phù hợp với chính sách quản trị tín dụng chuẩn.',
              },
              {
                name: 'Điều khoản bảo mật và quyền sở hữu trí tuệ',
                value: 'Bảo lưu quyền tác giả và công nghệ lõi thuộc về bên cung cấp giải pháp.',
                riskLevel: 'safe',
                note: 'Đã được xác lập rõ ràng theo biểu mẫu tiêu chuẩn.',
              },
            ],
            complianceFindings: [
              {
                rule: 'Tuân thủ Quy chế Pháp chế nội bộ',
                result: 'pass',
                detail: 'Không phát hiện điều khoản phạt vi phạm vượt quá trần quy định 8%.',
              },
            ],
            provenance: 'AI Kế toán & Pháp chế bóc tách tự động qua Document Analysis Pipeline.',
            confidence: 97.4,
          }
        : {
            metadata: {
              'Tên chứng từ': file.name,
              'Phân loại': 'Chứng từ kế toán & hóa đơn',
              'Trạng thái xử lý': 'Đã hoàn tất trích xuất trường dữ liệu',
              'Độ chính xác OCR': '98.9%',
            },
            keyClausesOrItems: [
              {
                name: 'Đối chiếu thông tin doanh nghiệp',
                value: 'Mã số thuế và tên pháp nhân hợp lệ trên cổng thông tin Tổng cục Thuế.',
                riskLevel: 'safe',
                note: 'Khớp dữ liệu danh bạ khách hàng.',
              },
            ],
            complianceFindings: [
              {
                rule: 'Kiểm tra tính hợp lệ của chứng từ điện tử',
                result: 'pass',
                detail: 'Chứng từ có đầy đủ chữ ký số và trường dữ liệu bắt buộc.',
              },
            ],
            provenance: 'Trích xuất tự động bằng mô hình AI OCR & Validation Engine.',
            confidence: 98.9,
          },
    };

    this.documents.unshift(newDoc);
    return newDoc;
  }
}
