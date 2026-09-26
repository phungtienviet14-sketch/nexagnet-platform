/**
 * MOT LAN THU cua mot lenh TRUC TUYEN co khoa chong ghi trung — HAM THUAN.
 *
 * Khoa sinh MOT lan cho mot NOI DUNG lenh (`identity`) va giu nguyen qua moi lan bam lai cho toi khi
 * may chu nhan: mat song giua luc gui va luc nhan -> bam lai -> lan hai mang DUNG khoa cu -> may chu
 * tra lai chinh ket qua da ghi thay vi ghi ban thu hai.
 *
 * DOI NOI DUNG thi DOI KHOA: may chu phat lai theo khoa ma khong so noi dung, nen mot khoa cu mang
 * noi dung moi se tra ve ket qua cua lenh CU — dung cai loi ma khoa nay sinh ra de chan.
 */
export interface CommandAttempt {
  readonly identity: string;
  readonly key: string;
}

export function attemptFor(
  previous: CommandAttempt | null,
  identity: string,
  mint: () => string,
): CommandAttempt {
  return previous !== null && previous.identity === identity ? previous : { identity, key: mint() };
}
