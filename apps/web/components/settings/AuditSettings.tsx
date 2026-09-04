'use client';

import { useQuery } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { summarizeAuditFilters } from '../../lib/settings-focus';
import { settingsApi, type AuditFilters } from '../../lib/settings';
import {
  SettingsAdvanced,
  SettingsStatusBar,
  useFocusIntent,
  useFocusOnKey,
} from './SettingsFocus';
import { formatSettingsDate } from './settings-format';
import { SettingsPanelState } from './SettingsPanelState';

const EMPTY_FILTERS: AuditFilters = { page: 1, limit: 25 };

/**
 * Lich su thay doi — CHI DOC, nen "viec dang lam" o day la MOT CAU TRUY VAN (#146 §11).
 *
 * Ban cu de bo loc, trang thai rong va ket qua thanh ba khoi cung co. O day bo loc la mot cum duy
 * nhat, tom tat bo loc dang ap dung luon hien, va ket qua la phan chiem cho nhieu nhat sau khi loc.
 * Ngu nghia payload/redaction cua audit khong doi.
 */
export function AuditSettings() {
  const [draftActor, setDraftActor] = useState('');
  const [draftEntity, setDraftEntity] = useState('');
  const [draftAction, setDraftAction] = useState('');
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_FILTERS);
  const query = useQuery({
    queryKey: ['settings-audit', filters],
    queryFn: () => settingsApi.audit(filters),
  });

  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const intent = useFocusIntent();
  const filterKey = `${filters.actor ?? ''}|${filters.entityType ?? ''}|${filters.action ?? ''}|${filters.page ?? 1}`;
  // Chi chuyen tieu diem khi NGUOI VAN HANH doi cau truy van. Nap lai nen khong duoc keo con tro ra
  // khoi o dang go — ke ca khi so ban ghi tra ve doi.
  useFocusOnKey(resultsHeading, filterKey, intent);

  const handleFilter = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    intent.requestFocus();
    setFilters({
      page: 1,
      limit: 25,
      ...(draftActor.trim() ? { actor: draftActor.trim() } : {}),
      ...(draftEntity ? { entityType: draftEntity } : {}),
      ...(draftAction ? { action: draftAction } : {}),
    });
  };

  const clearFilters = () => {
    intent.requestFocus();
    setDraftActor('');
    setDraftEntity('');
    setDraftAction('');
    setFilters(EMPTY_FILTERS);
  };

  const page = query.data?.page ?? filters.page ?? 1;
  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / (query.data?.limit ?? 25)));
  const summary = summarizeAuditFilters(filters);

  return (
    <div className="settings-section-stack">
      <header className="settings-section-heading">
        <div>
          <p className="settings-eyebrow">Chỉ đọc · không sửa được</p>
          <h2>Lịch sử thay đổi</h2>
          <p>Ai đã đổi giá, chính sách, phân loại thành viên và các công tắc vận hành — lúc nào.</p>
        </div>
      </header>

      <SettingsStatusBar
        tone="ok"
        title={summary.label}
        detail="Mọi thay đổi cấu hình đều được ghi lại và đã loại bỏ dữ liệu nhạy cảm."
        facts={[
          { label: 'Kết quả', value: `${query.data?.total ?? 0} sự kiện` },
          { label: 'Trang', value: `${page} / ${totalPages}` },
        ]}
      />

      <form className="settings-filterbar settings-filterbar--audit" onSubmit={handleFilter}>
        <label className="settings-field settings-field--search">
          <span>Người thao tác</span>
          <input
            value={draftActor}
            placeholder="Tên hoặc mã người dùng"
            onChange={(event) => setDraftActor(event.target.value)}
          />
        </label>
        <label className="settings-field">
          <span>Đối tượng</span>
          <select value={draftEntity} onChange={(event) => setDraftEntity(event.target.value)}>
            <option value="">Tất cả</option>
            <option value="participant">Thành viên</option>
            <option value="price">Bảng giá</option>
            <option value="price_override">Giá riêng</option>
            <option value="rule_config">Chính sách bán hàng</option>
            <option value="automation">Tự động hóa</option>
            <option value="zalo">Kênh Zalo</option>
          </select>
        </label>
        <label className="settings-field">
          <span>Hành động</span>
          <select value={draftAction} onChange={(event) => setDraftAction(event.target.value)}>
            <option value="">Tất cả</option>
            <option value="create">Tạo mới</option>
            <option value="update">Cập nhật</option>
            <option value="activate">Kích hoạt</option>
            <option value="sync">Đồng bộ</option>
            <option value="logout">Đăng xuất</option>
          </select>
        </label>
        <button type="submit" className="settings-button settings-button--primary">
          Lọc lịch sử
        </button>
        {summary.active && (
          <button
            type="button"
            className="settings-button settings-button--quiet"
            onClick={clearFilters}
          >
            Bỏ lọc
          </button>
        )}
      </form>

      <section aria-labelledby="settings-audit-results">
        <div className="settings-subheading">
          <h3 id="settings-audit-results" ref={resultsHeading} tabIndex={-1}>
            Kết quả
          </h3>
          <span className="settings-count">{query.data?.total ?? 0} sự kiện</span>
        </div>

        {query.isLoading && (
          <SettingsPanelState
            title="Đang tải lịch sử"
            detail="Đọc nhật ký thay đổi đã được loại dữ liệu nhạy cảm…"
          />
        )}
        {query.error && (
          <SettingsPanelState
            tone="error"
            title="Không tải được lịch sử"
            detail={`${query.error.message}. Không có dữ liệu nào bị thay đổi.`}
            action={
              <button
                type="button"
                className="settings-button settings-button--quiet"
                onClick={() => query.refetch()}
              >
                Thử lại
              </button>
            }
          />
        )}
        {query.isSuccess && query.data.entries.length === 0 && (
          <SettingsPanelState
            title={summary.active ? 'Không có thay đổi nào khớp bộ lọc' : 'Chưa có thay đổi nào'}
            detail={
              summary.active
                ? `${summary.label}. Bỏ lọc để xem lại toàn bộ lịch sử.`
                : 'Mục này sẽ có nội dung sau khi ai đó cập nhật giá, chính sách, thành viên hoặc công tắc vận hành.'
            }
          />
        )}

        {query.data && query.data.entries.length > 0 && (
          <div className="settings-audit-list" aria-label="Các thay đổi đã ghi nhận">
            {query.data.entries.map((entry) => (
              <article key={entry.id} className="settings-audit-row">
                <time dateTime={entry.createdAt}>{formatSettingsDate(entry.createdAt)}</time>
                <span className="settings-audit-row__mark" aria-hidden="true" />
                <div className="settings-audit-row__body">
                  <div>
                    <strong>{entry.actor}</strong>
                    <span>{entry.action}</span>
                    <b>{entry.entityType}</b>
                    {entry.entityId && <code>{entry.entityId}</code>}
                  </div>
                  {(entry.before || entry.after) && (
                    <SettingsAdvanced title="Xem thay đổi">
                      <div className="settings-diff">
                        <div>
                          <small>Trước</small>
                          <pre>{entry.before ? JSON.stringify(entry.before, null, 2) : '—'}</pre>
                        </div>
                        <div>
                          <small>Sau</small>
                          <pre>{entry.after ? JSON.stringify(entry.after, null, 2) : '—'}</pre>
                        </div>
                      </div>
                    </SettingsAdvanced>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {query.data && query.data.total > query.data.limit && (
        <nav className="settings-pagination" aria-label="Phân trang lịch sử">
          <button
            type="button"
            className="settings-button settings-button--quiet"
            disabled={page <= 1}
            onClick={() => {
              intent.requestFocus();
              setFilters((current) => ({ ...current, page: Math.max(1, page - 1) }));
            }}
          >
            Trang trước
          </button>
          <span>
            Trang {page} / {totalPages}
          </span>
          <button
            type="button"
            className="settings-button settings-button--quiet"
            disabled={page >= totalPages}
            onClick={() => {
              intent.requestFocus();
              setFilters((current) => ({ ...current, page: Math.min(totalPages, page + 1) }));
            }}
          >
            Trang sau
          </button>
        </nav>
      )}
    </div>
  );
}
