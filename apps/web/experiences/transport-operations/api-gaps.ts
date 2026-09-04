import type { TransportSectionId } from './navigation';

/**
 * SO DANG KHOANG CACH API — do duoc, khong phong doan.
 *
 * #161 §9 dat ra dung mot luat cho tinh huong nay: *"neu T7A phat hien API thieu/sai thi KHONG va
 * `apps/api/**` trong nhanh nay; ghi/bao khoang cach kem yeu cau/mong doi/thuc te, roi lam tiep
 * phan doc lap"*. Tep nay la cho ghi do, va no la NGUON cho ca hai muc dich:
 *
 *   · man hinh — muc `awaiting-api` doc chinh no de noi that voi khach, thay vi bay mot cai bang
 *     trong hay mot con so bia;
 *   · bao cao — PR/issue trich thang tu day, nen ban tren man hinh va ban trong bao cao khong bao
 *     gio lech nhau.
 *
 * Moi muc phai tra loi duoc ba cau: **can gi** (`needs`), **hom nay co gi** (`actual`), **da co san
 * o server chua** (`serverSide`). Cau thu ba quan trong nhat khi uu tien: mot read model da chay
 * ma chi thieu route la viec nho; mot thu chua ai viet la viec khac.
 */
export interface TransportApiGap {
  readonly id: string;
  /** Muc bi anh huong — de man hinh tu tim duoc phan giai thich cua chinh no. */
  readonly sections: readonly TransportSectionId[];
  readonly title: string;
  /** Man hinh can gi. */
  readonly needs: string;
  /** Hom nay do duoc gi. */
  readonly actual: string;
  /** Doan da chay o server nhung khong co duong HTTP nao tra ra. `null` = chua co gi. */
  readonly serverSide: string | null;
  readonly severity: 'blocking' | 'degrading' | 'annoying';
}

export const TRANSPORT_API_GAPS = [
  {
    id: 'settlement-no-http',
    sections: ['settlement', 'ar-ap', 'margin'],
    title: 'Quyết toán (TX-05) không có một đường HTTP nào',
    needs:
      'Công nợ phải thu/phải trả, đối tác hai chiều, hoa hồng, biên trực tiếp — tức toàn bộ mục ' +
      '§4.G và hai thẻ AR/AP + biên trên Tổng quan.',
    actual:
      'transport-settlement.module.ts không khai controllers nào, và thư mục settlement/ không có ' +
      'tệp *.controller.ts. Không route nào trả các read model này.',
    serverSide:
      'SettlementReadService (arAging, apByCounterparty, partnerPosition, tripDirectMargin, ' +
      'directMarginRollup, documentChain) và SettlementService đã chạy đầy đủ — chỉ thiếu lớp HTTP.',
    severity: 'blocking',
  },
  {
    id: 'no-error-codes-on-wire',
    sections: ['trips', 'driver-fund', 'fuel'],
    title: 'Mã lỗi nghiệp vụ bị bỏ ở biên HTTP',
    needs:
      'Phân biệt được hai đường từ chối khác nhau để nói cho người dùng việc cần làm khác nhau — ' +
      'ví dụ FUND_PERIOD_STATUS_RACE (tải lại) so với FUND_PERIOD_OVERLAP (sửa lại ngày).',
    actual:
      'transportErrorToHttp chỉ chuyển error.message vào ngoại lệ Nest; TransportDomainError.reason ' +
      'có kiểu nhưng bị bỏ. Thân lỗi chỉ có statusCode/message/error, và 403 mang bốn nghĩa khác nhau.',
    serverSide:
      'Các bộ mã đã có kiểu và đầy đủ: costing-errors.ts, fuel-errors.ts, transport.errors.ts.',
    severity: 'degrading',
  },
  {
    id: 'no-list-filters',
    sections: ['trips', 'fleet', 'driver-fund', 'fuel'],
    title: 'Không có phân trang, bộ lọc, tìm kiếm hay sắp xếp trên bất kỳ danh sách nào',
    needs:
      'Lọc chuyến theo trạng thái/khách/ngày, tìm theo mã chuyến, và phân trang khi dữ liệu lớn dần.',
    actual:
      'Không một @Query nào trong cả chín controller vận tải. GET /transport/trips trả toàn bộ bảng; ' +
      'GET /transport/costing/driver-fund/accounts/:driverId trả toàn bộ lịch sử sổ quỹ.',
    serverSide: 'TripRepository.findByCode có sẵn nhưng không được phơi qua HTTP.',
    severity: 'degrading',
  },
  {
    id: 'no-aggregate-endpoint',
    sections: ['overview'],
    title: 'Không có đường tổng hợp cho bảng điều khiển',
    needs:
      'Tổng số dư quỹ toàn đội, số kỳ đang mở, tổng chênh lệch chờ xử lý — tức các con số của §4.B.',
    actual:
      'Không có GET /transport/costing/driver-fund/accounts (danh sách nhiều lái xe). Muốn biết ' +
      'tổng thì phải gọi một lần cho mỗi lái xe. GET /reconciliations trả FuelReconciliation[] mà ' +
      'không kèm pendingDiscrepancyCount, nên mỗi dòng cần thêm một lần đọc cả workspace.',
    serverSide: 'pendingDiscrepancyCount đã tính, nhưng chỉ có trong workspace của từng kỳ.',
    severity: 'degrading',
  },
  {
    id: 'trip-has-no-names',
    sections: ['trips', 'overview'],
    title: 'Chuyến chỉ trả về khoá ngoại, không trả tên',
    needs: 'Cột khách hàng / nhà xe / lái xe / biển số đọc được trên bảng danh sách chuyến.',
    actual:
      'Trip chỉ có customerId, carrierPartnerId, referrerPartnerId. Không có ?include=, không có ' +
      'activeAssignment trên Trip. Muốn biết ai đang chạy chuyến nào thì phải gọi ' +
      'GET /transport/trips/:id/assignments cho TỪNG dòng.',
    serverSide: 'TripRepository.activeAssignment có sẵn nhưng không được phơi qua HTTP.',
    severity: 'degrading',
  },
  {
    id: 'no-driver-expense-path',
    sections: ['driver-fund'],
    title: 'Lái xe không có đường tự ghi một khoản chi thường',
    needs: 'Màn "Chi phí" của bề mặt lái xe theo §4.H: loại • số tiền • ảnh • xác nhận.',
    actual:
      'Bộ transport.driver.self.* chỉ có đọc chuyến, đổi trạng thái chuyến, đọc quỹ, đọc và nộp ' +
      'PHIẾU DẦU. POST /transport/costing/expenses đòi ACCOUNTING hoặc ADMIN. Nên màn hình đó đã ' +
      'được bỏ khỏi bề mặt lái xe thay vì để một nút không bao giờ gửi được.',
    serverSide: null,
    severity: 'blocking',
  },
  {
    id: 'driver-cannot-learn-vehicle-id',
    sections: ['fuel', 'driver-fund'],
    title: 'Lái xe không lấy được vehicleId mà phiếu dầu bắt buộc phải có',
    needs:
      'Nộp phiếu đổ dầu từ bề mặt lái xe (§4.H): POST /transport/me/fuel/slips đòi vehicleId là ' +
      'chuỗi không rỗng.',
    actual:
      'DriverTripView chỉ trả vehicleRegistrationPlate, KHÔNG trả vehicleId. Vai SALE không có ' +
      'transport.vehicle.read nên GET /transport/vehicles trả 403. DriverFuelSlipView có vehicleId ' +
      'nhưng chỉ trên phiếu ĐÃ nộp — nên một lái xe chưa từng nộp phiếu không có đường nào biết id ' +
      'xe của mình, và lấy lại id từ phiếu cũ sẽ sai ngay khi xe được đổi. Kết quả: lái xe không nộp ' +
      'được phiếu đầu tiên. Màn hình vì vậy không bày ô nộp phiếu, thay vì bày một nút chắc chắn lỗi.',
    serverSide:
      'DriverTripViewSources đã có sẵn cả đối tượng Vehicle khi dựng khung nhìn — thêm vehicleId vào ' +
      'DriverTripView là một trường, không phải một truy vấn mới.',
    severity: 'blocking',
  },
  {
    id: 'no-expense-category-catalogue',
    sections: ['driver-fund'],
    title: 'Không có đường đọc danh mục loại chi phí',
    needs: 'Danh sách loại chi phí hợp lệ để dựng ô chọn khi ghi chi phí chuyến.',
    actual:
      'categoryCode được kiểm phía server theo cấu hình tenant (EXPENSE_CATEGORY_UNKNOWN) nhưng ' +
      'không đường nào trả danh sách. Người dùng buộc phải gõ và nhận 400 nếu sai.',
    serverSide: 'Danh mục nằm trong cấu hình tenant, đã dùng để kiểm tra.',
    severity: 'degrading',
  },
  {
    id: 'no-evidence-bytes',
    sections: ['fuel', 'driver-fund'],
    title: 'Không có đường tải lên hay đọc lại ảnh bằng chứng',
    needs: 'Xem lại ảnh phiếu dầu / chứng từ chi phí ngay trên màn hình (§4.E, §4.F).',
    actual:
      'Không @UploadedFile, không multipart ở đâu trong module vận tải. Bằng chứng là một CHUỖI ' +
      'ĐỊNH VỊ (locator) mà màn hình phải lấy từ nơi khác, và không route nào phục vụ byte ảnh hay ' +
      'phát URL có chữ ký. Bề mặt lái xe chỉ thấy evidenceCount, nên không xem lại được ảnh vừa gửi.',
    serverSide: null,
    severity: 'blocking',
  },
  {
    id: 'no-fuel-resubmit-route',
    sections: ['fuel'],
    title: 'Phiếu dầu bị từ chối là đường cụt',
    needs:
      'Chụp lại và nộp lại một phiếu bị từ chối — fuel-lifecycle.ts gọi đây là "đường chạy thường ngày".',
    actual: 'Không controller nào phơi REJECTED → DECLARED, dù máy trạng thái cho phép cạnh đó.',
    serverSide: 'FuelService.resubmitFuelEntry đã hiện thực.',
    severity: 'blocking',
  },
  {
    id: 'manager-role-has-no-scope',
    sections: ['overview'],
    title: 'Vai MANAGER không có thao tác vận tải nào',
    needs: '§8 của #161 nói "Giám đốc/Quản lý xem được phạm vi vận hành/tài chính đã cấu hình".',
    actual:
      'Bảng bridge GD-22 khai MANAGER: [] một cách CÓ CHỦ ĐÍCH (fail-closed, vì khách chỉ nói về ba ' +
      'mẫu vai). Nên một MANAGER nhận 403 trên toàn bộ bề mặt vận tải. Màn hình nói thật điều này ' +
      'thay vì tự bịa một ánh xạ quyền — sửa đúng chỗ là bảng ở apps/api, không phải ở web.',
    serverSide: 'ROLE_ACTIONS trong transport-actions.ts.',
    severity: 'blocking',
  },
  {
    id: 'admin-locked-out-of-driver-surface',
    sections: ['overview'],
    title: 'ADMIN không mở được bề mặt lái xe',
    needs: 'Hỗ trợ mở màn hình lái xe để dựng lại lỗi — chính docblock của controller nói vậy.',
    actual:
      'PATCH /transport/me/trips/:id/status ghi @Roles("SALE","ADMIN"), nhưng ADMIN: ' +
      'OPERATIONS_ACTIONS loại hết transport.driver.self.*, nên TransportActionGuard trả 403 cho ' +
      'ADMIN trên cả ba đường /transport/me/trips. Chỉ SALE dùng được.',
    serverSide: 'ROLE_ACTIONS trong transport-actions.ts.',
    severity: 'degrading',
  },
  {
    id: 'cancel-backdoor-via-transition',
    sections: ['trips'],
    title: 'Huỷ chuyến đi vòng được qua đường chuyển trạng thái',
    needs: 'Huỷ chuyến luôn có lý do, và luôn đi qua quyền transport.trip.cancel.',
    actual:
      'POST /transport/trips/:id/transition với {"to":"CANCELLED"} chỉ đòi transport.trip.transition ' +
      '(ACCOUNTING có), và setStatus KHÔNG ghi cancelledAt/cancellationReason — ra một chuyến đã huỷ ' +
      'không có lý do. Màn hình không bao giờ phơi "CANCELLED" trên ô chuyển trạng thái, nhưng vẫn ' +
      'phải chịu được dữ liệu như vậy do nơi khác tạo ra.',
    serverSide: 'ALLOWED_EDGES cho phép cạnh này.',
    severity: 'degrading',
  },
  {
    id: 'tx06-tx07-views-not-wired',
    sections: ['maintenance', 'payroll'],
    title: 'TX-06 / TX-07 đã có đường HTTP, nhưng màn hình chưa nối vào',
    needs:
      'Bảo dưỡng & giấy tờ và Lương đọc read model thật của máy chủ thay vì hiển thị bản thiết kế.',
    actual:
      'T6 đã vào main (PR #152): mã capability transport-asset-compliance và transport-workforce ' +
      'nay có thật, nên hai mục hiện theo đúng năng lực khách bật — không còn trục chuỗi tạm. ' +
      'Nhưng hai màn này CHƯA gọi một endpoint nào: chúng vẫn là bản thiết kế. Việc nối vào ' +
      '/transport/compliance/alerts, /transport/maintenance/due và /transport/payroll/* thuộc ' +
      'T7D (#170), không nằm trong bản xem trước này.',
    serverSide:
      'Đã có 15 route TX-06 (compliance, maintenance, fleet-status, alerts) và 10 route TX-07 ' +
      '(payroll periods/runs/payslips), tất cả @Roles(ACCOUNTING, ADMIN).',
    severity: 'degrading',
  },
] as const satisfies readonly TransportApiGap[];

export const gapsForSection = (section: TransportSectionId): readonly TransportApiGap[] =>
  TRANSPORT_API_GAPS.filter((gap) => (gap.sections as readonly string[]).includes(section));

export const blockingGaps = (): readonly TransportApiGap[] =>
  TRANSPORT_API_GAPS.filter((gap) => gap.severity === 'blocking');
