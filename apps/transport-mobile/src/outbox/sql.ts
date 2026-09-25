/**
 * Mat phang SQL TOI THIEU ma kho hang doi can — dung ten va chu ky cua `SQLiteDatabase` trong
 * `expo-sqlite` (API bat dong bo). Tach ra giao dien de CHINH cau SQL do chay duoc trong test tren
 * Node (`node:sqlite`, co san tu Node 22) — tuc thu duoc kiem la SQL that, khong phai mot ban gia
 * lap viet lai bang Map.
 */
export type SqlValue = string | number | null;

export interface SqlRunResult {
  readonly changes: number;
}

export interface SqlDatabase {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params: readonly SqlValue[]): Promise<SqlRunResult>;
  getAllAsync<T>(source: string, params: readonly SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(source: string, params: readonly SqlValue[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}
