'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useDocumentClient } from '../services/client-context';
import type { DocumentItem } from '../services/types';

interface DocumentsViewProps {
  readonly initialDocId?: string;
  readonly onSelectDoc: (id: string) => void;
  readonly onNavigateToAlert?: (alertId: string) => void;
}

export function DocumentsView({
  initialDocId,
  onSelectDoc,
  onNavigateToAlert,
}: DocumentsViewProps) {
  const documentClient = useDocumentClient();
  const [documents, setDocuments] = useState<readonly DocumentItem[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | undefined>(initialDocId);
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'contract' | 'invoice' | 'sop'>('ALL');
  const [uploadMode, setUploadMode] = useState<'contract' | 'invoice'>('contract');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  const fetchDocs = () => {
    documentClient.getDocuments().then((res) => {
      setDocuments(res);
      if (!selectedDocId && res.length > 0 && res[0]) {
        setSelectedDocId(res[0].id);
      }
    });
  };

  useEffect(() => {
    fetchDocs();
  }, [documentClient]);

  useEffect(() => {
    if (initialDocId) {
      setSelectedDocId(initialDocId);
    }
  }, [initialDocId]);

  const filteredDocs = useMemo(() => {
    return documents.filter((d) => typeFilter === 'ALL' || d.type === typeFilter);
  }, [documents, typeFilter]);

  const selectedDoc = useMemo(() => {
    return documents.find((d) => d.id === selectedDocId) ?? filteredDocs[0] ?? documents[0];
  }, [documents, selectedDocId, filteredDocs]);

  const handleSimulateUpload = async (sampleName: string, type: 'contract' | 'invoice') => {
    setIsUploading(true);
    setUploadProgress('Đang tải tài liệu lên bộ lưu trữ...');

    await new Promise((r) => setTimeout(r, 500));
    setUploadProgress('Mô hình AI đang trích xuất OCR và cấu trúc hóa...');

    await new Promise((r) => setTimeout(r, 600));
    setUploadProgress('Đang đối chiếu quy chế nội bộ...');

    await new Promise((r) => setTimeout(r, 400));

    try {
      const created = await documentClient.uploadDocument({
        name: sampleName,
        size: '1.6 MB (PDF)',
        type,
      });
      setSelectedDocId(created.id);
      onSelectDoc(created.id);
      fetchDocs();
    } catch (err) {
      console.error(err);
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  return (
    <div className="wf-view wf-documents-view">
      {/* Header Banner */}
      <section className="wf-documents-hero">
        <div>
          <span className="wf-hero-banner__eyebrow">TRÍCH XUẤT & RÀ SOÁT TÀI LIỆU</span>
          <h2 className="wf-documents-hero__title">Tri thức & Tài liệu</h2>
          <p className="wf-documents-hero__desc">
            Bóc tách hóa đơn, rà soát điều khoản hợp đồng và đối chiếu tuân thủ tự động.
          </p>
        </div>
      </section>

      {/* Upload Zone & Quick Sample Dropper */}
      <section className="wf-upload-section">
        <div className="wf-upload-dropzone">
          <div className="wf-upload-icon" aria-hidden="true">
            📄
          </div>
          <div className="wf-upload-text">
            <h4>Tải tài liệu phân tích</h4>
            <p>Hỗ trợ PDF hợp đồng, hóa đơn GTGT hoặc quy trình vận hành (Tối đa 25MB)</p>
          </div>
          <div className="wf-upload-actions">
            <div className="wf-mode-toggle" role="group" aria-label="Chọn chế độ xử lý">
              <button
                type="button"
                className={`wf-toggle-btn ${uploadMode === 'contract' ? 'wf-toggle-btn--active' : ''}`}
                onClick={() => setUploadMode('contract')}
              >
                ⚖️ Rà soát hợp đồng
              </button>
              <button
                type="button"
                className={`wf-toggle-btn ${uploadMode === 'invoice' ? 'wf-toggle-btn--active' : ''}`}
                onClick={() => setUploadMode('invoice')}
              >
                🧾 Bóc tách hóa đơn
              </button>
            </div>
            <button
              type="button"
              className="wf-btn wf-btn--primary wf-btn--sm"
              disabled={isUploading}
              onClick={() =>
                handleSimulateUpload(
                  uploadMode === 'contract'
                    ? `Hợp đồng Mua bán HĐ-2026-T${Date.now().toString().slice(-4)}.pdf`
                    : `Hóa đơn GTGT VAT-00${Date.now().toString().slice(-4)}.pdf`,
                  uploadMode,
                )
              }
            >
              {isUploading ? 'Đang phân tích...' : 'Thử tải file mẫu →'}
            </button>
          </div>
        </div>

        {isUploading && (
          <div className="wf-upload-progress-box" role="status">
            <div className="wf-progress-spinner" aria-hidden="true" />
            <div className="wf-progress-text">
              <strong>Đang xử lý</strong>
              <span>{uploadProgress}</span>
            </div>
          </div>
        )}
      </section>

      {/* Main Workspace Layout */}
      <div className="wf-documents-layout">
        {/* Left: Document List */}
        <aside className="wf-docs-sidebar" aria-label="Danh sách tài liệu">
          <div className="wf-docs-sidebar__tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={typeFilter === 'ALL'}
              className={`wf-filter-chip ${typeFilter === 'ALL' ? 'wf-filter-chip--active' : ''}`}
              onClick={() => setTypeFilter('ALL')}
            >
              Tất cả ({documents.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={typeFilter === 'contract'}
              className={`wf-filter-chip ${typeFilter === 'contract' ? 'wf-filter-chip--active' : ''}`}
              onClick={() => setTypeFilter('contract')}
            >
              Hợp đồng ({documents.filter((d) => d.type === 'contract').length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={typeFilter === 'invoice'}
              className={`wf-filter-chip ${typeFilter === 'invoice' ? 'wf-filter-chip--active' : ''}`}
              onClick={() => setTypeFilter('invoice')}
            >
              Hóa đơn ({documents.filter((d) => d.type === 'invoice').length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={typeFilter === 'sop'}
              className={`wf-filter-chip ${typeFilter === 'sop' ? 'wf-filter-chip--active' : ''}`}
              onClick={() => setTypeFilter('sop')}
            >
              Quy trình ({documents.filter((d) => d.type === 'sop').length})
            </button>
          </div>

          <div className="wf-docs-list">
            {filteredDocs.map((doc) => {
              const isSelected = doc.id === selectedDoc?.id;
              return (
                <article
                  key={doc.id}
                  className={`wf-doc-card ${isSelected ? 'wf-doc-card--active' : ''}`}
                  tabIndex={0}
                  onClick={() => {
                    setSelectedDocId(doc.id);
                    onSelectDoc(doc.id);
                  }}
                >
                  <div className="wf-doc-card__top">
                    <span className={`wf-doc-type-badge wf-doc-type-badge--${doc.type}`}>
                      {doc.type === 'contract' ? 'HỢP ĐỒNG' : doc.type === 'invoice' ? 'HÓA ĐƠN' : 'QUY TRÌNH'}
                    </span>
                    <span className="wf-doc-card__time">{doc.uploadedAt}</span>
                  </div>
                  <h4 className="wf-doc-card__title">{doc.title}</h4>
                  <div className="wf-doc-card__footer">
                    <span className="wf-doc-card__size">{doc.fileSize}</span>
                    <span className="wf-doc-card__confidence">
                      Độ tin cậy: {doc.analysis.confidence}%
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </aside>

        {/* Right: Document Analysis Detail Pane */}
        {selectedDoc ? (
          <main className="wf-doc-detail-pane" aria-labelledby="doc-detail-title">
            <div className="wf-doc-detail-header">
              <div>
                <div className="wf-doc-badge-row">
                  <span className={`wf-doc-type-badge wf-doc-type-badge--${selectedDoc.type}`}>
                    {selectedDoc.type === 'contract'
                      ? 'RÀ SOÁT HỢP ĐỒNG'
                      : selectedDoc.type === 'invoice'
                        ? 'BÓC TÁCH HÓA ĐƠN'
                        : 'SỐ HÓA QUY TRÌNH'}
                  </span>
                  <span className="wf-confidence-tag">
                    Độ chính xác: <strong>{selectedDoc.analysis.confidence}%</strong>
                  </span>
                </div>
                <h3 id="doc-detail-title" className="wf-doc-detail-title">
                  {selectedDoc.title}
                </h3>
                <span className="wf-doc-detail-sub">{selectedDoc.analysis.provenance}</span>
              </div>
            </div>

            {/* Extracted Metadata Grid */}
            <section className="wf-doc-meta-section">
              <h4 className="wf-doc-section-heading">Thông tin định danh</h4>
              <div className="wf-doc-meta-grid">
                {Object.entries(selectedDoc.analysis.metadata).map(([key, val]) => (
                  <div key={key} className="wf-doc-meta-item">
                    <span className="wf-doc-meta-key">{key}</span>
                    <span className="wf-doc-meta-val">{val}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Compliance & Policy Findings */}
            <section className="wf-doc-findings-section">
              <h4 className="wf-doc-section-heading">Đối chiếu quy chuẩn</h4>
              <div className="wf-findings-list">
                {selectedDoc.analysis.complianceFindings.map((finding, idx) => (
                  <div
                    key={idx}
                    className={`wf-finding-item wf-finding-item--${finding.result}`}
                  >
                    <div className="wf-finding-header">
                      <span className={`wf-finding-badge wf-finding-badge--${finding.result}`}>
                        {finding.result === 'pass'
                          ? 'ĐẠT'
                          : finding.result === 'flagged'
                            ? 'CẢNH BÁO'
                            : 'SAI LỆCH'}
                      </span>
                      <strong>{finding.rule}</strong>
                    </div>
                    <p className="wf-finding-detail">{finding.detail}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Key Clauses / Items Table */}
            <section className="wf-doc-clauses-section">
              <h4 className="wf-doc-section-heading">
                {selectedDoc.type === 'contract'
                  ? 'Điều khoản trọng yếu'
                  : selectedDoc.type === 'invoice'
                    ? 'Dòng hàng chi tiết'
                    : 'Quy định chính'}
              </h4>
              <div className="wf-clauses-table">
                {selectedDoc.analysis.keyClausesOrItems.map((item, idx) => (
                  <div key={idx} className="wf-clause-row">
                    <div className="wf-clause-title-col">
                      <strong>{item.name}</strong>
                      {item.riskLevel && (
                        <span className={`wf-risk-pill wf-risk-pill--${item.riskLevel}`}>
                          {item.riskLevel === 'high_risk'
                            ? 'Rủi ro cao'
                            : item.riskLevel === 'caution'
                              ? 'Cần lưu ý'
                              : 'An toàn'}
                        </span>
                      )}
                    </div>
                    <div className="wf-clause-content-col">
                      <p className="wf-clause-val">{item.value}</p>
                      {item.note && <p className="wf-clause-note">💡 {item.note}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Related Alert CTA */}
            {selectedDoc.id === 'doc-contract-01' && onNavigateToAlert && (
              <div className="wf-doc-alert-callout">
                <div>
                  <strong>Cảnh báo:</strong> Điều khoản phạt 15% đã được gửi sang Smart Alerts.
                </div>
                <button
                  type="button"
                  className="wf-btn wf-btn--warning wf-btn--sm"
                  onClick={() => onNavigateToAlert('alert-legal-01')}
                >
                  Xem Smart Alert →
                </button>
              </div>
            )}
          </main>
        ) : (
          <div className="wf-empty-box">Chọn một tài liệu để xem chi tiết.</div>
        )}
      </div>
    </div>
  );
}
