const vndFormatter = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

/** Dinh dang tien VND theo chuan hien thi Viet Nam, vd 11500000 -> "11.500.000 ₫" */
export function formatVnd(amount: number): string {
  if (!Number.isFinite(amount)) {
    throw new TypeError(`formatVnd nhan gia tri khong hop le: ${amount}`);
  }
  return vndFormatter.format(amount);
}
