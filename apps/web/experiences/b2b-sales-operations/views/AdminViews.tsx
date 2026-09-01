'use client';

import { useQuery } from '@tanstack/react-query';
import { authApi, type AuthRole } from '../../../lib/auth';
import type { PublicTenantDescriptor } from '../../../lib/tenant-runtime';
import { EmptyState, ErrorState, LoadingState, Panel } from '../components/SectionState';
import { B2B_SECTIONS, NAVIGATION_ENFORCEMENT_NOTE, type B2bSection } from '../navigation';

/**
 * HAI trang QUAN TRI cua be mat khach.
 *
 * `UsersView` lam hai viec, va viec thu hai moi la ly do no ton tai trong U-UI0: no BAY RA hop dong
 * vai tro -> dieu huong (Issue #107 §8) thanh mot bang doc duoc, kem dung mot cau noi ro no khong
 * phai hang rao bao mat. Mot hop dong quyen han chi nam trong dau nguoi viet code la mot hop dong
 * khong ai kiem tra duoc.
 */

const ROLE_LABEL: Readonly<Record<AuthRole, string>> = {
  SALE: 'Sale',
  ACCOUNTING: 'Kế toán',
  MANAGER: 'Quản lý',
  ADMIN: 'Quản trị hệ thống',
};

const ROLE_ORDER: readonly AuthRole[] = ['SALE', 'ACCOUNTING', 'MANAGER', 'ADMIN'];

/**
 * `B2B_SECTIONS` duoc khai `as const`, nen `roles` cua tung muc la mot BO CHU CU THE
 * (vd `readonly ['ADMIN']`). Doc no qua kieu rong `B2bSection` de bang ben duoi hoi duoc
 * "vai tro X co trong muc nay khong" — thay vi bi tsc chan vi so sanh mot AuthRole bat ky
 * voi mot bo chi chua dung mot gia tri.
 */
const SECTION_CONTRACT: readonly B2bSection[] = B2B_SECTIONS;

/**
 * Ten nghiep vu bang TIENG NGUOI DUNG.
 *
 * Ma capability (`turn-processing`, `sales-order`) la tu vung cua nen tang. In thang chung len be
 * mat khach la bat nguoi doc hoc tu dien noi bo cua chung ta.
 */
const CAPABILITY_LABEL: Readonly<Record<string, string>> = {
  knowledge: 'Kho dữ liệu và kiến thức',
  messaging: 'Nhắn tin với nhóm đại lý',
  'turn-processing': 'Đọc và hiểu tin nhắn',
  'sales-order': 'Chốt đơn và tính tiền',
  campaign: 'Chăm sóc và chiến dịch',
  operations: 'Quản trị vận hành',
  notifications: 'Cảnh báo cho người phụ trách',
};

export function UsersView() {
  const query = useQuery({ queryKey: ['b2b', 'users'], queryFn: authApi.users });

  return (
    <div className="b2b-stack">
      <Panel title="Tài khoản trong hệ thống" description="Người đang có quyền truy cập.">
        {query.isPending ? <LoadingState what="danh sách người dùng" /> : null}
        {query.isError ? <ErrorState what="danh sách người dùng" /> : null}
        {query.isSuccess ? (
          query.data.length === 0 ? (
            <EmptyState
              title="Chưa có tài khoản nào"
              detail="Quản trị viên tạo tài khoản đầu tiên trong phần Cài đặt."
            />
          ) : (
            <ul className="b2b-users">
              {query.data.map((user) => (
                <li key={user.id} className="b2b-user">
                  <span className="b2b-user__name">{user.name}</span>
                  <span className="b2b-user__account">{user.username}</span>
                  <span className="b2b-pill b2b-pill--role">{ROLE_LABEL[user.role]}</span>
                  {user.disabledAt ? (
                    <span className="b2b-pill b2b-pill--da_huy">Đã khoá</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )
        ) : null}
      </Panel>

      <Panel
        title="Vai trò thấy được những mục nào"
        description="Bảng này mô tả cách màn hình sắp xếp công việc."
      >
        <p className="b2b-note">{NAVIGATION_ENFORCEMENT_NOTE}</p>
        <div className="b2b-table-scroll">
          <table className="b2b-matrix">
            <caption className="b2b-matrix__caption">
              Mục điều hướng theo vai trò — không phải bảng phân quyền của máy chủ.
            </caption>
            <thead>
              <tr>
                <th scope="col">Mục</th>
                {ROLE_ORDER.map((role) => (
                  <th key={role} scope="col">
                    {ROLE_LABEL[role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SECTION_CONTRACT.map((section) => (
                <tr key={section.id}>
                  <th scope="row">{section.label}</th>
                  {ROLE_ORDER.map((role) => {
                    const allowed = section.roles.includes(role);
                    return (
                      <td key={role} data-allowed={allowed}>
                        <span aria-hidden="true">{allowed ? '●' : '—'}</span>
                        <span className="b2b-visually-hidden">
                          {allowed ? 'có trong điều hướng' : 'không có trong điều hướng'}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

export function SettingsView({ tenant }: { tenant: PublicTenantDescriptor }) {
  return (
    <div className="b2b-stack">
      <Panel
        title="Cấu hình vận hành"
        description="Thiết lập chi tiết nằm ở trang quản trị hệ thống."
      >
        <p className="b2b-headline">
          Nhóm Zalo, đại lý, bảng giá, chiến dịch và người dùng được cấu hình tại trang quản trị.
        </p>
        <a className="b2b-link" href="/settings">
          Mở trang quản trị hệ thống →
        </a>
      </Panel>

      <Panel
        title="Nghiệp vụ doanh nghiệp đang bật"
        description="Quyết định những mục xuất hiện trên thanh điều hướng."
      >
        <ul className="b2b-capabilities">
          {tenant.capabilities.map((capability) => (
            <li key={capability} className="b2b-capability">
              {CAPABILITY_LABEL[capability] ?? capability}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
