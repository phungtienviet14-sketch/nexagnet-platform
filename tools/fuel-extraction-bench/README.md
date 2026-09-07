# Bộ đo bộ đọc ảnh phiếu đổ dầu

Lane C / C3 — Issue #236. Hai script, chạy tay, **không** nằm trong CI.

```bash
# 1. Sinh bộ dữ liệu tổng hợp (7 phiếu + ground-truth.json). Chạy từ apps/web vì Playwright ở đó.
cd apps/web && node ../../tools/fuel-extraction-bench/make-dataset.mjs /duong/dan/bo-du-lieu

# 2. Đo một điểm cuối tương thích OpenAI bất kỳ
FUEL_EXTRACTION_BASE_URL=http://mot-may-chu-noi-bo:8080/v1 \
FUEL_EXTRACTION_MODEL=<tên-mô-hình> \
npx tsx tools/fuel-extraction-bench/run-bench.ts /duong/dan/bo-du-lieu
```

`run-bench.ts` **import thẳng** `ChatCompletionsReceiptExtractor` — adapter đang chạy trong sản
phẩm. Một bộ đo gọi API bằng mã của riêng nó sẽ đo một thứ khác với thứ đang chạy.

## Con số quan trọng nhất không phải độ chính xác

Mà là **SAI MÀ VẪN CHẮC**: số ô vừa đọc sai vừa được báo mức tin từ `FIELD_CONFIDENCE_FLOOR` trở
lên. Đó là nhóm **duy nhất** đi thẳng qua đường rà soát mà không ai nhìn lại — một bộ đọc đạt 92%
chính xác với 0 ô như vậy an toàn hơn một bộ đạt 97% với vài ô.

## Vì sao dữ liệu tổng hợp

Đo bằng ảnh **thật** của khách đòi hai thứ Lane C không có: sự đồng ý bằng văn bản của khách cho
việc gửi ảnh sang một dịch vụ thứ ba, và một chỗ lưu trữ cho chính những bức ảnh đó. Cả hai là
quyết định của **người**, không phải của một lane.

Cái mà một bộ đo **cần** — sự thật gốc chính xác từng ký tự — thì bộ tổng hợp lại mạnh hơn: ở đây
ta _biết_ đáp án vì ta viết ra nó trước khi vẽ.

Bảy phiếu cố ý làm khó theo bảy hướng: dấu tiếng Việt trong tên cửa hàng · dấu phân cách nghìn kiểu
Việt Nam (`1.437.500`) · số lít có phần thập phân ngay cạnh số tiền không có · một dòng **không phải
nhiên liệu** · một phiếu **không ghi biển số** (trường hợp phổ biến nhất theo NĐ 123/2020 Điều 10) ·
ảnh nghiêng và mờ · tên người bán rất dài. Mỗi ảnh đóng dấu **DỮ LIỆU TỔNG HỢP — KHÔNG PHẢI HOÁ ĐƠN
THẬT** ngay trên mặt giấy.

## Bộ đo đã chạy đúng — và mô hình thật thì chưa

Đo ngày 07/09/2026, chạy với một điểm cuối **kịch bản có sẵn** dựng tạm (trả đáp án thật kèm ba lỗi
cố ý). Kết quả đúng như thiết kế: 42 ô chấm, 2 ô sai, **1 lần từ chối tách riêng khỏi ô sai**, và
**1 ô "sai mà vẫn chắc"** được cô lập đúng — trong khi một ô đọc sai _có_ báo mức tin thấp (410) thì
**không** bị tính vào nhóm đó. Điều này chứng minh **bộ đo**, không chứng minh một mô hình nào.

### Chặn thật, đo được, chưa gỡ

| Đường                                               | Trạng thái đo 07/09/2026                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mô hình **tự dựng** (PaddleOCR-VL sau vLLM/PaddleX) | **Chưa có máy chủ nào để trỏ tới.** Adapter đã sẵn sàng: đặt `FUEL_EXTRACTION_BASE_URL` + `_MODEL` là chạy.                                                                                                                                                                                                                                  |
| Claude (bên thứ 3 **đã được duyệt** theo CLAUDE.md) | **Không có khoá dùng được.** Secret duy nhất mang khoá Anthropic là `zalo-ultty-anthropic-api-key` — **của một khách hàng**, và đọc nó nằm ngoài phạm vi được phép của lane này. Stack `transport-preview` **không có** secret Anthropic riêng.                                                                                              |
| DeepSeek                                            | Có `deepseek-v4-flash-vision-exp` (thử nghiệm, tương thích Chat Completions). Khoá trong môi trường **không hợp lệ** (`Authentication Fails`). Và theo CLAUDE.md, DeepSeek **chưa** nằm trong danh sách bên thứ 3 được duyệt cho dữ liệu khách — dữ liệu tổng hợp thì được, ảnh thật thì **không**, cho đến khi có thoả thuận xử lý dữ liệu. |

Không đường nào trong ba đường trên bị chặn bởi **mã**. Cả ba chặn ở **một quyết định của người**:
dựng một máy chủ, hoặc cấp một khoá cho stack này, hoặc bổ sung một nhà cung cấp vào hợp đồng.
