'use client';

import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { settingsApi, type AuditFilters } from '../../lib/settings';
import { formatSettingsDate } from './settings-format';
import { SettingsPanelState } from './SettingsPanelState';

const EMPTY_FILTERS: AuditFilters = { page: 1, limit: 25 };

export function AuditSettings() {
  const [draftActor, setDraftActor] = useState('');
  const [draftEntity, setDraftEntity] = useState('');
  const [draftAction, setDraftAction] = useState('');
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_FILTERS);
  const query = useQuery({
    queryKey: ['settings-audit', filters],
    queryFn: () => settingsApi.audit(filters),
  });

  const handleFilter = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFilters({
      page: 1,
      limit: 25,
      ...(draftActor.trim() ? { actor: draftActor.trim() } : {}),
      ...(draftEntity ? { entityType: draftEntity } : {}),
      ...(draftAction ? { action: draftAction } : {}),
    });
  };

  const page = query.data?.page ?? filters.page ?? 1;
  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / (query.data?.limit ?? 25)));

  return (
    <div className="settings-section-stack">
      <header className="settings-section-heading">
        <div>
          <p className="settings-eyebrow">Chỉ đọc · không thể sửa</p>
          <h2>Lịch sử thay đổi</h2>
          <p>Theo dõi ai đã đổi giá, rules, phân loại thành viên và các cổng vận hành.</p>
        </div>
        <span className="settings-count">{query.data?.total ?? 0} sự kiện</span>
      </header>

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
            <option value="price_override">Deal riêng</option>
            <option value="rule_config">Rules</option>
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
      </form>

      {query.isLoading && (
        <SettingsPanelState
          title="Đang tải lịch sử"
          detail="Đọc audit log đã được loại dữ liệu nhạy cảm…"
        />
      )}
      {query.error && (
        <SettingsPanelState
          tone="error"
          title="Không tải được lịch sử"
          detail={`${query.error.message}. Không có dữ liệu nào được thay đổi.`}
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
          title="Chưa có thay đổi phù hợp"
          detail="Audit mới sẽ xuất hiện ở đây sau khi cập nhật giá, rules, thành viên hoặc trạng thái vận hành."
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
                  <details>
                    <summary>Xem thay đổi</summary>
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
                  </details>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {query.data && query.data.total > query.data.limit && (
        <nav className="settings-pagination" aria-label="Phân trang lịch sử">
          <button
            type="button"
            className="settings-button settings-button--quiet"
            disabled={page <= 1}
            onClick={() => setFilters((current) => ({ ...current, page: Math.max(1, page - 1) }))}
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
            onClick={() =>
              setFilters((current) => ({ ...current, page: Math.min(totalPages, page + 1) }))
            }
          >
            Trang sau
          </button>
        </nav>
      )}
    </div>
  );
}
