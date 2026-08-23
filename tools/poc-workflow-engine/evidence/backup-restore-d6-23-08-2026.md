# D6 — bằng chứng backup/restore của workflow engine (23/08/2026)

**Chạy trên `deploy/netviet/compose.yaml` THẬT**, không phải compose POC — trong một compose
project dùng một lần `zalo-d6proof` (`STACK_SLUG=d6proof`). Stack `pocwf` **không bị đụng tới**
(D9-b còn cần nó không reset volume).

Mục đích kép: (a) chứng minh backup/restore của engine, (b) chạy thử chính hồ sơ compose của D2
trên hạ tầng thật trước khi nó được dùng ở D8.

---

## 1. Compose production tự nó có lên được không — CÓ

```
docker compose --env-file <fake.env> -f compose.yaml --profile workflow up -d --wait hatchet-engine
```

```
hatchet-migration      Exited (0)
hatchet-setup-config   Exited (0)
hatchet-postgres       Healthy
hatchet-engine         Healthy
```

Chuỗi `postgres → migration → setup-config → engine` chạy đúng thứ tự bằng `depends_on`, và
**healthcheck `wget http://127.0.0.1:8733/ready` của D2 đạt** — tức số cổng 8733 không phải phỏng
đoán từ tài liệu mà là hành vi thật của `v0.101.27`.

---

## 2. Trạng thái TRƯỚC khi backup

| Chỉ số | Giá trị |
|---|---|
| tenant | 2 (`internal`, `default`) |
| bảng `public` | 182 |
| tenant `default` | `707d0855-80ab-4e1f-a156-f1c4546cbf52` |
| sha256(dòng `masterKeyset`), 16 ký tự đầu | `d71d31b244ee32a7` |

## 3. Backup — đúng hai lệnh mà `backup.sh` chạy

```
pg_dump --username hatchet --format=custom --no-owner --dbname hatchet   -> 602 109 B (header PGDMP)
tar czf - -C /hatchet/config .                                           ->   3 092 B
```

`tar tzf` đọc lại được: `./`, `./database.yaml`, `./server.yaml`.

> ⚠️ **Chỉ trên máy dev Windows:** Git Bash biến `-C /hatchet/config` thành
> `C:/Program Files/Git/hatchet/config`. Dùng `-C //hatchet/config` (hoặc `MSYS_NO_PATHCONV=1`).
> Đây là **quirk của MSYS**, không phải lỗi của `backup.sh` — script đó chạy trên VM Linux.

---

## 4. CA DƯƠNG — `down -v` rồi phục hồi cả hai thứ

Thứ tự (quan trọng): `down -v` → `up hatchet-postgres` → `pg_restore` → **phục hồi volume
`hatchet-config`** → `up hatchet-engine` (migration + `setup-config --overwrite=false` chạy lại).

| Chỉ số | Trước | Sau restore |
|---|---|---|
| tenant | 2 | **2** |
| bảng `public` | 182 | **182** |
| tenant `default` | `707d0855-…` | **`707d0855-…`** |
| `masterKeyset` sha | `d71d31b244ee32a7` | **`d71d31b244ee32a7`** |
| digest ảnh engine đang chạy | — | `sha256:b77689e3c928…` = **đúng digest đã ghim** |

⇒ `--overwrite=false` **giữ đúng lời hứa**: quickstart chạy lại trên config đã phục hồi mà
**không** sinh khoá mới.

---

## 5. CA ÂM — phục hồi dump NHƯNG mất volume `hatchet-config`

Đây là khẳng định mà cả D6 đứng trên. Làm lại y hệt, **cố ý bỏ bước phục hồi volume config**:

```
masterKeyset sha SAU  = 52fee1916a6eac30
masterKeyset sha GỐC  = d71d31b244ee32a7
```

| Quan sát | Kết quả |
|---|---|
| engine lên | ✅ **Healthy** |
| bảng `public` | ✅ **182** |
| khoá mã hoá | ❌ **KHÁC HẲN** |

**Đây là chế độ hỏng nguy hiểm nhất: một lần phục hồi XANH ra dữ liệu không đọc được.** Không có
lỗi, không có cảnh báo — `docker ps` xanh, DB đủ bảng, và mọi thứ đã mã hoá bằng khoá cũ là rác.
Mọi token đã phát cũng hết hiệu lực vì `jwt.privateJWTKeyset` mất theo.

**Nội dung `server.yaml` (đã kiểm, giá trị che):** `encryption.masterKeyset` ·
`encryption.jwt.privateJWTKeyset` · `encryption.jwt.publicJWTKeyset`.

⇒ **Dump Postgres một mình nó KHÔNG phải là backup.** `backup.sh` nay lấy cả hai, và
`restore-check.sh` nói rõ giới hạn của nó: nó chứng minh *dump đọc lại được*, **không** chứng minh
*dữ liệu giải mã được*.

---

## 6. Số cho D7 (phần thêm của cụm Hatchet)

**RAM lúc rảnh** — cụm engine, **chưa có worker**:

| Container | RAM |
|---|---|
| `hatchet-postgres` | 204,9 MiB |
| `hatchet-dashboard` | 28,0 MiB |
| `hatchet-engine` | 19,0 MiB |
| **cộng** | **≈ 252 MiB** |

**Volume** (sau một lần dựng sạch): `hatchet-postgres-data` 72,7 MB · `hatchet-config` 6,4 kB ·
`hatchet-certs` 0 B (rỗng — Q2-A `--skip certs`).

**Ảnh trên đĩa** (một lần, dùng chung mọi stack trên cùng VM):

| Ảnh | Kích thước |
|---|---|
| `postgres:15.6` | 608 MB |
| `hatchet-dashboard` | 184 MB |
| `hatchet-admin` | 114 MB |
| `hatchet-engine` | 88,5 MB |
| `hatchet-migrate` | 42 MB |
| **cộng** | **≈ 1,04 GB** |

### Điểm cần quyết ở D7 — KHÔNG tự đổi

`postgres:15.6` (không phải alpine) chiếm **608 MB**, trong khi Postgres nghiệp vụ dùng
`postgres:16-alpine`. `postgres:15-alpine` tiết kiệm ~550 MB đĩa. **Chưa đổi** vì 15.6 là bản
Hatchet kiểm thử trên compose chính thức của họ, và khác biệt musl/glibc là một biến số mới không
ai đo. Ghi ra đây kèm số thật để D7 quyết bằng dung lượng đĩa còn lại của VM, không quyết bằng cảm
giác.

### Chưa đo được ở đây

**RAM của `workflow-worker-v1`** — nó cần token thật, mà token chỉ có sau
`bootstrap-workflow-engine.sh` trên VM. Phải đo ở D8/D9. Không suy ra từ container `api`: worker
boot `WorkflowWorkerModule` hẹp hơn nhiều, nên lấy số của `api` sẽ là một **con số sai được trình
bày như số đo** — chính kiểu nhãn sai mà phiên 7 đã chặn.

---

## 7. Dọn dẹp

`down -v` — 0 container, 0 volume còn lại của `zalo-d6proof`. `pocwf` vẫn `Up 2 hours`.
