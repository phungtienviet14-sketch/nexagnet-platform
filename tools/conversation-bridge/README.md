# `@netviet/conversation-bridge` — Conversation Bridge V0 (CHI VAO)

Cau noi **cuc bo** danh thuc **dung mot** cuoc hoi thoai ChatGPT Web thuong khi GitHub co mot
`REVIEW_REQUEST` hop le. No **khong doc cau tra loi**, **khong cham vao phien dang nhap ChatGPT**,
**khong mo cong vao** tren may, va **khong ghi gi len GitHub**.

Tai lieu van hanh day du (kien truc, ranh gioi tin cay, bang moi de doa, thu tuc cai/go, rui ro con
lai): [`docs/phat-trien/van-hanh/conversation-bridge-v0.md`](../../docs/phat-trien/van-hanh/conversation-bridge-v0.md).

## Bo cuc

| Thu muc             | Chay o dau                 | Vai                                                                                            |
| ------------------- | -------------------------- | ---------------------------------------------------------------------------------------------- |
| `protocol/`         | Node                       | Bo chuyen doi tren `@netviet/autopilot-protocol` — doc carrier, xet nguoi phat, dung khoa giao |
| `native-host/`      | Node (do Chrome khoi dong) | Doc GitHub mot chieu RA, quyet dinh, so khoa giao ben, dong goi Native Messaging               |
| `extension/`        | Chrome MV3                 | Arm dung mot URL, nhan khung WAKE, dat chu vao khung soan, gui mot lan                         |
| `extension/shared/` | **ca hai**                 | Ma tu chua khong phu thuoc: ban mau tin nhan, IPC, trang thai, bo noi khung soan               |
| `install/`          | Node                       | Ke hoach dang ky Native Messaging cho Chrome tren Windows — **mac dinh chay kho**              |
| `tests/`            | Node                       | 63 bai kiem tat dinh; khong bai nao cham mang hay chatgpt.com                                  |

## Lenh

```bash
pnpm --filter @netviet/conversation-bridge test        # 63 bai, tat dinh
pnpm --filter @netviet/conversation-bridge typecheck
pnpm --filter @netviet/conversation-bridge install:dry-run -- --extension-id=<32 chu a-p>
pnpm --filter @netviet/conversation-bridge uninstall:dry-run
```

`install:dry-run` **chi in ra** nhung gi se thay doi. Ghi that doi hoi ca `--apply` lan
`--i-understand-this-writes-to-my-registry`, va **chua tung duoc chay** trong nhiem vu nay.

## Bat bien duoc ma nguon cuong che (khong phai loi hua trong tai lieu)

| Bat bien                          | Cho cuong che                                             | Bai kiem                                             |
| --------------------------------- | --------------------------------------------------------- | ---------------------------------------------------- |
| Khong doc cau tra loi             | Be mat DOM 11 thao tac, chi ghi                           | `browser-target` 16 — cay DOM co min, cham vao la do |
| Khong van xuoi GitHub qua cau noi | Khung IPC khong co truong van ban; ban mau tu kiem dau ra | `input-only-contract` 19                             |
| Khong bi mat trong cau hinh       | Danh sach trang khoa + quet de quy theo TU                | `config-and-logs`                                    |
| Khong cong vao                    | Quet ma nguon + hoi Node ve tai nguyen dang song          | `native-host` 24                                     |
| Khong danh thuc cho HEAD cu       | Doc PR SONG moi lan, khong bo nho dem                     | `exact-head` 6-8                                     |
| Khong danh thuc hai lan           | So ghi TRUOC khi gui, ca hai phia                         | `idempotency` 9-11                                   |
| Chi cuoc hoi thoai da arm         | Quyen host xin luc arm cho dung mot duong dan             | `browser-target` 12-14                               |
