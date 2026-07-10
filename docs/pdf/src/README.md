# Nguồn HTML của 3 PDF bàn giao (`docs/pdf/*.pdf`)

3 file HTML ở đây là **nguồn** để tái sinh 3 PDF dành cho lãnh đạo (giọng phi kỹ thuật). Sửa nội dung → sửa HTML → chạy lệnh dưới. Mermaid nạp qua CDN nên **cần mạng** khi render.

## Tái sinh PDF (Edge headless, có sẵn trên Windows)

```powershell
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
foreach ($n in @("01-nghiep-vu-hien-tai","02-so-do-he-thong","03-ke-hoach-dai-han")) {
  $html = (Resolve-Path "docs/pdf/src/$n.html").Path -replace '\\','/'
  Start-Process -FilePath $edge -Wait -ArgumentList @(
    "--headless","--disable-gpu","--no-pdf-header-footer",
    "--virtual-time-budget=25000",           # chờ mermaid render xong rồi mới in
    "--print-to-pdf=`"$PWD\docs\pdf\$n.pdf`"",
    "`"file:///$html`"")
}
```

## Kiểm tra sơ đồ không vỡ (bắt buộc sau khi sửa diagram)

Render `--dump-dom` rồi grep chuỗi lỗi:

```powershell
# errors phải = 0; svg phải = số sơ đồ trong file
$c = <dump-dom output>
([regex]::Matches($c, 'aria-roledescription="error"|Syntax error in text|Unsupported markdown')).Count
```

**2 gotcha mermaid đã dính, đừng lặp lại:**
1. Label bắt đầu bằng `1. ` / `2. ` → mermaid hiểu là markdown list → node hiện "Unsupported markdown: list". Dùng `Bước 1 —` thay vì `1. `.
2. Dấu `;` trong text của sequence diagram → cắt câu lệnh, vỡ cả sơ đồ. Dùng `·` thay `;`.
3. Trong HTML, source mermaid phải **escape** `<` `>` (`&lt;br/&gt;`, `--&gt;`) vì mermaid đọc `textContent`.

## Quy ước nội dung

- **PDF (thư mục cha) = bản cho SẾP/KHÁCH**: không tên biến env, không tên bảng DB/module, không thuật ngữ (intent, rules engine, state machine...). Không dùng chữ "Co-pilot" (dễ nhầm Microsoft Copilot) — viết "chế độ Sale dán tay".
- **Chi tiết kỹ thuật = các .md trong `docs/`**: [nghiep-vu.md](../../nghiep-vu.md) · [so-do-he-thong.md](../../so-do-he-thong.md) · [ke-hoach-dai-han.md](../../ke-hoach-dai-han.md) · [thiet-ke-ky-thuat-hop-nhat.md](../../thiet-ke-ky-thuat-hop-nhat.md). Sửa nghiệp vụ/kỹ thuật thì sửa .md trước, rồi phản ánh bản rút gọn vào HTML.
