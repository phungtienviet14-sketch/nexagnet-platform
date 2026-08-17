export interface IndustrySimulatorMessage {
  sender: 'user' | 'bot' | 'system';
  text: string;
  badge?: string;
  time?: string;
  metadata?: {
    intent?: string;
    extracted?: Record<string, string>;
    rules?: string[];
    action?: string;
  };
}

export interface IndustryItem {
  slug: string;
  title: string;
  subtitle: string;
  tagline: string;
  icon: string;
  color: string;
  description: string;
  keyBenefits: string[];
  metrics: {
    value: string;
    label: string;
  }[];
  useCases: {
    title: string;
    description: string;
  }[];
  simulatorData: {
    channelName: string;
    channelIcon: 'zalo' | 'messenger' | 'web' | 'telegram';
    initialUserQuery: string;
    conversation: IndustrySimulatorMessage[];
  };
  faqs: {
    question: string;
    answer: string;
  }[];
}

export const INDUSTRIES_DATA: IndustryItem[] = [
  {
    slug: 'real-estate',
    title: 'Bất động sản',
    subtitle: 'Tư vấn dự án, lọc ngân sách & đặt lịch xem nhà mẫu 24/7',
    tagline: 'Biến khách truy cập website & tương tác mạng xã hội thành khách hàng tiềm năng chất lượng cao.',
    icon: '🏢',
    color: '#0284C7',
    description:
      'Chatbot AI cho bất động sản giúp chủ đầu tư, sàn phân phối F1 và môi giới tự động hóa khâu trả lời thông tin dự án, gửi bảng giá, mặt bằng, lọc ngân sách khách hàng và lên lịch hẹn xem nhà mẫu tức thì.',
    keyBenefits: [
      'Phản hồi tức thì 24/7 khi khách tìm kiếm nhà đất vào buổi tối hoặc cuối tuần',
      'Tự động phân loại lead theo ngân sách, khu vực và mục đích ở/đầu tư',
      'Gửi bảng giá, chính sách chiết khấu và mặt bằng căn hộ đúng dữ liệu duyệt',
      'Đồng bộ thông tin khách hàng trực tiếp về CRM/Google Sheets cho Sales',
    ],
    metrics: [
      { value: '100%', label: 'Lead ngoài giờ hành chính được tiếp đón tức thì' },
      { value: '3.2x', label: 'Tăng tỷ lệ để lại số điện thoại & đặt lịch xem nhà' },
      { value: '< 3s', label: 'Thời gian tra cứu mặt bằng & gửi bảng giá' },
    ],
    useCases: [
      {
        title: 'Tư vấn thông tin & tiến độ dự án',
        description: 'Vị trí, tiện ích nội ngoại khu, pháp lý, thời gian bàn giao và ngân hàng hỗ trợ vay vốn.',
      },
      {
        title: 'Lọc nhu cầu & ngân sách',
        description: 'Khai thác khéo léo số phòng ngủ mong muốn, tầm tài chính và thời điểm dự kiến xuống tiền.',
      },
      {
        title: 'Gửi bảng giá & chính sách bán hàng',
        description: 'Tự động cung cấp khoảng giá chính xác theo từng phân khu và các gói ưu đãi hiện hành.',
      },
      {
        title: 'Đặt lịch tham quan nhà mẫu',
        description: 'Xác nhận thời gian khách rảnh, số lượng người tham quan và chuyển giao cho nhân sự phụ trách.',
      },
    ],
    simulatorData: {
      channelName: 'Website Widget / Fanpage Dự Án',
      channelIcon: 'web',
      initialUserQuery: 'Dự án Lumière Riverside căn 2PN giá khoảng bao nhiêu em? Có hỗ trợ vay không?',
      conversation: [
        {
          sender: 'user',
          text: 'Dự án Lumière Riverside căn 2PN giá khoảng bao nhiêu em? Có hỗ trợ vay không?',
          time: '20:15',
        },
        {
          sender: 'bot',
          text: 'Chào anh/chị! Căn 2PN tại Lumière Riverside có diện tích từ 68 - 77m², mức giá dao động từ 7.2 - 8.5 tỷ (đã gồm VAT). Dự án đang có chính sách hỗ trợ vay 70% với lãi suất 0% trong 24 tháng từ Techcombank và Vietcombank ạ.',
          time: '20:15',
          metadata: {
            intent: 'Tra cứu giá & Chính sách dự án',
            extracted: {
              'Dự án': 'Lumière Riverside',
              'Loại căn': '2 Phòng Ngủ (68-77m²)',
              'Khoảng giá': '7.2 - 8.5 tỷ VNĐ',
              'Chính sách': 'Hỗ trợ vay 70%, 0% LS / 24 tháng',
            },
            rules: ['Khớp dữ liệu bảng giá Đợt 2 đã duyệt', 'Kiểm tra chính sách ngân hàng liên kết'],
            action: 'Trả lời đúng thông số + Đề xuất gửi mặt bằng chi tiết',
          },
        },
        {
          sender: 'user',
          text: 'Gửi anh xem mặt bằng tầng và layout căn góc nhé.',
          time: '20:16',
        },
        {
          sender: 'bot',
          text: 'Dạ em đã chuẩn bị file Layout mặt bằng căn góc 2PN (74.5m² view sông). Anh cho em xin Số điện thoại / Zalo để em gửi trọn bộ tài liệu kèm bảng tính dòng tiền thanh toán chi tiết ngay nhé!',
          time: '20:16',
          metadata: {
            intent: 'Thu thập Lead (SĐT) & Gửi tài liệu',
            rules: ['Không spam, hỏi SĐT tự nhiên theo ngữ cảnh cung cấp giá trị'],
            action: 'Sẵn sàng ghi nhận Lead vào CRM khi khách cung cấp SĐT',
          },
        },
      ],
    },
    faqs: [
      {
        question: 'Chatbot AI Bất động sản có trả lời sai thông tin giá hoặc pháp lý không?',
        answer:
          'Không. Khác với AI sinh nội dung tự do, NexAgent hoạt động dựa trên cơ chế RAG ràng buộc nghiêm ngặt với kho dữ liệu dự án do doanh nghiệp tải lên. Khi gặp câu hỏi nằm ngoài phạm vi tài liệu đã duyệt, bot sẽ lịch sự chuyển tiếp cho nhân viên tư vấn thay vì tự suy đoán.',
      },
      {
        question: 'Làm thế nào để cập nhật bảng giá khi dự án ra hàng đợt mới?',
        answer:
          'Bạn chỉ cần tải file PDF/Excel bảng giá mới lên bảng điều khiển quản trị hoặc cập nhật qua Google Drive đồng bộ. Hệ thống sẽ tự động cập nhật tri thức sau vài giây mà không cần cấu hình lại.',
      },
      {
        question: 'Hệ thống có tích hợp được với Zalo OA và Fanpage của các dự án không?',
        answer:
          'Có. NexAgent hỗ trợ kết nối đa kênh cùng lúc: Website Widget, Fanpage Facebook, Zalo OA và Zalo cá nhân của đội ngũ Sales.',
      },
    ],
  },
  {
    slug: 'b2b-order-processing',
    title: 'Bán buôn & Phân phối B2B',
    subtitle: 'Tự động đọc tin nhắn Zalo viết tắt, đối soát SKU & lên đơn tức thì',
    tagline: 'Xóa bỏ nghẽn cổ chai gõ tay đơn hàng từ hàng trăm nhóm Zalo đại lý, CTV.',
    icon: '📦',
    color: '#3D5AFE',
    description:
      'Giải pháp AI chuyên sâu cho các nhà nhập khẩu, sản xuất và phân phối bán buôn: Đọc hiểu tin nhắn đặt hàng không dấu, gõ vội, trích xuất mã hàng, kiểm tra hạn mức công nợ và tự động lên đơn chính xác 100%.',
    keyBenefits: [
      'Đọc hiểu chuẩn xác tin nhắn viết tắt địa phương, mã sản phẩm gõ vội',
      'Tính giá, chiết khấu và công nợ tất định bằng Rules Engine độc lập',
      'Phân luồng an toàn: Đơn hợp lệ tự gửi xác nhận, đơn ngoại lệ chuyển Sales duyệt',
      'Tiết kiệm 90% thời gian nhập tay vào KiotViet, SAP, Bravo hay Base',
    ],
    metrics: [
      { value: '< 5s', label: 'Thời gian trích xuất & đối soát 1 đơn hàng phức tạp' },
      { value: '100%', label: 'Độ chính xác quy tắc giá & chính sách đại lý' },
      { value: '200+', label: 'Nhóm Zalo đại lý quản lý đồng thời bởi 1 nhân sự' },
    ],
    useCases: [
      {
        title: 'Xử lý đơn hàng hội thoại Zalo',
        description: 'Tự động bóc tách SKU, số lượng, địa chỉ giao hàng và đại lý đặt từ chat text.',
      },
      {
        title: 'Đối soát công nợ & tồn kho',
        description: 'Kiểm tra tức thời hạn mức nợ còn lại và lượng tồn khả dụng tại chi nhánh.',
      },
      {
        title: 'Tra cứu catalogue & bảo hành',
        description: 'Giải đáp nhanh thông số kỹ thuật, chính sách đổi trả cho đại lý cấp 1, cấp 2.',
      },
      {
        title: 'Phát tin thông báo chính sách định kỳ',
        description: 'Cơ chế pacing gửi tin an toàn chống khóa kênh truyền thông Zalo.',
      },
    ],
    simulatorData: {
      channelName: 'Nhóm Zalo Đại Lý Miền Bắc',
      channelIcon: 'zalo',
      initialUserQuery: 'Gửi về TN cho c 15 cái Felix, cước báo sau nhé',
      conversation: [
        {
          sender: 'user',
          text: 'Gửi về TN cho c 15 cái Felix, cước báo sau nhé',
          time: '10:42',
        },
        {
          sender: 'bot',
          text: 'Dạ em xác nhận đơn của chị Phương (Meta Thái Nguyên):\n- 15 x Ghế thư giãn Felix (FLX-01)\n- Đơn giá Đại lý C1: 1.150.000đ\n- Tổng tiền: 17.250.000đ (Chưa gồm cước xe)\n- Giao về: Kho Thái Nguyên\nĐơn đã được duyệt vào hệ thống và chuẩn bị xuất kho HN ạ!',
          time: '10:42',
          metadata: {
            intent: 'Đặt hàng B2B',
            extracted: {
              'Đại lý': 'Meta Thái Nguyên (Cấp 1)',
              'Sản phẩm': 'Ghế Felix (FLX-01)',
              'Số lượng': '15 chiếc',
              'Địa điểm': 'Thái Nguyên (TN)',
            },
            rules: [
              'Khớp danh mục SKU: FLX-01',
              'SL: 15 <= 50 (Ngưỡng tự động)',
              'Công nợ trong hạn mức 45 ngày cho phép',
            ],
            action: 'Tự động gửi xác nhận nhóm & thông báo Sales nhập ERP',
          },
        },
      ],
    },
    faqs: [
      {
        question: 'Hệ thống có đọc được ảnh chụp bảng kê viết tay hay hóa đơn không?',
        answer:
          'Hệ thống hỗ trợ module mở rộng Vision AI để nhận diện ảnh chụp bảng kê viết tay hoặc ảnh chụp màn hình đơn hàng. Trường hợp ảnh không đủ độ nét, hệ thống tự động chuyển nhân sự kiểm tra đối chiếu trước khi gửi.',
      },
      {
        question: 'Nếu đại lý đặt số lượng quá lớn hoặc nợ cũ chưa thanh toán thì sao?',
        answer:
          'Rules Engine sẽ tự động chặn việc gửi tin tự động và chuyển ngay vào Cổng kiểm duyệt nhân sự (Human-in-the-Loop) để Kế toán hoặc Quản lý kinh doanh duyệt thủ công.',
      },
    ],
  },
  {
    slug: 'retail-ecommerce',
    title: 'Bán lẻ & Thương mại Điện tử',
    subtitle: 'Tư vấn chọn mẫu, upsell combo & tra cứu đơn hàng tự động',
    tagline: 'Tăng gấp đôi tỷ lệ chuyển đổi từ traffic quảng cáo và giữ chân khách hàng 24/7.',
    icon: '🛍️',
    color: '#10B981',
    description:
      'Agent AI đóng vai trò là nhân viên bán hàng xuất sắc: thấu hiểu nhu cầu của từng khách hàng, gợi ý phối đồ / chọn size chuẩn xác, chốt sale nhanh chóng và tự động cập nhật trạng thái giao vận.',
    keyBenefits: [
      'Gợi ý sản phẩm thông minh dựa trên sở thích, chiều cao, cân nặng của khách',
      'Tự động áp dụng mã giảm giá, voucher khuyến mãi theo giỏ hàng',
      'Tích hợp tra cứu mã vận đơn GHTK, GHN, Viettel Post ngay trong chat',
      'Giảm 75% tỷ lệ khách bỏ rơi giỏ hàng trên Website & Fanpage',
    ],
    metrics: [
      { value: '+45%', label: 'Tỷ lệ chốt đơn thành công từ hội thoại tư vấn' },
      { value: '24/7', label: 'Tốc độ phản hồi dưới 2 giây bất kể ngày đêm' },
      { value: '35%', label: 'Doanh thu tăng thêm từ gợi ý Cross-sell / Upsell' },
    ],
    useCases: [
      {
        title: 'Tư vấn chọn size & phối đồ',
        description: 'Hỏi chiều cao cân nặng để gợi ý size vừa vặn và sản phẩm phụ kiện đi kèm.',
      },
      {
        title: 'Chốt đơn & tạo giỏ hàng',
        description: 'Tự động gom thông tin nhận hàng, tính tổng tiền và gửi link thanh toán VietQR.',
      },
      {
        title: 'Tra cứu hành trình đơn hàng',
        description: 'Khách chỉ cần nhập SĐT là bot thông báo vị trí bưu kiện và thời gian dự kiến giao.',
      },
    ],
    simulatorData: {
      channelName: 'Messenger Fanpage Thời Trang',
      channelIcon: 'messenger',
      initialUserQuery: 'Mình cao 1m68 nặng 62kg mặc áo Polo phối quần short nào đẹp shop?',
      conversation: [
        {
          sender: 'user',
          text: 'Mình cao 1m68 nặng 62kg mặc áo Polo phối quần short nào đẹp shop?',
          time: '14:20',
        },
        {
          sender: 'bot',
          text: 'Dạ với chiều cao 1m68 và 62kg, anh mặc vừa vặn chuẩn phom Regular Fit Size L ạ! \n\nĐể phối cùng Áo Polo Pique Trắng (mã PL-02), shop gợi ý anh kết hợp với Quần Short Kaki Co Giãn màu Xám Khói hoặc Be Sữa. Combo này vừa năng động trẻ trung vừa lịch sự đi cafe/dạo phố.\n\nShop đang có ưu đãi Mua Combo Polo + Short giảm ngay 15% chỉ còn 485.000đ (tiết kiệm 85k). Anh có muốn xem ảnh chụp người mẫu mặc thử không ạ?',
          time: '14:20',
          metadata: {
            intent: 'Tư vấn phối đồ & Chọn Size',
            extracted: {
              'Chiều cao': '1m68',
              'Cân nặng': '62kg',
              'Size gợi ý': 'L (Regular Fit)',
              'Gợi ý Combo': 'Polo PL-02 + Short Kaki',
            },
            rules: ['Áp dụng bảng size chuẩn', 'Kích hoạt khuyến mãi Combo tiết kiệm 15%'],
            action: 'Gợi ý Upsell + Kích thích chuyển đổi mua hàng',
          },
        },
      ],
    },
    faqs: [
      {
        question: 'Bot có kết nối được với Haravan, Sapo hoặc Shopify không?',
        answer: 'Có. Hệ thống hỗ trợ webhook đồng bộ tồn kho, đơn hàng và khách hàng với các nền tảng TMĐT phổ biến.',
      },
    ],
  },
  {
    slug: 'healthcare-spa',
    title: 'Spa, Thẩm mỹ viện & Y tế',
    subtitle: 'Tư vấn liệu trình, giữ chỗ & nhắc lịch hẹn khám tự động',
    tagline: 'Nâng tầm trải nghiệm khách hàng cao cấp, hạn chế tối đa tình trạng hủy hẹn ngoài ý muốn.',
    icon: '💆',
    color: '#EC4899',
    description:
      'Trợ lý ảo thông minh giải đáp chi tiết liệu trình chăm sóc da, điều trị thẩm mỹ, nha khoa, bảng giá dịch vụ và điều phối lịch hẹn theo khung giờ trống của bác sĩ / kỹ thuật viên.',
    keyBenefits: [
      'Tư vấn phác đồ và bảng giá dịch vụ chuẩn xác theo quy định y khoa',
      'Hệ thống giữ chỗ thông minh, tránh trùng lịch bác sĩ và phòng điều trị',
      'Tự động gửi tin nhắn Zalo/SMS nhắc hẹn trước 24h và 2h',
      'Khảo sát mức độ hài lòng và hướng dẫn chăm sóc sau dịch vụ tự động',
    ],
    metrics: [
      { value: '-60%', label: 'Tỷ lệ khách hủy hẹn không báo trước (No-show)' },
      { value: '3x', label: 'Tăng lượt đặt lịch hẹn từ Website & Mạng xã hội' },
      { value: '98%', label: 'Khách hàng hài lòng với tốc độ tư vấn chi tiết' },
    ],
    useCases: [
      {
        title: 'Tư vấn dịch vụ & báo giá liệu trình',
        description: 'Giải đáp tình trạng da, công nghệ điều trị và chi phí trọn gói.',
      },
      {
        title: 'Đặt lịch hẹn & chọn chi nhánh',
        description: 'Tra cứu lịch trống của bác sĩ và đặt lịch theo khung giờ mong muốn.',
      },
      {
        title: 'Chăm sóc & nhắc lịch sau điều trị',
        description: 'Gửi lưu ý kiêng khem sau liệu trình và nhắc lịch tái khám định kỳ.',
      },
    ],
    simulatorData: {
      channelName: 'Zalo OA Viện Thẩm Mỹ',
      channelIcon: 'zalo',
      initialUserQuery: 'Da em bị mụn ẩn và thâm đỏ thì làm gói nào hiệu quả chị ơi? Giá bao nhiêu?',
      conversation: [
        {
          sender: 'user',
          text: 'Da em bị mụn ẩn và thâm đỏ thì làm gói nào hiệu quả chị ơi? Giá bao nhiêu?',
          time: '16:05',
        },
        {
          sender: 'bot',
          text: 'Chào bạn! Với tình trạng mụn ẩn kèm thâm đỏ, Viện Thẩm Mỹ đang áp dụng Phác đồ Trị mụn Chuẩn Y Khoa Acnes Peel kết hợp Ánh sáng sinh học Bio-Light:\n\n✨ Giúp gom cồi mụn, diệt khuẩn P.acnes tầng sâu\n✨ Làm mờ thâm đỏ và phục hồi hàng rào ẩm cho da\n\nChi phí trải nghiệm buổi đầu đang ưu đãi còn 399.000đ (giá gốc 850.000đ). Thứ 7 tuần này lúc 10h00 hoặc 15h00 bạn có tiện ghé chi nhánh Quận 1 để Bác sĩ da liễu soi da 3D miễn phí không ạ?',
          time: '16:05',
          metadata: {
            intent: 'Tư vấn liệu trình & Đặt lịch hẹn',
            extracted: {
              'Tình trạng': 'Mụn ẩn, thâm đỏ',
              'Liệu trình': 'Acnes Peel + Bio-Light',
              'Giá ưu đãi': '399.000đ (gốc 850k)',
            },
            rules: ['Tra cứu lịch trống Bác sĩ Chi nhánh Q1', 'Áp dụng ưu đãi buổi đầu'],
            action: 'Gợi ý 2 khung giờ trống để khách dễ lựa chọn',
          },
        },
      ],
    },
    faqs: [
      {
        question: 'Dữ liệu thông tin bệnh nhân và khách hàng có được bảo mật không?',
        answer:
          'Hoàn toàn tuân thủ Luật Bảo vệ dữ liệu cá nhân (91/2025/QH15) và mã hóa cấp ngân hàng AES-256. Dữ liệu chỉ lưu trữ nội bộ trên hạ tầng của doanh nghiệp.',
      },
    ],
  },
  {
    slug: 'clinic-dental',
    title: 'Phòng khám & Nha khoa',
    subtitle: 'Hỏi đáp triệu chứng, đặt lịch khám & quản lý hồ sơ hẹn bệnh nhân',
    tagline: 'Tối ưu hóa quy trình tiếp đón và giải tỏa áp lực trực tổng đài phòng khám.',
    icon: '🏥',
    color: '#06B6D4',
    description:
      'Hỗ trợ bệnh nhân tra cứu thông tin chuyên khoa, bảng giá dịch vụ nha khoa, khám tổng quát, phân loại mức độ khẩn cấp và kết nối đặt lịch khám với bác sĩ chuyên khoa phù hợp.',
    keyBenefits: [
      'Sàng lọc triệu chứng cơ bản và hướng dẫn chuẩn bị trước khi đến khám',
      'Định tuyến lịch hẹn theo đúng chuyên khoa và phòng điều trị',
      'Gửi chỉ dẫn vị trí phòng khám và quy trình thanh toán bảo hiểm y tế',
    ],
    metrics: [
      { value: '100%', label: 'Cuộc gọi & tin nhắn hỏi lịch được tiếp nhận ngay' },
      { value: '-40%', label: 'Thời gian chờ đợi tại quầy tiếp tân phòng khám' },
    ],
    useCases: [
      {
        title: 'Tư vấn niềng răng & thẩm mỹ nụ cười',
        description: 'Giải đáp các loại mắc cài, khay trong suốt Invisalign và chính sách trả góp 0%.',
      },
      {
        title: 'Đặt lịch khám bệnh chuyên khoa',
        description: 'Chọn bác sĩ, chuyên khoa và nhận mã QR check-in tiếp đón nhanh tại phòng khám.',
      },
    ],
    simulatorData: {
      channelName: 'Website Phòng Khám Nha Khoa',
      channelIcon: 'web',
      initialUserQuery: 'Tẩy trắng răng bằng laser bên mình giá bao nhiêu? Có bị ê buốt không?',
      conversation: [
        {
          sender: 'user',
          text: 'Tẩy trắng răng bằng laser bên mình giá bao nhiêu? Có bị ê buốt không?',
          time: '09:12',
        },
        {
          sender: 'bot',
          text: 'Chào bạn! Nha Khoa áp dụng công nghệ Laser Whitening thế hệ mới từ Hoa Kỳ, sử dụng thuốc tẩy trắng chính hãng nồng độ an toàn, hạn chế ê buốt đến 95% và hoàn tất chỉ trong 45-60 phút.\n\nChi phí trọn gói hiện tại là 1.800.000đ (đã bao gồm cạo vôi răng và đánh bóng miễn phí). Bạn có muốn đặt lịch hẹn sáng mai để Bác sĩ kiểm tra men răng trước không ạ?',
          time: '09:12',
          metadata: {
            intent: 'Hỏi đáp dịch vụ & Đặt hẹn',
            rules: ['Trích xuất thông số công nghệ y khoa đã duyệt', 'Áp dụng biểu giá chuẩn'],
          },
        },
      ],
    },
    faqs: [
      {
        question: 'Bot có đưa ra chẩn đoán y khoa thay bác sĩ không?',
        answer: 'Không. Hệ thống được lập trình nguyên tắc chỉ cung cấp thông tin tham khảo và khuyến nghị bệnh nhân đến thăm khám trực tiếp với bác sĩ chuyên môn.',
      },
    ],
  },
  {
    slug: 'fb-restaurant',
    title: 'F&B & Nhà hàng',
    subtitle: 'Đặt bàn tự động, gửi menu điện tử & tích điểm thành viên',
    tagline: 'Tự động hóa đặt bàn trong giờ cao điểm, không lo sót khách trên Fanpage.',
    icon: '🍽️',
    color: '#F59E0B',
    description:
      'Trợ lý ảo tiếp nhận yêu cầu đặt bàn, gửi thực đơn món ăn kèm hình ảnh hấp dẫn, lưu ý dị ứng thực phẩm và tích điểm khách hàng thân thiết đa chi nhánh.',
    keyBenefits: [
      'Xử lý đồng thời hàng trăm yêu cầu đặt bàn vào dịp lễ, cuối tuần',
      'Gửi menu thực đơn, set tiệc và chương trình ưu đãi sinh nhật ngay lập tức',
      'Đồng bộ danh sách đặt bàn về phần mềm quản lý POS / Table Management',
    ],
    metrics: [
      { value: '0s', label: 'Thời gian chờ gửi Menu & Thực đơn điện tử' },
      { value: '+30%', label: 'Số lượng bàn tiệc đặt thành công qua Fanpage' },
    ],
    useCases: [
      {
        title: 'Đặt bàn & chọn vị trí ngồi',
        description: 'Ghi nhận số lượng khách, ngày giờ, bàn ngoài trời hay phòng VIP riêng tư.',
      },
      {
        title: 'Gợi ý món ăn & set tiệc',
        description: 'Tư vấn set menu phù hợp theo số lượng người và mức ngân sách.',
      },
    ],
    simulatorData: {
      channelName: 'Messenger Fanpage Nhà Hàng',
      channelIcon: 'messenger',
      initialUserQuery: 'Tối mai mình muốn đặt bàn 6 người lúc 19h có phòng riêng không bạn?',
      conversation: [
        {
          sender: 'user',
          text: 'Tối mai mình muốn đặt bàn 6 người lúc 19h có phòng riêng không bạn?',
          time: '11:30',
        },
        {
          sender: 'bot',
          text: 'Dạ chào anh! Tối mai (19:00) nhà hàng có sẵn Phòng VIP Jasmine (sức chứa 6-8 khách, không phụ thu phí phòng). \n\nAnh cho em xin Tên và Số điện thoại liên hệ để em giữ phòng cho đoàn mình ngay nhé! Em cũng xin phép gửi Menu Set tiệc hải sản đặc sắc để anh tham khảo trước ạ.',
          time: '11:30',
          metadata: {
            intent: 'Đặt bàn & Giữ phòng VIP',
            extracted: { 'Số khách': '6 người', 'Thời gian': '19:00 Ngày mai', 'Yêu cầu': 'Phòng riêng' },
          },
        },
      ],
    },
    faqs: [
      {
        question: 'Bot có thông báo cho quản lý nhà hàng khi có bàn đặt mới không?',
        answer: 'Có. Thông báo đặt bàn được gửi ngay tức thì về nhóm Telegram / Zalo của nhân sự quản lý chi nhánh.',
      },
    ],
  },
];
