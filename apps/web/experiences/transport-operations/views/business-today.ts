/**
 * HOM NAY theo LICH NGHIEP VU cua khach — `YYYY-MM-DD`.
 *
 * Khong dung `new Date().toISOString().slice(0, 10)`, va do khong phai chuyen nho: chuoi do la ngay
 * theo UTC. O mui gio Viet Nam, tu 00:00 den 07:00 gio dia phuong no tra ve NGAY HOM TRUOC — nen
 * mot ke toan mo bao cao cong no luc 6 gio sang se doc mot bang cua hom qua ma khong co dau hieu gi.
 *
 * `en-CA` cho ra dung dang `YYYY-MM-DD` ma khong phai ghep tay tung phan — va quan trong hon, no
 * khong bao gio dao ngay/thang nhu mot so locale khac.
 *
 * `timeZone` den tu goi khach (`policies.transportCore.timeZone`). Vang mat thi dung mui gio cua
 * may: mot phong doan, nhung la phong doan DUY NHAT con lai, va no van dung hon UTC.
 */
export const businessTodayIn = (timeZone: string | undefined): string => {
  const parts: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  };
  try {
    return new Intl.DateTimeFormat('en-CA', { ...parts, timeZone }).format(new Date());
  } catch {
    // Mot ten mui gio hong trong goi khach KHONG duoc lam trang man hinh bao cao. Roi ve mui gio
    // cua may va di tiep — cau tra loi kem chinh xac hon mot chut, nhung van la mot ngay that.
    return new Intl.DateTimeFormat('en-CA', parts).format(new Date());
  }
};
