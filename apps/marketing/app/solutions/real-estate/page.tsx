import type { Metadata } from 'next';
import Link from 'next/link';
import { Navbar } from '../../../components/Navbar';
import { Footer } from '../../../components/Footer';
import { DemoCTA } from '../../../components/DemoCTA';
import { INDUSTRIES_DATA } from '../../../data/industries';

export const metadata: Metadata = {
  title: 'Chatbot AI cho Bất động sản — Tư vấn dự án, lọc ngân sách & thu lead 24/7 | nexagnet',
  description:
    'Chatbot AI cho Bất động sản giúp chủ đầu tư và sàn môi giới tự động hóa tư vấn mặt bằng, gửi bảng giá, lọc khách theo ngân sách và đặt lịch xem nhà mẫu tự động 24/7.',
  keywords: [
    'Chatbot AI bất động sản',
    'AI tư vấn nhà đất',
    'Thu lead bất động sản',
    'Chatbot gửi bảng giá căn hộ',
    'Tự động hóa sales bất động sản',
  ],
  alternates: {
    canonical: 'https://nexagnet247.com/solutions/real-estate',
  },
};

const TOC_SECTIONS = [
  { id: 'muc-1', num: '01', title: 'Chatbot AI cho bất động sản hỗ trợ tư vấn khách hàng như thế nào' },
  { id: 'muc-2', num: '02', title: 'Các tình huống bất động sản có thể ứng dụng chatbot AI' },
  { id: 'muc-3', num: '03', title: 'Từ khách truy cập website đến khách hàng tiềm năng' },
  { id: 'muc-4', num: '04', title: 'Chatbot AI giúp sales bất động sản tập trung vào khách có nhu cầu thực' },
  { id: 'muc-5', num: '05', title: 'Kho kiến thức bất động sản làm nền tảng cho chatbot AI' },
  { id: 'muc-6', num: '06', title: 'Kiểm soát thông tin và ràng buộc an toàn khi AI tư vấn bất động sản' },
  { id: 'muc-7', num: '07', title: 'nexagnet AI Agent cho doanh nghiệp bất động sản' },
  { id: 'muc-8', num: '08', title: 'Chatbot AI phù hợp với những mô hình bất động sản nào' },
  { id: 'muc-9', num: '09', title: 'Câu hỏi thường gặp về chatbot AI cho bất động sản' },
  { id: 'muc-10', num: '10', title: 'Biến website & mạng xã hội bất động sản thành kênh thu lead 24/7' },
];

const FAQS_LIST = [
  {
    q: 'Chatbot AI có thể tư vấn thông tin dự án chi tiết không?',
    a: 'Có. Chatbot trả lời dựa trên dữ liệu dự án thật do doanh nghiệp cung cấp, gồm vị trí, tiến độ, mặt bằng layout từng căn, tiện ích nội ngoại khu và tình trạng pháp lý đã xác nhận.',
  },
  {
    q: 'Chatbot AI có thể tự động thu thập và phân loại khách hàng tiềm năng không?',
    a: 'Có. Chatbot khéo léo ghi nhận số điện thoại, nhu cầu căn hộ, ngân sách dự kiến và thời điểm quan tâm ngay trong ngữ cảnh hội thoại tự nhiên, sau đó phân loại lead và gửi về CRM/Google Sheets.',
  },
  {
    q: 'Chatbot AI có trả lời sai giá hoặc chính sách khuyến mãi không?',
    a: 'Không. Với kiến trúc của nexagnet, AI chỉ trích xuất thông tin giá trong phạm vi bảng giá đã được kiểm duyệt. Đối với các yêu cầu đàm phán giá hoặc chính sách riêng biệt, bot sẽ tự động chuyển tiếp cho nhân viên phụ trách.',
  },
  {
    q: 'Hệ thống có tích hợp được trên Fanpage Facebook và Zalo của dự án không?',
    a: 'Có. nexagnet hỗ trợ kết nối đa kênh đồng thời: nhúng Widget trực tiếp lên website dự án (chỉ với 1 dòng mã), kết nối Fanpage Messenger và Zalo OA/cá nhân của Sales.',
  },
  {
    q: 'Chatbot AI có thể tư vấn pháp lý bất động sản phức tạp không?',
    a: 'Chatbot cung cấp thông tin pháp lý cơ bản của dự án theo tài liệu chính thức (quyết định 1/500, giấy phép xây dựng, sổ hồng mẫu). Khi gặp các câu hỏi pháp lý chuyên sâu hoặc tranh chấp, bot chủ động chuyển giao cho bộ phận pháp chế/chuyên gia tư vấn trực tiếp.',
  },
  {
    q: 'Chatbot AI có thay thế nhân viên sales bất động sản không?',
    a: 'Không. Chatbot đóng vai trò là trợ lý đắc lực tiếp đón ban đầu, trực ngoài giờ 24/7 và sàng lọc lead chất lượng, giúp đội ngũ sales tập trung thời gian gọi điện, hẹn gặp và chốt giao dịch với những khách hàng có nhu cầu thực tế nhất.',
  },
];

export default function RealEstateSolutionPage() {
  const otherIndustries = INDUSTRIES_DATA.filter((i) => i.slug !== 'real-estate');

  return (
    <div className="marketing-page-root">
      <Navbar />

      <main className="solution-deepdive-main">
        {/* Breadcrumb & Hero */}
        <section className="deepdive-hero-section">
          <div className="container">
            <div className="breadcrumb-nav">
              <Link href="/solutions" className="back-link">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M10 12.5L5.5 8L10 3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Quay lại Danh mục giải pháp</span>
              </Link>
            </div>

            <div className="deepdive-hero-content text-center">
              <div className="section-eyebrow justify-center">
                <span className="section-eyebrow-dot" aria-hidden="true" />
                <span>GIẢI PHÁP CHUYÊN SÂU BẤT ĐỘNG SẢN</span>
              </div>

              <h1 className="deepdive-headline">
                Chatbot AI Cho Bất Động Sản
              </h1>

              <p className="deepdive-subheadline">
                Lọc khách theo ngân sách &amp; khu vực, gửi bảng giá, mặt bằng căn hộ và đặt lịch xem nhà mẫu tự động 24/7.
              </p>

              <div className="hero-cta-group justify-center">
                <Link href="#demo" className="btn-primary hero-btn-main">
                  <span>Dùng thử miễn phí</span>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M6 3.5L10.5 8L6 12.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
                <Link href="/#pricing" className="btn-secondary hero-btn-sub">
                  <span>Xem bảng giá</span>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* 2-Column Content Layout: Sticky TOC + Article */}
        <section className="deepdive-body-section">
          <div className="container">
            <div className="deepdive-layout-grid">
              {/* Left Column: Sticky Table of Contents */}
              <aside className="deepdive-sidebar">
                <div className="sticky-toc-box">
                  <p className="toc-header-title">NỘI DUNG BÀI VIẾT</p>
                  <nav aria-label="Mục lục bài viết">
                    <ol className="toc-list">
                      {TOC_SECTIONS.map((sec) => (
                        <li key={sec.id}>
                          <a href={`#${sec.id}`} className="toc-link">
                            <span className="toc-num">{sec.num}</span>
                            <span className="toc-text">{sec.title}</span>
                          </a>
                        </li>
                      ))}
                    </ol>
                  </nav>
                </div>
              </aside>

              {/* Right Column: Article Body */}
              <article className="deepdive-article-content">
                <div className="article-intro-callout">
                  <p>
                    <strong>Chatbot AI cho bất động sản</strong> đang thay đổi hoàn toàn cách khách hàng tiếp cận thông tin dự án. Không còn phải chờ gọi điện trong giờ hành chính. Không còn phải nhắn tin rồi đợi cả ngày mới có người phản hồi. Với đặc thù ngành bất động sản — nơi khách hàng thường tìm hiểu vào buổi tối hoặc cuối tuần — khoảng trống phản hồi chậm trễ chính là lý do khiến hàng loạt khách hàng tiềm năng bị nguội lạnh trước khi Sales kịp liên hệ.
                  </p>
                </div>

                {/* Muc 1 */}
                <section id="muc-1" className="article-section scroll-mt">
                  <h2 className="article-h2">
                    <span className="h2-num">01</span>
                    Chatbot AI cho bất động sản hỗ trợ tư vấn khách hàng như thế nào
                  </h2>
                  <div className="article-p-group">
                    <p>
                      Khác với các chatbot kịch bản cứng nhắc trước đây vốn chỉ đưa ra vài nút bấm chọn lựa sơ sài, chatbot AI thế hệ mới hiểu sâu ngôn ngữ tự nhiên của khách hàng. Khách gõ <em>&quot;căn 2 phòng ngủ tòa A giá bao nhiêu em&quot;</em> hay <em>&quot;dự án này tiến độ xây đến tầng mấy rồi, khi nào bàn giao&quot;</em>, chatbot đều trả lời đúng trọng tâm dựa trên dữ liệu dự án thực tế do doanh nghiệp cung cấp.
                    </p>
                    <p>
                      Đặc biệt, hệ thống xử lý hoàn hảo ngữ cảnh nhiều tầng: khi khách hỏi tiếp một câu liên quan đến câu trước đó (ví dụ: <em>&quot;thế căn góc view hồ thì chênh nhiều không&quot;</em>), chatbot vẫn nắm vững mạch đàm thoại mà không bắt khách phải nhắc lại từ đầu.
                    </p>
                  </div>
                </section>

                {/* Muc 2 */}
                <section id="muc-2" className="article-section scroll-mt">
                  <h2 className="article-h2">
                    <span className="h2-num">02</span>
                    Các tình huống bất động sản có thể ứng dụng chatbot AI
                  </h2>
                  <div className="article-subcases-grid">
                    <div className="subcase-item">
                      <div className="subcase-num">1</div>
                      <div className="subcase-content">
                        <h3>Tư vấn thông tin dự án chi tiết</h3>
                        <p>Vị trí tọa lạc, tiến độ thi công, hồ sơ pháp lý, tiện ích nội khu (hồ bơi, công viên, trường học) — giải đáp ngay tức thì không cần chờ Sales tra cứu tài liệu.</p>
                      </div>
                    </div>

                    <div className="subcase-item">
                      <div className="subcase-num">2</div>
                      <div className="subcase-content">
                        <h3>Khai thác &amp; Lọc nhu cầu mua</h3>
                        <p>Thông qua vài câu hỏi tự nhiên trong cuộc trò chuyện, chatbot thu thập ngân sách khả dụng, diện tích mong muốn, và mục đích mua để ở hay đầu tư sinh lời.</p>
                      </div>
                    </div>

                    <div className="subcase-item">
                      <div className="subcase-num">3</div>
                      <div className="subcase-content">
                        <h3>Gợi ý sản phẩm &amp; Mã căn phù hợp</h3>
                        <p>Dựa trên nhu cầu vừa thu thập, AI tự động sàng lọc trong giỏ hàng đang mở bán để gợi ý 2-3 căn hộ phù hợp nhất, thay vì để khách tự bơi giữa hàng trăm lựa chọn.</p>
                      </div>
                    </div>

                    <div className="subcase-item">
                      <div className="subcase-num">4</div>
                      <div className="subcase-content">
                        <h3>Giải đáp chính sách thanh toán &amp; Vay vốn</h3>
                        <p>Thông tin về tiến độ thanh toán từng đợt, ưu đãi chiết khấu thanh toán sớm, và chính sách ân hạn nợ gốc từ các ngân hàng liên kết (Techcombank, Vietcombank, MB...).</p>
                      </div>
                    </div>

                    <div className="subcase-item">
                      <div className="subcase-num">5</div>
                      <div className="subcase-content">
                        <h3>Thu thập &amp; Phân loại Lead chất lượng</h3>
                        <p>Chatbot ghi nhận số điện thoại, họ tên, mức độ cấp thiết và tự động chấm điểm lead (Hot/Warm/Cold) trước khi bàn giao cho đội ngũ chuyên viên kinh doanh.</p>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Muc 3 */}
                <section id="muc-3" className="article-section scroll-mt">
                  <h2 className="article-h2">
                    <span className="h2-num">03</span>
                    Từ khách truy cập website đến khách hàng tiềm năng
                  </h2>
                  <div className="article-p-group">
                    <p>
                      Thực tế cho thấy: hơn <strong>85% khách truy cập website bất động sản rời đi mà không để lại thông tin</strong>. Họ lướt xem phối cảnh, đọc sơ qua tiến độ rồi thoát trang vì lười điền form liên hệ tĩnh cồng kềnh.
                    </p>
                    <p>
                      Chatbot AI thay đổi hành vi này bằng cách <strong>chủ động mở lời trò chuyện đúng thời điểm</strong> (ví dụ: khi khách đang xem bảng giá hoặc dừng chân ở trang mặt bằng tầng). Việc chuyển đổi diễn ra tự nhiên: khách hỏi thông tin, bot giải đáp cặn kẽ, rồi khéo léo đề xuất gửi tài liệu Brochure PDF qua Zalo hoặc đặt lịch xem nhà mẫu cuối tuần. Tỷ lệ để lại số điện thoại qua hội thoại tương tác cao gấp 3 lần so với form tĩnh truyền thống.
                    </p>
                  </div>
                </section>

                {/* Muc 4 */}
                <section id="muc-4" className="article-section scroll-mt">
                  <h2 className="article-h2">
                    <span className="h2-num">04</span>
                    Chatbot AI giúp sales bất động sản tập trung vào khách có nhu cầu thực
                  </h2>
                  <div className="article-benefit-cards">
                    <div className="b-card">
                      <span className="b-icon">⚡</span>
                      <h4>Giảm thời gian trả lời lặp lại</h4>
                      <p>Các câu hỏi về giá bán, vị trí, tiện ích lặp lại hàng chục lần mỗi ngày. AI xử lý tự động 100% nhóm câu hỏi này.</p>
                    </div>
                    <div className="b-card">
                      <span className="b-icon">📋</span>
                      <h4>Nắm trọn thông tin trước khi gọi</h4>
                      <p>Trước khi nhấc máy, Sales đã biết rõ khách thích căn mấy phòng ngủ, tầm tài chính bao nhiêu, giúp cuộc gọi đi thẳng vào trọng tâm.</p>
                    </div>
                    <div className="b-card">
                      <span className="b-icon">🌙</span>
                      <h4>Không bỏ lỡ khách ngoài giờ</h4>
                      <p>Khách tìm hiểu nhà đất buổi tối và cuối tuần được tiếp đón và giữ chân ngay, không lo rơi rụng sang tay đối thủ cạnh tranh.</p>
                    </div>
                    <div className="b-card">
                      <span className="b-icon">🎯</span>
                      <h4>Dồn sức cho khách hàng nét (Hot Lead)</h4>
                      <p>Sales không còn mất thời gian gọi danh sách rác mà tập trung chăm sóc những khách hàng đã có nhu cầu xem nhà thực sự.</p>
                    </div>
                  </div>
                </section>

                {/* Muc 5 */}
                <section id="muc-5" className="article-section scroll-mt">
                  <h2 className="article-h2">
                    <span className="h2-num">05</span>
                    Kho kiến thức bất động sản làm nền tảng cho chatbot AI
                  </h2>
                  <div className="article-p-group">
                    <p>
                      Một chatbot AI chỉ trả lời xuất sắc khi có kho dữ liệu chuẩn xác làm điểm tựa. Với nexagnet, kho kiến thức dự án được cấu trúc bài bản bao gồm:
                    </p>
                    <ul className="article-list-styled">
                      <li>Hồ sơ pháp lý: Phê duyệt 1/500, Giấy phép xây dựng, Biên bản nghiệm thu móng cọc.</li>
                      <li>Bảng giá &amp; Giỏ hàng theo từng đợt mở bán (Đợt 1, Đợt 2, Shophouse, Penthouse).</li>
                      <li>File mặt bằng thiết kế (Layout 1PN, 2PN, 3PN, Duplex) và tài liệu bán hàng (Sales Kit).</li>
                      <li>Chính sách chiết khấu thanh toán sớm và gói vay hỗ trợ lãi suất từ ngân hàng đối tác.</li>
                    </ul>
                    <p>
                      Đặc biệt, hệ thống cho phép cập nhật dữ liệu linh hoạt chỉ bằng việc tải file tài liệu mới lên dashboard hoặc đồng bộ tự động từ Google Drive.
                    </p>
                  </div>
                </section>

                {/* Muc 6 */}
                <section id="muc-6" className="article-section scroll-mt">
                  <h2 className="article-h2">
                    <span className="h2-num">06</span>
                    Kiểm soát thông tin và ràng buộc an toàn khi AI tư vấn bất động sản
                  </h2>
                  <div className="article-p-group">
                    <p>
                      Bất động sản là tài sản có giá trị rất lớn, một thông tin sai lệch về giá hoặc pháp lý có thể gây hậu quả nghiêm trọng về uy tín thương hiệu. Vì vậy, nexagnet áp dụng nguyên tắc kiểm soát 3 lớp:
                    </p>
                    <div className="security-rule-box">
                      <div className="rule-badge">NGUYÊN TẮC AN TOÀN BẮT BUỘC</div>
                      <p>
                        <strong>1. Ràng buộc RAG đóng:</strong> AI chỉ được trích xuất dữ liệu từ văn bản đã được kiểm duyệt, tuyệt đối không suy đoán số liệu ra ngoài tài liệu.
                      </p>
                      <p>
                        <strong>2. Chuyển giao thông minh:</strong> Khi khách hàng hỏi về đàm phán giá chiết khấu đặc biệt hoặc thủ tục pháp lý tranh chấp, bot lịch sự ghi nhận và chuyển tiếp ngay cho Giám đốc kinh doanh / Trưởng nhóm tư vấn.
                      </p>
                    </div>
                  </div>
                </section>

                {/* Muc 7 */}
                <section id="muc-7" className="article-section scroll-mt">
                  <h2 className="article-h2">
                    <span className="h2-num">07</span>
                    nexagnet AI Agent cho doanh nghiệp bất động sản
                  </h2>
                  <div className="article-p-group">
                    <p>
                      Giải pháp nexagnet dành cho Bất động sản mang lại trải nghiệm triển khai nhanh chóng và vận hành không cần IT nội bộ:
                    </p>
                    <div className="feature-highlight-grid">
                      <div className="feat-highlight-card">
                        <div className="f-title">Tích hợp 1 dòng mã</div>
                        <div className="f-desc">Chèn 1 dòng script vào Website dự án là widget tư vấn xuất hiện ngay lập tức.</div>
                      </div>
                      <div className="feat-highlight-card">
                        <div className="f-title">Kết nối Zalo &amp; Messenger</div>
                        <div className="f-desc">Tự động trả lời tin nhắn Fanpage Facebook và Zalo OA dự án đồng thời.</div>
                      </div>
                      <div className="feat-highlight-card">
                        <div className="f-title">Bắn Lead tức thì về Telegram</div>
                        <div className="f-desc">Ngay khi khách để lại SĐT, bot gửi thông báo tức thời vào nhóm Sales để gọi lại trong 5 phút.</div>
                      </div>
                      <div className="feat-highlight-card">
                        <div className="f-title">Báo cáo hiệu quả Real-time</div>
                        <div className="f-desc">Thống kê số lượng cuộc trò chuyện, tỷ lệ chuyển đổi và danh sách khách hàng tiềm năng.</div>
                      </div>
                    </div>
                  </div>
                </section>

                {/* Muc 8 */}
                <section id="muc-8" className="article-section scroll-mt">
                  <h2 className="article-h2">
                    <span className="h2-num">08</span>
                    Chatbot AI phù hợp với những mô hình bất động sản nào
                  </h2>
                  <div className="article-p-group">
                    <ul className="article-list-styled">
                      <li><strong>Chủ đầu tư (Developer):</strong> Cần giải đáp thông tin dự án nhất quán trên diện rộng, chuẩn hóa thông điệp truyền thông cho các đợt mở bán lớn.</li>
                      <li><strong>Sàn phân phối F1 / Đại lý BĐS:</strong> Cần tiếp nhận hàng ngàn lead từ các chiến dịch quảng cáo Facebook/Google Ads và sàng lọc nhanh trước khi phân bổ cho Sales.</li>
                      <li><strong>Đội ngũ Môi giới &amp; Team Bán hàng:</strong> Cần một trợ lý tự động trực page 24/7 để không bỏ sót khách hỏi mua/thuê nhà ngoài giờ hành chính.</li>
                    </ul>
                  </div>
                </section>

                {/* Muc 9: FAQ */}
                <section id="muc-9" className="article-section scroll-mt">
                  <h2 className="article-h2">
                    <span className="h2-num">09</span>
                    Câu hỏi thường gặp về chatbot AI cho bất động sản
                  </h2>
                  <div className="faqs-accordion-wrapper">
                    {FAQS_LIST.map((item, idx) => (
                      <details key={idx} className="faq-accordion-item">
                        <summary className="faq-summary">
                          <span>{item.q}</span>
                          <span className="faq-chevron" aria-hidden="true">＋</span>
                        </summary>
                        <div className="faq-answer">
                          <p>{item.a}</p>
                        </div>
                      </details>
                    ))}
                  </div>
                </section>

                {/* Muc 10 */}
                <section id="muc-10" className="article-section scroll-mt">
                  <h2 className="article-h2">
                    <span className="h2-num">10</span>
                    Biến website &amp; mạng xã hội bất động sản thành kênh thu lead 24/7
                  </h2>
                  <div className="article-p-group">
                    <p>
                      Đừng để ngân sách quảng cáo của bạn lãng phí khi khách hàng truy cập website rồi rời đi trong im lặng. Hãy trang bị ngay trợ lý AI thông minh để tư vấn tận tâm và biến mọi lượt click thành cơ hội chốt giao dịch thực tế.
                    </p>
                    <p>
                      Nếu doanh nghiệp của bạn hoạt động trong mô hình phân phối bán buôn hoặc đa kênh, bạn cũng có thể tham khảo thêm <Link href="/solutions/b2b-order-processing" className="text-link">Giải pháp Tự động hóa Xử lý Đơn hàng B2B qua Zalo</Link> để tối ưu hóa toàn diện dòng chảy vận hành.
                    </p>
                  </div>
                </section>
              </article>
            </div>

            {/* Cross-Industry Links Section */}
            <div className="cross-industry-section">
              <h3 className="cross-title">KHÁM PHÁ GIẢI PHÁP CHO CÁC NGÀNH KHÁC:</h3>
              <div className="cross-tags-wrap">
                {otherIndustries.map((ind) => (
                  <Link key={ind.slug} href={`/solutions/${ind.slug}`} className="cross-industry-tag">
                    <span className="tag-icon">{ind.icon}</span>
                    <span>{ind.title}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        <DemoCTA />
      </main>

      <Footer />
    </div>
  );
}
