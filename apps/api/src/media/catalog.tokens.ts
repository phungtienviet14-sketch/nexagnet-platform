/**
 * Token DI cho kho ANH CATALOG SAN PHAM — tach hoan toan khoi `MediaStore` (anh khach gui vao).
 *
 * Hai kho phai la hai token khac nhau chu khong phai hai prefix trong cung mot kho: `MediaStore`
 * duoc tiem o rat nhieu cho (fetcher, readiness, health), nen neu route cong khai cung nhan dung
 * instance do thi ranh gioi PII chi con duoc giu bang mot chuoi prefix trong than ham. Token rieng
 * dua ranh gioi do len tang noi day, noi doc code nhin thay ngay.
 */
export const CATALOG_STORE = Symbol('CATALOG_STORE');
