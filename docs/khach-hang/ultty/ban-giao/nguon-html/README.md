# Nguồn HTML của bộ PDF bàn giao Ultty

3 file HTML ở đây là **nguồn** để tái sinh 3 PDF dành cho lãnh đạo (giọng phi kỹ thuật). Sửa nội dung → sửa HTML → chạy lệnh dưới. Mermaid nạp qua CDN nên **cần mạng** khi render.

## Tái sinh PDF (Edge headless, có sẵn trên Windows)

```powershell
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
foreach ($n in @("01-nghiep-vu-gd1-2026-08","02-so-do-he-thong-gd1-2026-08","03-lo-trinh-phat-trien-2026-08")) {
  $html = (Resolve-Path "docs/khach-hang/ultty/ban-giao/nguon-html/$n.html").Path -replace '\\','/'
  Start-Process -FilePath $edge -Wait -ArgumentList @(
    "--headless","--disable-gpu","--no-pdf-header-footer",
    "--virtual-time-budget=25000",           # chờ mermaid render xong rồi mới in
    "--print-to-pdf=`"$PWD\docs\khach-hang\ultty\ban-giao\$n.pdf`"",
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
- **Chi tiết kỹ thuật:** [nghiệp vụ Ultty](../../nghiep-vu/mo-ta-nghiep-vu.md) · [kiến trúc hệ thống](../../../../kien-truc/he-thong.md) · [trạng thái](../../../../phat-trien/ke-hoach/tong-quan.md) · [kế hoạch dài hạn](../../../../phat-trien/ke-hoach/tinh-nang-dai-han.md). Sửa tài liệu nguồn trước, rồi phản ánh bản rút gọn vào HTML.
- **3 PDF đã tái sinh ngày 12/08/2026** từ nguồn HTML v2.1 sau khi đồng bộ quyết định Giai đoạn 1 mới nhất. Khi nghiệp vụ/kỹ thuật đổi tiếp, sửa `.md` trước, phản ánh bản rút gọn vào HTML rồi tái sinh và kiểm tra hình ảnh.
