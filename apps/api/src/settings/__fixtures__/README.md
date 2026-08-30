# Fixture của importer A4

`a4-mau-dai-ly-nhom.xlsx` là **bản sao đầu ra của generator**, không phải tài liệu của khách:

```bash
python tools/excel-template/generate_a4_template.py
cp docs/khach-hang/ultty/trao-doi/a4-dai-ly-map-nhom-ultty.xlsx \
   apps/api/src/settings/__fixtures__/a4-mau-dai-ly-nhom.xlsx
```

Ba đại lý + hai nhóm bên trong là **dòng ví dụ tổng hợp** (`DEALER_ROWS` / `GROUP_ROWS` trong
generator), cột Chat ID để trống. Không có định danh nào của khách.

Vì sao fixture nằm ở đây chứ không trỏ thẳng vào `docs/khach-hang/`: bản `.xlsx` gửi khách là một
**bản build**, không được commit (xem `.gitignore` và
[nguon-khach-hang.md](../../../../../docs/phat-trien/van-hanh/nguon-khach-hang.md)). Bài test cần
một tệp **cố định** để chứng minh importer đọc đúng bố cục cột — nên nó giữ bản sao của chính
mình, và bản sao đó chứng minh được nguồn gốc bằng lệnh ở trên.
