**NETVIET**

GIẢI PHÁP CHUYỂN ĐỔI SỐ & AI

**THIẾT KẾ HỆ THỐNG AI AGENT**

Chăm sóc khách hàng — Tư vấn — Bán hàng qua Zalo & Đa kênh Social

| Khách hàng: Công ty Cổ Phần U Ultty Việt Nam Ngành hàng: Gia dụng cao cấp Người liên hệ: Nguyễn Thu Phương (Sale phụ trách chính) Phiên bản: Bản thiết kế cấu trúc v1.0 — Tháng 7/2026 |
| :---: |

*Tài liệu nội bộ — Không chia sẻ cho bên thứ ba*

# **1\. Tóm tắt điều hành**

Tài liệu này đề xuất cấu trúc thiết kế cho một hệ thống AI Agent phục vụ ba chức năng cốt lõi của U Ultty: chăm sóc khách hàng, tư vấn sản phẩm và hỗ trợ chốt đơn, hoạt động trên Zalo và mở rộng ra các kênh social. Thiết kế bám sát thực tế vận hành mà khảo sát ngày 30/06/2026 đã ghi nhận: khoảng 200 nhóm Zalo chăm sóc thường xuyên, 200–300 đại lý/CTV, trung bình 10–20 đơn sỉ mỗi ngày, chốt đơn chủ yếu bằng tin nhắn text viết tắt không dấu.

**Đặc điểm quyết định kiến trúc:** U Ultty hiện chưa có API, chưa có nhân sự IT, chưa có server, dữ liệu nằm rải rác trên KiotViet, Base và máy tính cá nhân. Vì vậy giải pháp được thiết kế theo hướng **dịch vụ vận hành trọn gói (managed service) trên nền tảng cloud**, giảm tối đa yêu cầu kỹ thuật phía khách hàng, và triển khai theo 3 giai đoạn để kiểm soát rủi ro.

| Khuyến nghị trọng tâm Giai đoạn đầu KHÔNG tự động hoá hoàn toàn trên Zalo cá nhân (rủi ro khoá tài khoản). Ưu tiên mô hình AI Co-pilot: AI đọc hiểu, soạn sẵn câu trả lời và đơn hàng có cấu trúc, Sale duyệt 1 chạm rồi gửi. Chuẩn hoá dữ liệu sản phẩm — giá — chính sách thành một 'nguồn sự thật' duy nhất trước khi bật AI. Đây là yếu tố quyết định độ chính xác. Đo hiệu quả bằng thời gian chốt đơn và tỷ lệ đơn AI bóc tách đúng, không chỉ bằng cảm nhận. |
| :---- |

# **2\. Phân tích hiện trạng & bài toán**

## **2.1. Bức tranh vận hành hiện tại**

| Hạng mục | Hiện trạng ghi nhận từ khảo sát |
| :---- | :---- |
| Kênh giao tiếp | Zalo là kênh chính (nhóm CTV 3–8 thành viên, nhóm đại lý 6–16 thành viên). \~200 nhóm chăm sóc thường xuyên \+ 100–150 nhóm thi thoảng. |
| Quy mô đối tác | 200–300 đại lý/CTV đang hoạt động. Đánh dấu bằng tag thẻ Zalo (Đại lý / CTV / Hội nhóm) hoặc nhớ theo đặc điểm. |
| Khối lượng đơn | 10–20 đơn/ngày, chủ yếu đơn sỉ số lượng lớn; \<20% đơn từ ảnh chụp bảng, còn lại là text. |
| Luồng hệ thống | Zalo → lên đơn KiotViet → xử lý nội bộ trên Base → giao vận Aha/Viettel. Chưa có API kết nối. |
| Sản phẩm | 18–20 SKU chính (chưa tính linh phụ kiện), có bảng thông báo giá theo tháng. |
| Chính sách | 4 nhóm: Công nợ (30/45 ngày), Ký gửi, Thanh toán ngay, COD (có phí thu hộ). |
| Tốc độ chốt | Thường dưới 5 phút/đơn; 1 Sale duyệt cuối, kế toán kiểm tra khi lên hệ thống. |
| Hạ tầng | Chưa có IT, chưa có server, dữ liệu lưu chủ yếu trên máy tính cá nhân \+ KiotViet. |

## **2.2. Điểm nghẽn (pain points)**

* **Phụ thuộc con người:** mọi tư vấn và chốt đơn đều thủ công qua Sale. Khi số nhóm và đơn tăng theo mùa vụ, năng lực xử lý bị giới hạn bởi số người trực.

* **Tin nhắn phi cấu trúc:** khách viết tắt, không dấu ('Gui ve TN cho c', 'gui nhe'), dễ hiểu nhầm mã SP, số lượng, địa chỉ, hình thức thanh toán.

* **Dữ liệu phân mảnh:** giá, chính sách, tồn kho, lịch sử đơn nằm ở nhiều nơi (Zalo, KiotViet, Base, Drive, trí nhớ nhân viên) — không có nguồn tra cứu tức thời, nhất quán.

* **Nhập liệu lặp lại:** cùng một đơn phải gõ lại nhiều lần qua Zalo → KiotViet → Base, dễ sai sót và tốn thời gian.

* **Khó chuẩn hoá chính sách:** việc áp đúng chính sách (công nợ/ký gửi/COD, phí ship, VAT) phụ thuộc kinh nghiệm từng Sale, khó đảm bảo đồng đều.

* **Rủi ro tri thức:** quy trình 'nhớ theo đặc điểm đại lý' khiến tri thức nằm trong đầu nhân viên, mất mát khi thay đổi nhân sự.

## **2.3. Ràng buộc & giả định**

**Sự thật (từ khảo sát):** chưa có API, chưa có IT, chưa có server; yêu cầu bảo mật nội bộ, không cung cấp dữ liệu cho bên thứ ba; ưu tiên triển khai theo giai đoạn 1→2→3; go-live sớm nhất có thể; ngân sách cần tư vấn.

**Giả định cần kiểm chứng:** (1) KiotViet có Public API cho đơn hàng/tồn kho — cần xác nhận gói dịch vụ hiện tại của U Ultty có bật API; (2) Base có API/webhook để đẩy đơn — cần kiểm tra quyền; (3) Zalo đang dùng là tài khoản cá nhân theo nhóm, không phải Zalo OA — điểm này ảnh hưởng lớn tới mức độ tự động hoá (xem mục 4.1).

*Lưu ý về độ chắc chắn: các nhận định về khả năng tích hợp cần được xác nhận bằng tài liệu API thực tế trước khi lập trình. Phần thiết kế dưới đây nêu rõ đâu là phương án chắc chắn, đâu là phương án phụ thuộc điều kiện.*

# **3\. Kiến trúc tổng thể hệ thống**

Hệ thống được tổ chức thành 6 tầng (layer) tách biệt, cho phép thay thế/nâng cấp từng phần mà không phá vỡ tổng thể. Dữ liệu chảy từ kênh giao tiếp vào lõi AI, qua bộ luật nghiệp vụ, ra hệ thống vận hành và quay lại người dùng.

## **3.1. Sơ đồ 6 tầng**

| Tầng | Vai trò & thành phần chính |
| :---- | :---- |
| 1\. Kênh (Channel) | Điểm tiếp xúc khách/đại lý: Zalo (nhóm & OA), Facebook/Messenger, TikTok, Website/Landing. Chuẩn hoá mọi tin nhắn về một định dạng chung. |
| 2\. Tiếp nhận (Ingestion) | Cổng thu nhận tin nhắn, hàng đợi (message queue), gán danh tính người gửi (đại lý/CTV/khách), lưu vết hội thoại. |
| 3\. Lõi AI (AI Core) | Chuẩn hoá tiếng Việt (thêm dấu, giải nghĩa viết tắt) → nhận diện ý định (intent) → bóc tách thực thể (mã SP, SL, địa chỉ) → điều phối hội thoại (LLM \+ công cụ) → tri thức RAG. |
| 4\. Luật nghiệp vụ (Business Rules) | Áp giá theo cấp đại lý, tính phí ship, chọn chính sách (công nợ/ký gửi/COD), tính VAT, sinh đơn chuẩn TH1/TH2, checklist chốt đơn. |
| 5\. Tích hợp (Integration) | Kết nối KiotViet (đơn \+ tồn kho), Base (duyệt & giao vận), đơn vị vận chuyển (Aha/Viettel), hoá đơn VAT. |
| 6\. Dữ liệu & Quản trị | Nguồn sự thật sản phẩm–giá–chính sách, hồ sơ đại lý (CRM), kho lịch sử đơn, dashboard giám sát, phân quyền & bảo mật. |

| Luồng dữ liệu tiêu biểu (1 đơn hàng) Khách nhắn 'gui 10 ghe felix ve TN cho c, ko lay VAT' → (2) hệ thống nhận, nhận diện đại lý Meta HN → (3) AI thêm dấu & hiểu: 10 x Ghế Felix, giao Thái Nguyên, không xuất VAT → (4) tra giá đại lý, tính phí ship, chọn chính sách → (3) AI soạn 'format xác nhận đơn' \+ checklist → Sale duyệt 1 chạm → (5) đẩy đơn sang KiotViet/Base → (6) lưu lịch sử, cập nhật công nợ. |
| :---- |

# 

# **4\. Kiến trúc kỹ thuật chi tiết**

## **4.1. Tích hợp Zalo — điểm mấu chốt cần quyết định sớm**

**Đây là rủi ro kỹ thuật lớn nhất và cần chốt trước tiên.** Zalo không cung cấp API chính thức cho tài khoản cá nhân và chat nhóm. Việc dùng bot tự động gửi/nhận trên tài khoản Zalo cá nhân qua công cụ giả lập là vi phạm điều khoản Zalo và có rủi ro bị khoá tài khoản — trong khi 200 nhóm hiện tại đang chạy trên tài khoản cá nhân.

Ba phương án, so sánh ưu/nhược:

| Phương án | Cách hoạt động | Ưu điểm | Nhược điểm / rủi ro |
| :---- | :---- | :---- | :---- |
| A. AI Co-pilot (khuyến nghị GĐ1) | AI đọc hội thoại, soạn sẵn trả lời \+ đơn có cấu trúc; Sale duyệt & gửi thủ công. | An toàn tài khoản, tuân thủ ToS; giữ được giọng người thật; triển khai nhanh. | Vẫn cần người bấm gửi; mức tự động hoá \~60–70%. |
| B. Zalo OA (Official Account) | Chuyển tương tác 1:1 CSKH sang Zalo OA có API chính thức. | API hợp pháp, ổn định, gửi tin tự động, ZNS. | OA không hỗ trợ chat nhóm; cần khách kết bạn OA; thay đổi thói quen. |
| C. Nền tảng tự động hoá Zalo bên thứ ba | Dùng dịch vụ automation Zalo cá nhân/nhóm. | Tự động hoá cao trên chính nhóm hiện có. | Vùng xám ToS, rủi ro khoá tài khoản, phụ thuộc nhà cung cấp; xung đột yêu cầu bảo mật. |

**Đề xuất:** Giai đoạn 1 dùng phương án A (Co-pilot) cho các nhóm hiện tại \+ phương án B (OA) cho luồng CSKH 1:1 với khách lẻ. Đánh giá phương án C chỉ khi có cam kết rõ ràng về rủi ro. Quyết định này nên do ban lãnh đạo U Ultty xác nhận vì liên quan trực tiếp tới tài sản 200 nhóm.

## **4.2. Kênh social khác**

* **Facebook Page / Messenger & Instagram:** có Graph API chính thức, hỗ trợ bot tự động đầy đủ — nên là kênh 'sạch' để tự động hoá cao ngay từ đầu.

* **TikTok:** tương tác qua bình luận/tin nhắn hạn chế API; xử lý theo hướng tiếp nhận lead rồi điều hướng về Zalo/OA.

* **Website/Landing:** gắn widget chat AI, đóng vai điểm thu lead và tư vấn 24/7, đồng bộ hồ sơ về CRM.

## **4.3. Lõi AI — pipeline xử lý tin nhắn**

Mỗi tin nhắn đi qua chuỗi bước sau. Đây là nơi giải quyết bài toán 'viết tắt, không dấu' và bóc tách đơn.

1. **Chuẩn hoá ngôn ngữ:** thêm dấu tiếng Việt, giải nghĩa viết tắt theo từ điển riêng (TN→Thái Nguyên, OCP→Ocean Park, 'c'→chị, 'ck'→chuyển khoản...). Từ điển này học dần từ dữ liệu thật của U Ultty.

2. **Nhận diện ý định (Intent):** phân loại tin nhắn vào nhóm: hỏi sản phẩm, hỏi giá, đặt đơn, hỏi chính sách/công nợ, khiếu nại/bảo hành, hỏi vận chuyển, tán gẫu/khác.

3. **Bóc tách thực thể (Entity):** trích mã/tên SP, số lượng, người nhận, địa chỉ, hình thức ship, thanh toán, VAT — ánh xạ về danh mục SKU chuẩn.

4. **Truy xuất tri thức (RAG):** tra cứu từ kho tri thức (giá, tồn kho, chính sách, thông số, bảo hành) để trả lời đúng dữ liệu công ty thay vì 'bịa'.

5. **Điều phối hội thoại (Orchestrator):** LLM đóng vai điều phối, gọi các 'công cụ' (tra giá, tính ship, tạo đơn) và quyết định trả lời hay chuyển người thật.

6. **Sinh phản hồi & đơn:** tạo câu trả lời đúng giọng NetViet/U Ultty và 'format xác nhận đơn' chuẩn TH1/TH2 để Sale duyệt.

| Vì sao cần RAG \+ 'nguồn sự thật' LLM nếu không có dữ liệu công ty sẽ trả lời chung chung hoặc sai giá/chính sách. Giải pháp: mọi câu trả lời về giá — tồn kho — chính sách — bảo hành đều bắt buộc truy xuất từ kho dữ liệu đã chuẩn hoá, có nguồn tham chiếu. Không có dữ liệu → AI hỏi lại hoặc chuyển người thật, không đoán. |
| :---- |

## **4.4. Tích hợp hệ thống vận hành**

| Hệ thống | Vai trò | Cách tích hợp đề xuất |
| :---- | :---- | :---- |
| KiotViet | Lên đơn, kiểm kho | Ưu tiên Public API (đơn/tồn kho/khách). Nếu chưa bật API: dùng bán tự động (xuất/nhập file Excel) ở GĐ1. |
| Base | Duyệt đơn, giao vận nội bộ | Kiểm tra API/webhook. Nếu không có: AI sinh đơn đúng định dạng để dán vào Base, tự động hoá dần. |
| Aha / Viettel | Vận chuyển | Tính cước theo vùng (Grab nội thành HN/HCM, Viettel tỉnh); tích hợp API vận đơn ở GĐ2–3. |
| Hoá đơn VAT | Xuất hoá đơn | Giữ quy trình kế toán duyệt; AI chuẩn bị sẵn thông tin xuất (STK công ty/cá nhân, có/không VAT). |

**Nguyên tắc:** thiết kế 'API-first nhưng không phụ thuộc API'. Nơi nào có API thì tự động hoá hoàn toàn; nơi nào chưa có, AI vẫn tạo ra đầu ra chuẩn để con người thao tác 1 chạm, và nâng cấp lên tự động khi API sẵn sàng.

## **4.5. Hạ tầng & bảo mật**

* **Hạ tầng:** triển khai trên cloud dạng managed service do NetViet vận hành, vì U Ultty chưa có IT/server. Khách không cần quản trị kỹ thuật.

* **Mô hình vận hành:** NetViet chịu trách nhiệm hạ tầng, giám sát, cập nhật; U Ultty chỉ dùng dashboard và duyệt nội dung.

* **Bảo mật dữ liệu:** dữ liệu đại lý/khách được mã hoá, phân quyền theo vai trò (Sale/Kế toán/Quản lý), nhật ký truy cập. Tuân thủ yêu cầu 'không cung cấp cho bên thứ ba' — dữ liệu cô lập theo khách hàng.

* **Sao lưu & liên tục:** sao lưu định kỳ lịch sử hội thoại và đơn; có phương án dự phòng khi một kênh gặp sự cố.

# **5\. Thiết kế Agent & luồng nghiệp vụ**

Thay vì một 'chatbot' đơn khối, hệ thống dùng nhiều agent chuyên trách phối hợp dưới một agent điều phối. Cách này giúp mỗi agent làm tốt một việc, dễ kiểm soát chất lượng và mở rộng.

## **5.1. Bản đồ các Agent**

| Agent | Nhiệm vụ |
| :---- | :---- |
| Điều phối (Router) | Nhận diện ý định, xác định người gửi (đại lý/CTV/khách lẻ), phân luồng tới agent phù hợp, quyết định khi nào chuyển người thật. |
| Tư vấn sản phẩm | Trả lời tính năng, công năng, hình ảnh/video, so sánh SKU — dựa trên kho tri thức sản phẩm. |
| Bán hàng & chốt đơn | Bóc tách đơn từ tin nhắn, áp giá, chạy checklist chốt đơn, sinh 'format xác nhận đơn' TH1/TH2. |
| Chính sách & tài chính | Xử lý công nợ (30/45 ngày), ký gửi, COD/phí thu hộ, VAT; nhắc điều kiện áp dụng theo cấp đại lý. |
| Hậu mãi & bảo hành | Tiếp nhận lỗi/đổi trả theo quy trình 7 ngày / ngoài 7 ngày / giao sai-thiếu; định tuyến sang nhóm kỹ thuật. |
| Giám sát (Supervisor) | Theo dõi chất lượng trả lời, phát hiện trường hợp rủi ro (đơn lớn, khiếu nại gắt), leo thang cho người thật. |

## **5.2. Taxonomy ý định (Intent) & hành động**

| Ý định khách | Ví dụ tin nhắn | Hành động AI |
| :---- | :---- | :---- |
| Hỏi sản phẩm | 'ghe felix dung nhu the nao' | Tra tri thức SP, gửi mô tả \+ ảnh/video. |
| Hỏi giá | 'bao nhieu tien c oi' | Tra bảng giá theo cấp đại lý, báo giá. |
| Đặt đơn | 'gui 10 ghe felix ve TN' | Bóc tách đơn → checklist → format xác nhận. |
| Chính sách/công nợ | 'thang nay cong no dc ko' | Kiểm tra cấp đại lý & điều kiện, trả lời. |
| Bảo hành/khiếu nại | 'ghe bi loi 1 cai' | Chạy quy trình bảo hành, chuyển kỹ thuật. |
| Vận chuyển | 'khi nao hang toi' | Tra trạng thái vận đơn / báo thời gian giao. |

## **5.3. Luồng chốt đơn tự động (số hoá checklist hiện tại)**

AI số hoá đúng checklist 5 bước mà Sale đang làm, đảm bảo không bỏ sót:

1. **Xác định hình thức ship:** đơn ≥2 SP miễn ship; đơn 1 SP tính cước (Grab nội thành HN/HCM, Viettel ở tỉnh) — AI tự đề xuất phí.

2. **Xác định thanh toán:** có thu hộ (tính phí COD) hay CK trước; AI nêu rõ phí thu hộ theo biểu mẫu để đại lý xác nhận.

3. **Xác định VAT:** có/không xuất VAT; nếu có → gửi thông tin STK công ty, chuẩn bị dữ liệu cho kế toán.

4. **Sinh format xác nhận đơn:** dựng đúng mẫu TH1 hoặc TH2 (kèm SĐT/địa chỉ khách, cước, thu hộ/không) để chốt lại với đại lý.

5. **Nhắc chụp ảnh gửi hàng:** sau khi gửi, nhắc/đính kèm ảnh đã gửi vào nhóm — khép kín quy trình.

| Mẫu đơn mục tiêu AI sinh ra TH1: HN\_30.6\_Meta HN — 10 x Ghế Felix — 1.150k/SP — Tổng: 11.500.000đ TH2: HN\_30.6\_Meta HN\_Chị Lan — 0912xxxxxx / Thái Nguyên — 10 x Ghế Felix — 1.150k — Cước: 50k — Thu hộ — Tổng: 11.550.000đ Toàn bộ do AI dựng từ tin nhắn thô; Sale chỉ kiểm tra & xác nhận. |
| :---- |

## **5.4. Xử lý chính sách theo cấp đại lý**

| Chính sách | Điều kiện áp dụng | Cách AI xử lý |
| :---- | :---- | :---- |
| Công nợ 30/45 ngày | Đại lý lấy SL lớn (20–100 SP) | Nhận diện cấp đại lý → xác nhận hạn công nợ → ghi nhận vào theo dõi. |
| Ký gửi | Chỉ 2–3 bên | Đánh dấu đơn ký gửi → cuối tháng đối soát số bán → chuyển thành đơn bán \+ VAT. |
| Thanh toán ngay | CTV số lượng nhỏ | Yêu cầu CK trước khi gửi hàng. |
| COD / thu hộ | Giao cho khách của đại lý | Tính phí thu hộ theo biểu mẫu, báo trước để đại lý/CTV xác nhận. |

## **5.5. Luồng hậu mãi & bảo hành**

* **Trong 7 ngày đầu, lỗi NSX:** báo nhóm → kiểm tra lịch sử/thời gian mua → chuyển kỹ thuật xác nhận lỗi → còn nguyên đai kiện/vỏ hộp → đổi mới 1-1.

* **Quá 7 ngày:** báo nhóm → kiểm tra lịch sử → kỹ thuật tiếp nhận case bảo hành (18–36 tháng) và làm việc với khách.

* **Giao sai/thiếu SP:** báo nhóm → kiểm tra khâu đóng hàng bên giao vận → đúng lỗi thì gửi bù.

AI đóng vai tiếp nhận, phân loại đúng nhánh và tạo phiếu theo dõi; **mọi xác nhận lỗi kỹ thuật vẫn do nhóm kỹ thuật quyết định** — AI không tự phán lỗi.

## **5.6. Nguyên tắc chuyển người thật (Human handoff)**

* Đơn giá trị lớn/bất thường, hoặc đại lý có deal riêng ngoài bảng giá chung.

* Khiếu nại gay gắt, tình huống ngoài kịch bản, hoặc AI có độ tin cậy thấp.

* Yêu cầu liên quan pháp lý/hợp đồng/công nợ đang tranh chấp.

**Triết lý:** AI xử lý phần lặp lại — tra cứu, bóc tách, soạn thảo; con người giữ quyền quyết định ở các điểm rủi ro. Điều này vừa an toàn vừa giữ trải nghiệm 'người thật' mà đại lý quen thuộc.

# **6\. Lộ trình triển khai 3 giai đoạn**

Bám theo ưu tiên 1→2→3 của U Ultty và mục tiêu go-live sớm. Mỗi giai đoạn có giá trị dùng được ngay, giảm rủi ro 'làm lớn một lần'.

## **Giai đoạn 1 — Nền tảng & Co-pilot (mục tiêu: chạy được sớm)**

* Chuẩn hoá 'nguồn sự thật': danh mục 18–20 SKU, bảng giá theo cấp, 4 chính sách, mẫu PO/biên bản, từ điển viết tắt.

* Bật lõi AI: chuẩn hoá tiếng Việt \+ intent \+ bóc tách đơn TH1/TH2 \+ tư vấn sản phẩm bằng RAG.

* Chế độ AI Co-pilot trên Zalo: soạn sẵn trả lời \+ đơn, Sale duyệt 1 chạm. Tích hợp bán tự động với KiotViet (Excel) nếu chưa có API.

* Dashboard cơ bản: theo dõi hội thoại, đơn AI bóc tách, tỷ lệ cần sửa.

**Kết quả kỳ vọng:** giảm thời gian soạn đơn/tư vấn, chuẩn hoá format đơn, đặt nền dữ liệu cho tự động hoá sâu hơn.

## **Giai đoạn 2 — Tự động hoá & Đa kênh**

* Tích hợp API thực: KiotViet (đơn/tồn kho), Base (đẩy đơn/duyệt), vận đơn Aha/Viettel.

* Mở kênh social có API sạch: Facebook/Messenger, Website widget, tiếp nhận lead TikTok.

* Zalo OA cho CSKH 1:1 khách lẻ (tin tự động, ZNS nhắc đơn/công nợ).

* Tự động hoá luồng chính sách: công nợ, ký gửi đối soát cuối tháng, COD/VAT.

**Kết quả kỳ vọng:** giảm nhập liệu lặp lại, đồng bộ đơn xuyên hệ thống, phủ nhiều kênh.

## **Giai đoạn 3 — Tối ưu & Mở rộng**

* Phân tích nâng cao: dự báo nhu cầu mùa vụ, cảnh báo tồn kho, xếp hạng đại lý theo doanh số/công nợ.

* Chủ động chăm sóc: AI gợi ý up-sell/cross-sell, nhắc tái đặt hàng, chiến dịch theo nhóm đại lý.

* Mở rộng tự động hoá Zalo (nếu chọn phương án phù hợp ToS) và tối ưu độ chính xác bóc tách đơn.

* Chuyển giao & đào tạo: tài liệu vận hành, hỗ trợ khi U Ultty có IT nội bộ.

**Kết quả kỳ vọng:** từ 'trợ lý phản hồi' tiến tới 'trợ lý chủ động thúc đẩy doanh số'.

## **6.1. Tóm tắt phạm vi theo giai đoạn**

| Hạng mục | Giai đoạn 1 | Giai đoạn 2 | Giai đoạn 3 |
| :---- | :---- | :---- | :---- |
| Kênh | Zalo (Co-pilot) | \+ Messenger, Web, OA, TikTok lead | Tối ưu toàn kênh |
| AI | Tư vấn \+ bóc tách đơn | \+ tự động chính sách | \+ dự báo, chủ động |
| Tích hợp | Bán tự động (Excel) | API KiotViet/Base/vận đơn | Đồng bộ toàn trình |
| Con người | Duyệt 1 chạm | Duyệt trường hợp rủi ro | Giám sát & chiến lược |

# 

# **7\. Chỉ số đo lường & rủi ro**

## **7.1. KPI đề xuất**

| Chỉ số | Ý nghĩa | Mục tiêu tham chiếu\* |
| :---- | :---- | :---- |
| Tỷ lệ đơn AI bóc tách đúng | Độ chính xác cốt lõi | ≥ 90% sau GĐ1 ổn định |
| Thời gian chốt đơn TB | Hiệu suất vận hành | Giảm so với mốc \<5 phút hiện tại |
| Tỷ lệ trả lời cần sửa | Chất lượng hội thoại | Giảm dần theo thời gian huấn luyện |
| Tỷ lệ chuyển người thật | Mức tự động hoá | Hợp lý theo độ phức tạp đơn |
| Mức độ phủ kênh | Độ rộng triển khai | Tăng dần qua GĐ2–3 |

*\*Mục tiêu con số cụ thể cần chốt cùng U Ultty dựa trên dữ liệu nền thực tế; đây là giá trị tham chiếu, không phải cam kết.*

## **7.2. Rủi ro & giảm thiểu**

| Rủi ro | Ảnh hưởng | Giảm thiểu |
| :---- | :---- | :---- |
| Khoá tài khoản Zalo nếu tự động hoá sai cách | Mất kênh với 200 nhóm | GĐ1 dùng Co-pilot; chỉ tự động qua kênh có API chính thức. |
| Dữ liệu nền chưa chuẩn | AI trả lời sai giá/chính sách | Chuẩn hoá 'nguồn sự thật' trước khi bật AI. |
| Chưa có API KiotViet/Base | Hạn chế tự động hoá | Bán tự động ở GĐ1, nâng cấp khi có API. |
| Chưa có IT nội bộ | Khó vận hành kỹ thuật | NetViet vận hành managed service, đào tạo dần. |
| Ngôn ngữ viết tắt đa dạng | Bóc tách sai | Từ điển học liên tục \+ người duyệt ở GĐ đầu. |

# **8\. Khuyến nghị & bước tiếp theo**

1. Chốt phương án Zalo (A/B/C ở mục 4.1) — quyết định của lãnh đạo U Ultty vì liên quan tài sản 200 nhóm.

2. Cung cấp & xác nhận dữ liệu nền: danh mục SKU, bảng giá theo cấp, mẫu PO/biên bản, 20–30 tin nhắn đặt hàng thật (đã có link Drive trong khảo sát).

3. Kiểm chứng khả năng API của KiotViet và Base (gói dịch vụ, quyền truy cập).

4. Thống nhất phạm vi & KPI Giai đoạn 1, ngân sách và mốc go-live.

5. NetViet dựng bản chạy thử (pilot) trên 1–2 nhóm đại lý để đo độ chính xác trước khi mở rộng.

| Tinh thần thiết kế Bắt đầu an toàn và nhanh (Co-pilot), chuẩn hoá dữ liệu làm gốc, rồi tự động hoá sâu dần theo năng lực tích hợp thực tế. Mỗi giai đoạn tạo giá trị dùng được ngay — không chờ 'làm xong hết mới dùng'. |
| :---- |

**— NetViet · Giải pháp Chuyển đổi số & AI —**