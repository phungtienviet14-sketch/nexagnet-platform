'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { settingsApi } from '../../../lib/settings';
import { EmptyState, ErrorState, LoadingState, Panel, StatPanel } from '../components/SectionState';

/**
 * HAI trang NGUON SU THAT ma be mat khach chi DOC: kho tri thuc va bang gia.
 *
 * Sua o day KHONG mo trong U-UI0. Man hinh sua bang gia va sua danh muc da ton tai o be mat quan
 * tri (`/settings`), va nhan doi no sang day de "cho day trang" la cach nhanh nhat de hai man hinh
 * lech nhau. O day chi tra loi mot cau hoi ma nguoi ban hang thuc su hoi: he thong dang dua vao
 * bang gia thang nao.
 */

/** "2026-09" -> "tháng 09/2026". Chuoi thang den tu API dang `YYYY-MM`. */
function monthLabel(value: string | null): string {
  if (!value) return 'chưa xác định';
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return value;
  return `tháng ${match[2]}/${match[1]}`;
}

export function KnowledgeView() {
  const query = useQuery({ queryKey: ['b2b', 'knowledge'], queryFn: api.knowledge });

  return (
    <Panel
      title="Nguồn sự thật của trợ lý"
      description="Trợ lý chỉ trả lời dựa trên những dữ liệu này — không tự suy đoán ngoài danh mục."
    >
      {query.isPending ? <LoadingState what="kho dữ liệu" /> : null}
      {query.isError ? <ErrorState what="kho dữ liệu" /> : null}
      {query.isSuccess ? (
        query.data.productCount === 0 &&
        query.data.glossaryCount === 0 &&
        query.data.groupCount === 0 ? (
          <EmptyState
            title="Kho dữ liệu còn trống"
            detail="Cần nhập danh mục sản phẩm, từ viết tắt và bản đồ nhóm trước khi trợ lý làm việc được."
          />
        ) : (
          <div className="b2b-stats">
            <StatPanel
              label="Sản phẩm trong danh mục"
              value={String(query.data.productCount)}
              hint="Mã ngoài danh mục sẽ được chuyển cho người xử lý"
            />
            <StatPanel
              label="Từ viết tắt đã dạy"
              value={String(query.data.glossaryCount)}
              hint="Giúp đọc tin viết tắt, không dấu"
            />
            <StatPanel label="Nhóm đã gán đại lý" value={String(query.data.groupCount)} />
          </div>
        )
      ) : null}
    </Panel>
  );
}

export function PoliciesView() {
  const query = useQuery({ queryKey: ['b2b', 'price-periods'], queryFn: settingsApi.pricePeriods });

  return (
    <Panel
      title="Bảng giá đang áp dụng"
      description="Giá hệ thống dùng để tính đơn, theo tháng hiệu lực."
    >
      {query.isPending ? <LoadingState what="bảng giá" /> : null}
      {query.isError ? <ErrorState what="bảng giá" /> : null}
      {query.isSuccess ? (
        <>
          <p className="b2b-headline">
            {query.data.missingCurrentPeriod
              ? `Chưa có bảng giá cho ${monthLabel(query.data.currentMonth)}. Đơn trong tháng này chưa tính được giá tự động.`
              : `Bảng giá ${monthLabel(query.data.currentMonth)} đang được áp dụng.`}
          </p>
          {query.data.periods.length === 0 ? (
            <EmptyState
              title="Chưa có bảng giá nào"
              detail="Cần nhập ít nhất một bảng giá trước khi hệ thống tính tiền thay người."
            />
          ) : (
            <ul className="b2b-periods">
              {query.data.periods.map((period) => (
                <li
                  key={period.id}
                  className={`b2b-period${
                    period.id === query.data.currentPeriodId ? ' b2b-period--active' : ''
                  }`}
                >
                  <span className="b2b-period__month">{monthLabel(period.validMonth)}</span>
                  <span className="b2b-period__count">{period.prices.length} dòng giá</span>
                  {period.id === query.data.currentPeriodId ? (
                    <span className="b2b-pill b2b-pill--da_gui">Đang áp dụng</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
    </Panel>
  );
}
