/**
 * Loi cua tang nguon su that. Mang `reason` CO KIEU chu khong chi mot cau tieng Viet — de bai test
 * khang dinh dung duong tu choi nao da dong, thay vi chi biet "co nem".
 */
export class SourceRegistryError extends Error {
  constructor(
    readonly reason: string,
    message: string,
  ) {
    super(message);
    this.name = 'SourceRegistryError';
  }
}
