export interface IndustryPainPoint {
  num: string;
  title: string;
  desc: string;
}

export interface IndustryWorkflowStep {
  step: string;
  tag: string;
  title: string;
  desc: string;
  example: string;
  role: 'ai' | 'rules' | 'human' | 'system';
}

export interface IndustryItem {
  slug: string;
  title: string;
  subtitle: string;
  tagline: string;
  icon: string;
  color: string;
  description: string;
  departmentsInvolved: string[];
  painPoints: IndustryPainPoint[];
  workflowSteps: IndustryWorkflowStep[];
  capabilities: {
    icon: string;
    title: string;
    desc: string;
    bullets: string[];
  }[];
  relatedModules: {
    title: string;
    desc: string;
    href: string;
    badge?: string;
  }[];
  faqs: {
    q: string;
    a: string;
  }[];
}

export const INDUSTRIES_DATA: IndustryItem[] = [
  {
    slug: 'retail-distribution',
    title: 'Bán lẻ & Phân phối (B2B)',
    subtitle: 'Tự động hóa bóc tách đơn hàng Zalo, đối soát bảng giá đại lý và kiểm soát hạn mức công nợ an toàn',
    tagline: 'Từ tin nhắn chat dồn dập đến đơn hàng chuẩn xác được kiểm soát công nợ.',
    icon: '📦',
    color: '#0284C7',
    description:
      'Giải quyết điểm nghẽn lớn nhất của doanh nghiệp phân phối sỉ: Hàng trăm nhóm Zalo dồn đơn cao điểm với tin nhắn viết tắt, không dấu, ảnh chụp và bảng giá thay đổi liên tục.',
    departmentsInvolved: ['Sales', 'Vận hành (Kho)', 'Tài chính - Kế toán', 'Ban Giám đốc'],
    painPoints: [
      {
        num: '01',
        title: 'Hàng trăm nhóm Zalo đại lý dồn đơn cao điểm',
        desc: 'Doanh nghiệp phân phối thường vận hành từ 100 đến hơn 300 nhóm Zalo. Đơn hàng gửi về rải rác cả ngày lẫn đêm khiến nhân sự dễ bỏ sót hoặc phản hồi chậm trễ.',
      },
      {
        num: '02',
        title: 'Tin nhắn gõ vội, viết tắt và ảnh bảng kê',
        desc: 'Đại lý nhắn tin không dấu, dùng từ lóng địa phương hoặc gửi ảnh chụp hóa đơn viết tay, khiến Sales tốn nhiều thời gian gõ lại và dễ nhầm lẫn mã hàng.',
      },
      {
        num: '03',
        title: 'Nghẽn cổ chai đối soát giá và hạn mức công nợ',
        desc: 'Nhân viên sales phải liên tục tra cứu bảng giá Excel, kiểm tra hạn mức công nợ từng đối tác rồi mới tạo đơn xuất kho thủ công.',
      },
    ],
    workflowSteps: [
      {
        step: 'BƯỚC 01',
        tag: 'TIẾP NHẬN ĐƠN',
        title: 'Đại lý gửi yêu cầu trong nhóm Zalo',
        desc: 'Đại lý nhắn tin đặt hàng tự nhiên theo thói quen cũ mà không cần gõ đúng cú pháp cứng nhắc hay gắn thẻ bot.',
        example: '“Gửi cho chị 15 cái quạt Felix về kho Thái Nguyên, cước báo sau nhé”',
        role: 'ai',
      },
      {
        step: 'BƯỚC 02',
        tag: 'ĐỐI SOÁT QUY TẮC',
        title: 'Rules Engine tính giá & Kiểm tra công nợ',
        desc: 'Hệ thống ánh xạ mã SKU chuẩn, áp biểu giá đại lý Cấp 1 và đối soát hạn mức công nợ hợp lệ trong cơ sở dữ liệu.',
        example: 'SKU: FLX-01 · Đơn giá: 1.150.000đ · Thành tiền: 17.250.000đ · Công nợ: Đủ điều kiện',
        role: 'rules',
      },
      {
        step: 'BƯỚC 03',
        tag: 'PHÂN LUỒNG THỰC THI',
        title: 'Tự động gửi xác nhận hoặc chuyển Sales duyệt',
        desc: 'Đơn hàng trong ngưỡng an toàn tự động phát tin xác nhận vào nhóm Zalo; đơn vượt hạn mức chuyển Sales duyệt trước.',
        example: 'Đã phát tin xác nhận vào nhóm Zalo · Ghi nhận vào hàng việc nhân sự',
        role: 'human',
      },
      {
        step: 'BƯỚC 04',
        tag: 'XUẤT KHO VẬN HÀNH',
        title: 'Sales nhận việc và tạo đơn xuất hàng',
        desc: 'Thông tin đơn hàng được chuẩn hóa sẵn sàng để Sales sao chép/nhập vào phần mềm quản lý bán hàng.',
        example: 'Tạo hàng việc xuất kho · Lưu nhật ký kiểm toán đầy đủ',
        role: 'system',
      },
    ],
    capabilities: [
      {
        icon: '📝',
        title: 'Tự động hóa xử lý đơn hàng B2B',
        desc: 'Đọc hiểu tin nhắn viết tắt, trích xuất mã sản phẩm, số lượng, địa chỉ giao và đối soát giá theo cấp đại lý ngay khi nhận tin.',
        bullets: ['Bóc tách đơn hàng theo JSON Schema đóng', 'Tính toán biểu giá và thuế VAT tất định', 'Gửi tin xác nhận vào nhóm Zalo tự động'],
      },
      {
        icon: '💳',
        title: 'Đối soát chính sách thanh toán & Công nợ',
        desc: 'Tự động nhận diện và đối soát đúng điều khoản tài chính (công nợ 30/45 ngày, ký gửi, thanh toán ngay, COD) theo từng hồ sơ đối tác.',
        bullets: ['Kiểm tra hạn mức công nợ khả dụng', 'Cảnh báo khi đối tác có nợ quá hạn', 'Áp dụng chiết khấu bậc thang chính xác'],
      },
      {
        icon: '📢',
        title: 'Phát tin chiến dịch & Thông báo chính sách',
        desc: 'Lên lịch và gửi thông báo bảng giá mới, chương trình khuyến mãi tháng tới hàng trăm nhóm đại lý theo hàng đợi giãn cách an toàn.',
        bullets: ['Giãn cách an toàn 8–15 giây/nhóm', 'Cá nhân hóa lời chào theo từng đại lý', 'Công tắc dừng khẩn cấp trong 1 click'],
      },
    ],
    relatedModules: [
      {
        title: 'Xử lý Đơn hàng (Order Automation)',
        desc: 'Sản phẩm tiêu biểu tự động hóa bóc tách và đối soát đơn hàng B2B.',
        href: '/products/order-automation',
        badge: 'Tiêu biểu',
      },
      {
        title: 'Phòng Bán hàng (Sales)',
        desc: 'Hỗ trợ đội ngũ kinh doanh nâng cao tốc độ phản hồi và chốt giao dịch.',
        href: '/departments/sales',
      },
      {
        title: 'Phòng Vận hành (Operations)',
        desc: 'Tự động hóa các quy trình phê duyệt và phân luồng nghiệp vụ theo quy tắc.',
        href: '/departments/operations',
      },
    ],
    faqs: [
      {
        q: 'Đại lý trong nhóm Zalo có bắt buộc phải gõ đúng cú pháp cố định không?',
        a: 'Không cần. Nexagnet được xây dựng để đại lý có thể nhắn tin hoàn toàn tự nhiên theo thói quen cũ (viết tắt, không dấu, gõ vội). Hệ thống tự động đọc hiểu và trích xuất mà không bắt buộc người mua phải học cú pháp mới.',
      },
      {
        q: 'Khi có bảng giá mới hoặc thay đổi chính sách chiết khấu, làm sao để cập nhật?',
        a: 'Nhân sự chỉ cần cập nhật trực tiếp qua Bảng điều khiển quản trị (Admin Panel) hoặc qua cơ sở dữ liệu. Hệ thống sẽ tự động áp dụng ngay lập tức mà không cần khởi động lại.',
      },
      {
        q: 'Đơn hàng sau khi AI xác nhận trên Zalo sẽ được đưa vào phần mềm quản trị như thế nào?',
        a: 'Trong giai đoạn 1, sau khi AI gửi xác nhận, hệ thống hiển thị đầy đủ thông tin chuẩn hóa trên Hàng việc để Sales nhập vào KiotViet, SAP hoặc Base. Ở giai đoạn sau, hệ thống cung cấp sẵn cổng ErpPort để tự động tạo đơn qua API.',
      },
    ],
  },
  {
    slug: 'spa-beauty',
    title: 'Spa, Thẩm mỹ & Chăm sóc Sức khỏe',
    subtitle: 'Chuẩn hóa quy trình tư vấn dịch vụ, tiếp nhận lịch hẹn và chăm sóc khách hàng đa kênh có kiểm soát',
    tagline: 'Tư vấn nhất quán theo cẩm nang dịch vụ và chuyển giao lịch hẹn chuẩn xác cho Lễ tân.',
    icon: '🌸',
    color: '#EC4899',
    description:
      'Hỗ trợ các chuỗi thẩm mỹ viện và spa giải quyết bài toán tư vấn không đồng đều, thất lạc lead ngoài giờ hành chính và bỏ quên khách hàng cũ sau liệu trình.',
    departmentsInvolved: ['Chăm sóc Khách hàng', 'Lễ tân & CSKH Cơ sở', 'Marketing', 'Quản lý Dịch vụ'],
    painPoints: [
      {
        num: '01',
        title: 'Lead từ mạng xã hội bị bỏ lỡ ngoài giờ',
        desc: 'Khách hàng thường tìm hiểu và nhắn tin tư vấn liệu trình vào buổi tối hoặc cuối tuần. Phản hồi chậm khiến khách hàng dễ chuyển sang cơ sở đối thủ.',
      },
      {
        num: '02',
        title: 'Nhân viên tư vấn không đồng nhất về giá và liệu trình',
        desc: 'Bảng giá và gói ưu đãi thay đổi liên tục khiến tư vấn viên mới dễ báo nhầm giá hoặc cam kết sai quy chuẩn kỹ thuật của cơ sở.',
      },
      {
        num: '03',
        title: 'Lịch sử chăm sóc khách hàng bị phân mảnh',
        desc: 'Thông tin liệu trình cũ, phản ứng da và ghi chú đặc biệt của khách không được lưu tập trung, dẫn đến việc chăm sóc sau dịch vụ thiếu chu đáo.',
      },
    ],
    workflowSteps: [
      {
        step: 'BƯỚC 01',
        tag: 'TIẾP NHẬN NHU CẦU',
        title: 'Khách hàng nhắn tin hỏi dịch vụ làm đẹp',
        desc: 'Khách hàng gửi câu hỏi qua Fanpage Messenger hoặc Zalo cơ sở vào bất kỳ lúc nào.',
        example: '“Gói chăm sóc da chuyên sâu bên bạn giá bao nhiêu và mất khoảng bao lâu vậy?”',
        role: 'ai',
      },
      {
        step: 'BƯỚC 02',
        tag: 'ĐỐI CHIẾU CATALOGUE',
        title: 'Tra cứu thông tin dịch vụ trong Source of Truth',
        desc: 'AI tìm kiếm thông tin dịch vụ chăm sóc da trong catalogue đã duyệt của spa, áp dụng đúng chương trình ưu đãi hiện hành.',
        example: 'Dịch vụ: Chăm sóc da chuyên sâu 75 phút · Giá niêm yết: 450.000đ · Ưu đãi: Giảm 20% lần đầu',
        role: 'rules',
      },
      {
        step: 'BƯỚC 03',
        tag: 'TƯ VẤN & GỢI Ý',
        title: 'Phản hồi chi tiết & Hỏi nhu cầu đặt lịch',
        desc: 'AI gửi câu trả lời lịch sự, đầy đủ thông tin và gợi ý thời gian để khách lựa chọn.',
        example: '“Dạ gói chăm sóc da 75 phút bên em có giá 450k (đang ưu đãi 20% còn 360k). Chị muốn ghé cơ sở vào khung giờ nào ạ?”',
        role: 'ai',
      },
      {
        step: 'BƯỚC 04',
        tag: 'BÀN GIAO LỄ TÂN',
        title: 'Chuyển thông tin lịch hẹn cho Lễ tân xác nhận',
        desc: 'Hệ thống tạo phiếu yêu cầu trên Hàng việc để nhân viên Lễ tân gọi điện/nhắn tin chốt lịch chính thức.',
        example: 'Đã tạo phiếu: Khách đặt lịch Chăm sóc da lúc 15:00 Chủ Nhật tại Cơ sở 1',
        role: 'human',
      },
    ],
    capabilities: [
      {
        icon: '✨',
        title: 'Tư vấn thông tin dịch vụ & Bảng giá chuẩn',
        desc: 'Giải đáp thắc mắc về các gói chăm sóc da, thư giãn và làm đẹp dựa trên tài liệu dịch vụ đã được cơ sở phê duyệt.',
        bullets: ['Cung cấp thông tin bảng giá và thời lượng dịch vụ', 'Giải thích quy trình chăm sóc tiêu chuẩn', 'Không đưa ra chẩn đoán y khoa hay cam kết điều trị'],
      },
      {
        icon: '📅',
        title: 'Tiếp nhận thông tin & Hỗ trợ đặt lịch hẹn',
        desc: 'Tự động thu thập nhu cầu, thời gian mong muốn và số điện thoại của khách hàng, sau đó chuyển giao cho Lễ tân xác nhận lịch.',
        bullets: ['Ghi nhận khung giờ và cơ sở khách muốn đến', 'Kiểm tra thông tin liên hệ khách hàng', 'Chuyển phiếu đặt lịch sang hàng việc Lễ tân'],
      },
      {
        icon: '🌸',
        title: 'Nhắc lịch hẹn & Chăm sóc sau dịch vụ',
        desc: 'Gửi tin nhắn tự động nhắc khách lịch hẹn sắp tới hoặc hướng dẫn chăm sóc tại nhà sau liệu trình theo hàng đợi an toàn.',
        bullets: ['Nhắc lịch hẹn trước 2–4 tiếng', 'Gửi hướng dẫn dưỡng da cơ bản sau khi làm đẹp', 'Thu thập phản hồi đánh giá sự hài lòng'],
      },
    ],
    relatedModules: [
      {
        title: 'Chăm sóc Khách hàng (CSKH)',
        desc: 'Mô hình hỗ trợ khách hàng đa kênh 24/7 với sự kiểm soát của con người.',
        href: '/departments/customer-service',
      },
      {
        title: 'Tri thức Doanh nghiệp (Knowledge)',
        desc: 'Quản trị cẩm nang dịch vụ và quy chuẩn phục vụ của cơ sở thẩm mỹ.',
        href: '/products/knowledge',
      },
      {
        title: 'Phòng Tiếp thị (Marketing)',
        desc: 'Điều phối các chiến dịch kích hoạt và nhắc lịch chăm sóc định kỳ.',
        href: '/departments/marketing',
      },
    ],
    faqs: [
      {
        q: 'Hệ thống có đưa ra lời khuyên y khoa hoặc chẩn đoán da liễu không?',
        a: 'Tuyệt đối không. Nexagnet được thiết kế tuân thủ nguyên tắc an toàn nghiêm ngặt: hệ thống chỉ cung cấp thông tin mô tả dịch vụ, bảng giá và tiếp nhận lịch hẹn. Mọi trường hợp cần đánh giá tình trạng da liễu đều được hướng dẫn đến thăm khám trực tiếp với chuyên gia tại cơ sở.',
      },
      {
        q: 'Lễ tân có thể kiểm soát và xem lại các tin nhắn tư vấn không?',
        a: 'Có. Toàn bộ lịch sử trao đổi của khách hàng đều được hiển thị đầy đủ trên giao diện điều hành để nhân viên Lễ tân nắm bắt nhu cầu trước khi tiếp đón khách.',
      },
    ],
  },
  {
    slug: 'real-estate',
    title: 'Bất động sản & Sàn Phân phối',
    subtitle: 'Sàng lọc nhu cầu khách mua, tra cứu tài liệu dự án và phân luồng lead cho môi giới chuyên trách',
    tagline: 'Phản hồi thông tin dự án tức thì và chuyển giao lead chất lượng cao cho chuyên viên môi giới.',
    icon: '🏢',
    color: '#0284C7',
    description:
      'Hỗ trợ chủ đầu tư và sàn giao dịch bất động sản chuẩn hóa quy trình tiếp nhận thông tin dự án, lọc khách theo ngân sách/vị trí và chống thất thoát cơ hội bán hàng.',
    departmentsInvolved: ['Sales Môi giới', 'Marketing Dự án', 'Trưởng phòng Kinh doanh', 'Ban Giám đốc'],
    painPoints: [
      {
        num: '01',
        title: 'Lead phân tán từ nhiều chiến dịch quảng cáo',
        desc: 'Lead đổ về từ Facebook Ads, TikTok, Zalo OA và website cùng lúc khiến đội ngũ trực tổng đài bị quá tải, phản hồi chậm trễ.',
      },
      {
        num: '02',
        title: 'Tư vấn thông số dự án và chính sách bán hàng lặp lại',
        desc: 'Môi giới mất nhiều thời gian trả lời lặp đi lặp lại về diện tích, mặt bằng, tiến độ xây dựng và chính sách chiết khấu từng phân khu.',
      },
      {
        num: '03',
        title: 'Khó đánh giá chất lượng lead trước khi giao môi giới',
        desc: 'Môi giới tốn thời gian gọi điện cho các số rác hoặc khách không đúng tầm tài chính, trong khi khách có nhu cầu thật lại không được chăm sóc kịp thời.',
      },
    ],
    workflowSteps: [
      {
        step: 'BƯỚC 01',
        tag: 'TIẾP NHẬN LEAD',
        title: 'Khách hàng hỏi thông tin dự án',
        desc: 'Khách quan tâm gửi câu hỏi qua kênh chat về căn hộ hoặc phân khu dự án.',
        example: '“Căn 2 phòng ngủ dự án River Park giá khoảng bao nhiêu? Có hỗ trợ vay không em?”',
        role: 'ai',
      },
      {
        step: 'BƯỚC 02',
        tag: 'TRA CỨU DỰ ÁN',
        title: 'AI trích xuất tài liệu dự án chính thống',
        desc: 'Đối chiếu thông tin diện tích, khoảng giá niêm yết và chính sách hỗ trợ ngân hàng từ tài liệu chủ đầu tư duyệt.',
        example: 'Căn 2PN: 68-75m² · Khoảng giá: 3.2 - 3.8 tỷ · Hỗ trợ vay 70% ân hạn nợ gốc',
        role: 'rules',
      },
      {
        step: 'BƯỚC 03',
        tag: 'SÀNG LỌC NHU CẦU',
        title: 'Hỏi thêm nhu cầu & Thời gian xem nhà mẫu',
        desc: 'AI khai thác khéo léo tầm tài chính sẵn có và đề xuất đặt lịch tham quan nhà mẫu.',
        example: '“Dự án đang mở cửa căn mẫu tầng 5. Anh muốn ghé tham quan vào sáng thứ 7 hay chiều chủ nhật ạ?”',
        role: 'ai',
      },
      {
        step: 'BƯỚC 04',
        tag: 'PHÂN BỔ MÔI GIỚI',
        title: 'Chuyển thông tin lead cho Chuyên viên phụ trách',
        desc: 'Hệ thống gom đầy đủ nhu cầu, ngân sách và lịch hẹn bàn giao trực tiếp cho môi giới khu vực.',
        example: 'Đã tạo phiếu Lead: Khách Nguyễn Văn A · Ngân sách 3.5 tỷ · Hẹn xem nhà 10:00 T7',
        role: 'human',
      },
    ],
    capabilities: [
      {
        icon: '📋',
        title: 'Tư vấn thông số & Chính sách bán hàng',
        desc: 'Cung cấp chính xác vị trí, tiện ích, mặt bằng phân khu và tiến độ thanh toán chuẩn từ chủ đầu tư.',
        bullets: ['Tra cứu mặt bằng căn hộ và tiện ích', 'Cung cấp khoảng giá và chính sách chiết khấu', 'Không đưa ra lời khuyên đầu tư tài chính suy đoán'],
      },
      {
        icon: '🎯',
        title: 'Sàng lọc nhu cầu & Đặt lịch xem nhà mẫu',
        desc: 'Khai thác nhu cầu về số phòng ngủ, tầm tài chính và thời điểm dự kiến mua để phân loại lead chất lượng.',
        bullets: ['Phân loại lead theo ngân sách và khu vực', 'Tiếp nhận thời gian khách rảnh', 'Tự động tạo phiếu bàn giao chuyên viên'],
      },
      {
        icon: '📱',
        title: 'Phân luồng & Bàn giao môi giới tức thì',
        desc: 'Chuyển tiếp thông tin khách hàng tiềm năng đến đúng chuyên viên môi giới phụ trách giỏ hàng tương ứng.',
        bullets: ['Bàn giao thông tin kèm toàn bộ ngữ cảnh trao đổi', 'Giảm thời gian chờ đợi của khách', 'Giúp Trưởng phòng theo dõi tỷ lệ tiếp nhận lead'],
      },
    ],
    relatedModules: [
      {
        title: 'Phòng Bán hàng (Sales)',
        desc: 'Quy trình tiếp nhận và luân chuyển lead cho đội ngũ kinh doanh bất động sản.',
        href: '/departments/sales',
      },
      {
        title: 'Phòng Tiếp thị (Marketing)',
        desc: 'Đồng bộ lead từ đa kênh quảng cáo và phân luồng tự động.',
        href: '/departments/marketing',
      },
      {
        title: 'Tri thức Doanh nghiệp (Knowledge)',
        desc: 'Quản trị tập trung bảng giá, mặt bằng và pháp lý dự án.',
        href: '/products/knowledge',
      },
    ],
    faqs: [
      {
        q: 'Hệ thống có tự động tư vấn cam kết lợi nhuận đầu tư không?',
        a: 'Tuyệt đối không. Hệ thống tuân thủ nguyên tắc chỉ cung cấp thông tin dự án, mặt bằng, tiến độ và chính sách bán hàng đã được chủ đầu tư công bố chính thức. AI không bao giờ đưa ra các cam kết lợi nhuận đầu tư hay nhận định tài chính suy đoán.',
      },
      {
        q: 'Làm thế nào để môi giới nhận được thông báo ngay khi có khách hẹn xem nhà?',
        a: 'Hệ thống ngay lập tức tạo thẻ việc trên giao diện Hàng việc và gửi thông báo tới chuyên viên môi giới được phân công phụ trách dự án.',
      },
    ],
  },
  {
    slug: 'education',
    title: 'Giáo dục & Đào tạo',
    subtitle: 'Chuẩn hóa quy trình tư vấn tuyển sinh, giải đáp chương trình học và phân luồng phụ huynh/học viên',
    tagline: 'Cung cấp thông tin khóa học, lịch khai giảng chính xác và chuyển giao hồ sơ tư vấn cho chuyên viên tuyển sinh.',
    icon: '🎓',
    color: '#7C3AED',
    description:
      'Hỗ trợ các trường học, trung tâm ngoại ngữ và học viện đào tạo giải quyết áp lực mùa tuyển sinh cao điểm, tư vấn học phí chuẩn xác và theo dõi tiến trình nhập học.',
    departmentsInvolved: ['Tư vấn Tuyển sinh', 'Phòng Đào tạo', 'Marketing Tuyển sinh', 'Ban Giám hiệu'],
    painPoints: [
      {
        num: '01',
        title: 'Khối lượng câu hỏi tuyển sinh dồn dập trong mùa cao điểm',
        desc: 'Hàng ngàn phụ huynh và học viên liên hệ cùng lúc hỏi về điều kiện xét tuyển, học phí, học bổng và lịch khai giảng khiến tư vấn viên quá tải.',
      },
      {
        num: '02',
        title: 'Chương trình đào tạo và biểu phí thay đổi liên tục',
        desc: 'Mỗi kỳ tuyển sinh có chính sách ưu đãi học phí và tiêu chuẩn đầu vào riêng, dễ dẫn đến việc tư vấn viên mới báo sai thông tin.',
      },
      {
        num: '03',
        title: 'Thất lạc thông tin đăng ký học thử và xét tuyển',
        desc: 'Hồ sơ đăng ký từ form website, fanpage và hotline không được đồng bộ tập trung, dẫn đến việc chăm sóc follow-up bị chậm trễ.',
      },
    ],
    workflowSteps: [
      {
        step: 'BƯỚC 01',
        tag: 'TIẾP NHẬN YÊU CẦU',
        title: 'Phụ huynh/học viên hỏi thông tin khóa học',
        desc: 'Người học gửi câu hỏi qua chat về chương trình đào tạo, học phí hoặc lịch thi thử.',
        example: '“Khóa luyện thi IELTS mục tiêu 6.5 học phí bao nhiêu và có lớp tối 2-4-6 không ạ?”',
        role: 'ai',
      },
      {
        step: 'BƯỚC 02',
        tag: 'ĐỐI CHIẾU CHƯƠNG TRÌNH',
        title: 'Tra cứu giáo trình & Lịch khai giảng trong Source of Truth',
        desc: 'AI đối chiếu lộ trình đào tạo, học phí niêm yết và các cơ sở có lớp học phù hợp với yêu cầu.',
        example: 'Khóa IELTS Intensive 6.5 · Học phí: 8.500.000đ/khóa · Lớp tối 2-4-6 khai giảng 15/09 tại CS Cầu Giấy',
        role: 'rules',
      },
      {
        step: 'BƯỚC 03',
        tag: 'TƯ VẤN & GỢI Ý THI THỬ',
        title: 'Phản hồi chi tiết & Mời đăng ký kiểm tra trình độ',
        desc: 'AI cung cấp thông tin học phí rõ ràng và gợi ý làm bài test đầu vào miễn phí để xếp lớp chuẩn.',
        example: '“Dạ khóa học kéo dài 3 tháng. Để xếp đúng lớp, trung tâm có bài test đầu vào miễn phí vào thứ 7 này ạ.”',
        role: 'ai',
      },
      {
        step: 'BƯỚC 04',
        tag: 'BÀN GIAO TUYỂN SINH',
        title: 'Chuyển thông tin cho Chuyên viên tư vấn gọi lại',
        desc: 'Hệ thống tạo phiếu tuyển sinh để chuyên viên tư vấn gọi điện xác nhận lịch kiểm tra và hỗ trợ hồ sơ.',
        example: 'Đã tạo phiếu: Học viên Trần B · Nhu cầu IELTS 6.5 · Đăng ký test trình độ 14:00 T7',
        role: 'human',
      },
    ],
    capabilities: [
      {
        icon: '📚',
        title: 'Tư vấn chương trình học & Biểu phí niêm yết',
        desc: 'Cung cấp thông tin chuẩn xác về lộ trình học, thời lượng, giáo trình và mức học phí đã được phòng đào tạo phê duyệt.',
        bullets: ['Tra cứu lịch khai giảng theo từng cơ sở', 'Giải đáp chính sách học bổng và ưu đãi', 'Cung cấp thông tin chuẩn không sai lệch'],
      },
      {
        icon: '📝',
        title: 'Tiếp nhận đăng ký thi thử & Tư vấn đầu vào',
        desc: 'Tự động thu thập thông tin người học, trình độ hiện tại và nguyện vọng để sắp xếp lịch hẹn kiểm tra chất lượng.',
        bullets: ['Thu thập thông tin liên hệ và cơ sở mong muốn', 'Hẹn lịch làm bài test năng lực', 'Chuyển phiếu đăng ký sang bộ phận tuyển sinh'],
      },
      {
        icon: '🎯',
        title: 'Theo dõi tiến trình hồ sơ nhập học',
        desc: 'Hỗ trợ nhắc nhở học viên chuẩn bị giấy tờ, thông báo ngày tựu trường và hướng dẫn hoàn thiện thủ tục nhập học.',
        bullets: ['Hướng dẫn thủ tục nộp hồ sơ xét tuyển', 'Nhắc lịch đóng học phí và ngày khai giảng', 'Lưu nhật ký tương tác đầy đủ'],
      },
    ],
    relatedModules: [
      {
        title: 'Chăm sóc Khách hàng (CSKH)',
        desc: 'Giải đáp thắc mắc của phụ huynh và học viên 24/7.',
        href: '/departments/customer-service',
      },
      {
        title: 'Tri thức Doanh nghiệp (Knowledge)',
        desc: 'Quản trị tập trung cẩm nang khóa học, biểu phí và quy chế tuyển sinh.',
        href: '/products/knowledge',
      },
      {
        title: 'Phòng Bán hàng & Tuyển sinh (Sales)',
        desc: 'Quy trình tiếp nhận và luân chuyển lead học viên.',
        href: '/departments/sales',
      },
    ],
    faqs: [
      {
        q: 'Hệ thống có tự động thay đổi mức học phí hay giảm giá được không?',
        a: 'Không. Hệ thống tuyệt đối chỉ báo mức học phí và chính sách học bổng đã được công bố chính thức trong cơ sở dữ liệu. Mọi trường hợp xin miễn giảm đặc biệt đều được chuyển cho Ban Tuyển sinh phê duyệt.',
      },
      {
        q: 'Hệ thống có hỗ trợ nhiều cơ sở đào tạo khác nhau không?',
        a: 'Có. Nexagnet hỗ trợ phân luồng dữ liệu theo từng chi nhánh/cơ sở đào tạo, giúp phụ huynh tra cứu chính xác lịch học tại địa điểm thuận tiện nhất.',
      },
    ],
  },
  {
    slug: 'hospitality',
    title: 'Khách sạn, Lưu trú & Dịch vụ',
    subtitle: 'Tự động hóa tiếp nhận yêu cầu đặt phòng, tư vấn dịch vụ tiện ích và phân luồng công việc đa phòng ban',
    tagline: 'Phục vụ khách lưu trú 24/7 và điều phối công việc mượt mà giữa Lễ tân, Buồng phòng và Nhà hàng.',
    icon: '🛎️',
    color: '#F59E0B',
    description:
      'Giải quyết điểm nghẽn chuyển giao thông tin giữa các bộ phận trong khách sạn: Khách hỏi nhiều kênh, yêu cầu phòng ốc/ẩm thực đến nhiều nơi và nhân viên phải chuyển tay thủ công.',
    departmentsInvolved: ['Lễ tân (Front Desk)', 'CSKH Đa kênh', 'Buồng phòng & Kỹ thuật', 'Nhà hàng & F&B'],
    painPoints: [
      {
        num: '01',
        title: 'Yêu cầu của khách gửi qua nhiều kênh phân tán',
        desc: 'Khách hàng nhắn tin hỏi phòng qua OTA, Fanpage, Zalo và gọi hotline nội bộ cùng lúc, khiến Lễ tân dễ bỏ sót yêu cầu đặc biệt.',
      },
      {
        num: '02',
        title: 'Chuyển việc thủ công giữa các bộ phận',
        desc: 'Khi khách yêu cầu dọn phòng, thêm gối hoặc đặt bàn ăn, Lễ tân phải gọi điện hoặc nhắn tin riêng cho Buồng phòng/F&B, dễ thất lạc và khó theo dõi tiến độ.',
      },
      {
        num: '03',
        title: 'Khó kiểm soát trạng thái hoàn thành yêu cầu',
        desc: 'Quản lý không nắm được yêu cầu nào của khách đang bị trễ hoặc chưa có nhân sự xử lý, ảnh hưởng trực tiếp đến điểm đánh giá dịch vụ.',
      },
    ],
    workflowSteps: [
      {
        step: 'BƯỚC 01',
        tag: 'TIẾP NHẬN YÊU CẦU',
        title: 'Khách gửi yêu cầu dịch vụ hoặc đặt phòng',
        desc: 'Khách lưu trú nhắn tin qua kênh chat của khách sạn hoặc mã QR tại phòng.',
        example: '“Phòng 402 cần thêm 2 chai nước suối và 1 bộ khăn tắm mới nhé”',
        role: 'ai',
      },
      {
        step: 'BƯỚC 02',
        tag: 'ĐỌC HIỂU & PHÂN LOẠI',
        title: 'AI bóc tách loại yêu cầu & Số phòng',
        desc: 'AI nhận diện số phòng, vật phẩm cần cung cấp và phân loại yêu cầu thuộc trách nhiệm Buồng phòng (Housekeeping).',
        example: 'Loại: Housekeeping Request · Phòng: 402 · Vật phẩm: 2 Nước suối, 1 Bộ khăn',
        role: 'ai',
      },
      {
        step: 'BƯỚC 03',
        tag: 'PHÂN LUỒNG TÁC VỤ',
        title: 'Hệ thống tự động tạo việc cho nhân sự phụ trách',
        desc: 'Quy trình tạo thẻ việc tức thì trên Hàng việc của Đội Buồng phòng tầng 4 kèm thời gian yêu cầu.',
        example: 'Đã chuyển phiếu công việc tới Đội Buồng phòng Tầng 4 · SLA xử lý: 15 phút',
        role: 'system',
      },
      {
        step: 'BƯỚC 04',
        tag: 'HOÀN TẤT & PHẢN HỒI',
        title: 'Nhân viên hoàn tất & Hệ thống xác nhận với khách',
        desc: 'Sau khi nhân viên bấm hoàn thành, hệ thống gửi tin nhắn cảm ơn và ghi nhận đánh giá hài lòng.',
        example: 'Đã hoàn tất lúc 14:22 · Lưu vết vào nhật ký quản trị buồng phòng',
        role: 'human',
      },
    ],
    capabilities: [
      {
        icon: '🛎️',
        title: 'Tư vấn thông tin dịch vụ & Loại phòng',
        desc: 'Giải đáp thông tin về các hạng phòng, giờ nhận/trả phòng, menu nhà hàng và tiện ích hồ bơi, spa của khách sạn.',
        bullets: ['Cung cấp bảng giá phòng niêm yết', 'Thông tin menu ẩm thực và dịch vụ đưa đón', 'Quy định nhận/trả phòng tiêu chuẩn'],
      },
      {
        icon: '🔄',
        title: 'Phân luồng yêu cầu liên phòng ban tự động',
        desc: 'Tự động chuyển tiếp yêu cầu của khách đến đúng bộ phận (Lễ tân, Buồng phòng, Kỹ thuật, F&B) mà không cần chuyển tay.',
        bullets: ['Phân loại yêu cầu chính xác theo nghiệp vụ', 'Gán việc theo tầng và ca trực', 'Giảm thời gian xử lý yêu cầu của khách'],
      },
      {
        icon: '📊',
        title: 'Giám sát tiến độ & Cảnh báo trễ hạn',
        desc: 'Cung cấp góc nhìn vận hành cho Quản lý ca để biết các yêu cầu nào đang chờ xử lý và phát hiện việc bị tắc.',
        bullets: ['Theo dõi hàng việc theo thời gian thực', 'Cảnh báo khi yêu cầu vượt thời gian chuẩn', 'Lưu nhật ký phục vụ phục vụ đánh giá chất lượng'],
      },
    ],
    relatedModules: [
      {
        title: 'Phòng Vận hành (Operations)',
        desc: 'Luân chuyển công việc và giám sát hàng việc liên phòng ban.',
        href: '/departments/operations',
      },
      {
        title: 'Chăm sóc Khách hàng (CSKH)',
        desc: 'Giải đáp thắc mắc và hỗ trợ khách lưu trú đa kênh 24/7.',
        href: '/departments/customer-service',
      },
      {
        title: 'Tri thức Doanh nghiệp (Knowledge)',
        desc: 'Quản trị cẩm nang dịch vụ và quy chuẩn phục vụ của khách sạn.',
        href: '/products/knowledge',
      },
    ],
    faqs: [
      {
        q: 'Hệ thống có tự động trừ phòng trong hệ thống PMS của khách sạn không?',
        a: 'Trong giai đoạn 1, hệ thống đóng vai trò tiếp nhận, bóc tách thông tin và tạo phiếu yêu cầu cho Lễ tân xác nhận. Khi tích hợp với PMS/ERP ở giai đoạn sau, hệ thống cung cấp sẵn cổng kết nối tiêu chuẩn để đồng bộ dữ liệu.',
      },
      {
        q: 'Nhân viên buồng phòng có cần cài đặt phần mềm phức tạp không?',
        a: 'Không cần. Nhân sự có thể nhận việc trực tiếp qua giao diện điều hành đơn giản hoặc qua thông báo trên kênh trao đổi nội bộ.',
      },
    ],
  },
  {
    slug: 'healthcare-clinic',
    title: 'Y tế, Phòng khám & Nha khoa',
    subtitle: 'Tiếp nhận phân loại lịch hẹn khám bệnh, tư vấn cẩm nang dịch vụ y khoa và nhắc lịch tái khám tự động',
    tagline: 'Giảm tải cho đội ngũ Lễ tân & Điều dưỡng, đồng thời chuẩn hóa quy trình chăm sóc bệnh nhân trước và sau khám.',
    icon: '🩺',
    color: '#0EA5E9',
    description:
      'Giải quyết các điểm nghẽn trong vận hành phòng khám: Lịch khám của các bác sĩ chuyên khoa bị chồng chéo, bệnh nhân hỏi ngoài giờ làm việc và việc gọi điện nhắc tái khám thủ công gây tốn kém thời gian.',
    departmentsInvolved: ['Lễ tân & Tiếp đón', 'Bác sĩ chuyên khoa', 'CSKH & Tái khám', 'Kế toán & Thu ngân'],
    painPoints: [
      {
        num: '01',
        title: 'Lịch khám của bác sĩ dễ bị trùng hoặc phân bổ không đều',
        desc: 'Bệnh nhân đăng ký qua nhiều kênh (Hotline, Zalo, Fanpage, trực tiếp) dẫn đến nguy cơ ghi trùng giờ khám hoặc dồn cục vào một khung giờ.',
      },
      {
        num: '02',
        title: 'Bệnh nhân hỏi tư vấn triệu chứng và dịch vụ ngoài giờ',
        desc: 'Các câu hỏi về quy trình chuẩn bị xét nghiệm, bảng giá chụp chiếu, giờ làm việc ngoài giờ không được phản hồi kịp thời khiến bệnh nhân tìm sang cơ sở khác.',
      },
      {
        num: '03',
        title: 'Thất lạc lịch tái khám và theo dõi sau điều trị',
        desc: 'Nhân viên không có công cụ nhắc lịch tự động cho từng phác đồ điều trị, dẫn đến tỷ lệ bệnh nhân quay lại tái khám thấp.',
      },
    ],
    workflowSteps: [
      {
        step: 'BƯỚC 01',
        tag: 'TIẾP NHẬN ĐĂNG KÝ',
        role: 'ai',
        title: 'Bệnh nhân gửi nhu cầu khám hoặc hỏi dịch vụ',
        desc: 'Bệnh nhân nhắn tin qua kênh Zalo/Fanpage của phòng khám để hỏi lịch và chi phí.',
        example: '“Tôi muốn đặt lịch khám răng cho bé 7 tuổi vào sáng thứ 7 tuần này ở cơ sở Cầu Giấy”',
      },
      {
        step: 'BƯỚC 02',
        tag: 'ĐỌC HIỂU & PHÂN LOẠI',
        role: 'ai',
        title: 'AI bóc tách chuyên khoa & Khung giờ mong muốn',
        desc: 'AI nhận diện chuyên khoa Răng Trẻ Em, địa điểm Cơ sở Cầu Giấy và thời gian Sáng Thứ 7.',
        example: 'Chuyên khoa: Nha khoa Nhi · Cơ sở: Cầu Giấy · Thời gian: Thứ Bảy (08:30 - 11:30)',
      },
      {
        step: 'BƯỚC 03',
        tag: 'ĐỐI SOÁT QUY TẮC',
        role: 'rules',
        title: 'Rules Engine kiểm tra khung lịch trống & Giá niêm yết',
        desc: 'Hệ thống đối chiếu lịch trực của Bác sĩ chuyên khoa Nhi và kiểm tra bảng giá dịch vụ khám ban đầu đã duyệt.',
        example: 'Khung giờ khả dụng: 09:15 Thứ Bảy · Bác sĩ phụ trách: BS. Nguyễn Văn A · Giá khám: 200.000 đ',
      },
      {
        step: 'BƯỚC 04',
        tag: 'XÁC NHẬN & TẠO PHIẾU',
        role: 'human',
        title: 'Lễ tân tiếp nhận phiếu hẹn & Xác nhận với bệnh nhân',
        desc: 'Phiếu hẹn xuất hiện trên Hàng việc Lễ tân kèm mã bệnh nhân; hệ thống gửi tin nhắn hướng dẫn chuẩn bị trước khi đến.',
        example: 'Đã tạo phiếu tiếp đón mã #PK-8842 · Gửi tin nhắn xác nhận kèm vị trí định vị cơ sở',
      },
    ],
    capabilities: [
      {
        icon: '📅',
        title: 'Điều phối đặt lịch khám thông minh',
        desc: 'Tiếp nhận và xếp lịch khám tự động theo chuyên khoa, bác sĩ và chi nhánh, tránh trùng lặp giờ khám.',
        bullets: ['Kiểm tra lịch trực khả dụng của bác sĩ', 'Phân bổ giãn cách bệnh nhân an toàn', 'Tự động gửi thông báo xác nhận lịch hẹn'],
      },
      {
        icon: '📖',
        title: 'Cẩm nang tư vấn dịch vụ y khoa chuẩn mực',
        desc: 'Cung cấp thông tin bảng giá, quy trình chuẩn bị trước khi xét nghiệm và danh mục dịch vụ theo tài liệu chuyên môn đã duyệt.',
        bullets: ['Bảng giá niêm yết công khai chính xác', 'Hướng dẫn nhịn ăn trước khi xét nghiệm máu', 'Không chẩn đoán bừa bãi hay tư vấn sai chuyên môn'],
      },
      {
        icon: '🔔',
        title: 'Nhắc lịch tái khám & Chăm sóc sau khám',
        desc: 'Lên lịch nhắc bệnh nhân quay lại kiểm tra theo từng mốc phác đồ điều trị, nâng cao tỷ lệ tái khám.',
        bullets: ['Gửi tin nhắn nhắc tái khám trước 1 ngày', 'Thu thập đánh giá mức độ hài lòng', 'Lưu nhật ký tương tác phục vụ hồ sơ bệnh nhân'],
      },
    ],
    relatedModules: [
      {
        title: 'Chăm sóc Khách hàng (CSKH)',
        desc: 'Tiếp nhận câu hỏi và hỗ trợ bệnh nhân 24/7.',
        href: '/departments/customer-service',
      },
      {
        title: 'Phòng Vận hành (Operations)',
        desc: 'Điều phối luồng công việc giữa Lễ tân, Điều dưỡng và Bác sĩ.',
        href: '/departments/operations',
      },
      {
        title: 'Tri thức Doanh nghiệp (Knowledge)',
        desc: 'Quản trị cẩm nang dịch vụ và bảng giá khám bệnh.',
        href: '/products/knowledge',
      },
    ],
    faqs: [
      {
        q: 'Hệ thống có tự động chẩn đoán bệnh hay kê đơn thuốc không?',
        a: 'Tuyệt đối không. Nexagnet chỉ đóng vai trò phân loại hành chính, cung cấp thông tin thủ tục và xếp lịch hẹn. Mọi việc chẩn đoán và kê đơn đều do Bác sĩ có chứng chỉ hành nghề thực hiện.',
      },
      {
        q: 'Dữ liệu sức khỏe của bệnh nhân có được bảo mật không?',
        a: 'Có. Hệ thống tuân thủ nghiêm ngặt Luật Bảo vệ Dữ liệu Cá nhân 91/2025/QH15 và Nghị định 356/2025, mã hóa thông tin và phân quyền truy cập theo từng vai trò nhân sự.',
      },
    ],
  },
  {
    slug: 'manufacturing',
    title: 'Sản xuất, Gia công & FMCG',
    subtitle: 'Bóc tách đơn hàng theo mã quy cách vật tư, kiểm soát định mức và luân chuyển thông suốt giữa Kinh doanh, Xưởng và Kho',
    tagline: 'Chấm dứt tình trạng sản xuất sai quy cách, đứt gãy thông tin giữa Sales và Quản đốc xưởng.',
    icon: '🏭',
    color: '#64748B',
    description:
      'Giải quyết các vấn đề vận hành của doanh nghiệp sản xuất và gia công: Đơn hàng gửi qua chat có nhiều mã quy cách phức tạp, việc chuyển giao bản vẽ kỹ thuật và phiếu đặt hàng cho xưởng bị trễ, gây sai hỏng lãng phí nguyên vật liệu.',
    departmentsInvolved: ['Phòng Kinh doanh (B2B)', 'Ban Quản đốc Xưởng', 'Kho vật tư & Thành phẩm', 'Kế toán Giá thành'],
    painPoints: [
      {
        num: '01',
        title: 'Đơn đặt hàng sản xuất có nhiều biến thể và quy cách',
        desc: 'Khách hàng đặt hàng với các thông số kỹ thuật (kích thước, chất liệu, màu sắc, độ dày) gửi qua tin nhắn chat dễ bị nhân viên hiểu sai hoặc ghi sót chi tiết.',
      },
      {
        num: '02',
        title: 'Đứt gãy thông tin giữa Kinh doanh và Quản đốc xưởng',
        desc: 'Sales báo đơn qua điện thoại hoặc tin nhắn riêng cho xưởng, xưởng làm theo trí nhớ mà không có phiếu yêu cầu sản xuất chuẩn hóa.',
      },
      {
        num: '03',
        title: 'Khó kiểm soát tiến độ giao hàng và tồn kho vật tư',
        desc: 'Không nắm rõ đơn hàng nào đang ở công đoạn cắt, may, lắp ráp hay đóng gói, dẫn đến trễ hẹn bàn giao cho khách.',
      },
    ],
    workflowSteps: [
      {
        step: 'BƯỚC 01',
        tag: 'TIẾP NHẬN ĐƠN SẢN XUẤT',
        role: 'ai',
        title: 'Khách hàng B2B gửi yêu cầu đặt gia công',
        desc: 'Đại lý hoặc đối tác gửi bảng kê số lượng và quy cách kỹ thuật qua Zalo.',
        example: '“Gia công gấp 2.000 hộp giấy kraft 250gsm ép kim logo vàng, giao trước ngày 15/9”',
      },
      {
        step: 'BƯỚC 02',
        tag: 'BÓC TÁCH THÔNG SỐ',
        role: 'ai',
        title: 'AI trích xuất quy cách vật tư & Định mức kỹ thuật',
        desc: 'AI nhận diện số lượng 2.000, loại vật liệu giấy kraft 250gsm, công đoạn hoàn thiện ép kim logo vàng.',
        example: 'Mã thành phẩm: HK-250K · Định mức: Giấy kraft 250gsm · Gia công: Ép kim vàng · SL: 2.000',
      },
      {
        step: 'BƯỚC 03',
        tag: 'ĐỐI SOÁT GIÁ & NGUYÊN LIỆU',
        role: 'rules',
        title: 'Rules Engine kiểm tra định mức & Khả năng đáp ứng',
        desc: 'Thuật toán đối soát bảng giá gia công đại lý, tính toán tổng chi phí và kiểm tra điều kiện xuất vật tư.',
        example: 'Đơn giá: 4.800 đ/hộp · Tổng: 9.600.000 đ · Tồn kho vật tư giấy kraft: Đủ đáp ứng',
      },
      {
        step: 'BƯỚC 04',
        tag: 'LỆNH SẢN XUẤT',
        role: 'human',
        title: 'Quản đốc xưởng duyệt Lệnh Sản xuất (Work Order)',
        desc: 'Phiếu sản xuất được chuyển tới Quản đốc xưởng để sắp xếp ca máy và lịch chạy xưởng.',
        example: 'Đã phát hành Lệnh sản xuất #WO-9912 · Giao xưởng in và hoàn thiện ca sáng 10/9',
      },
    ],
    capabilities: [
      {
        icon: '📋',
        title: 'Bóc tách thông số kỹ thuật chuẩn xác',
        desc: 'Tự động trích xuất các quy cách, kích thước, độ dày và vật liệu từ tin nhắn hoặc bảng kê của khách hàng.',
        bullets: ['Ánh xạ vào mã vật tư chuẩn của nhà máy', 'Cảnh báo khi thiếu thông số quan trọng', 'Giảm thiểu rủi ro sản xuất sai quy cách'],
      },
      {
        icon: '⚙️',
        title: 'Tự động hóa luân chuyển Lệnh Sản xuất',
        desc: 'Chuyển giao thông tin đơn hàng từ phòng Kinh doanh tới Quản đốc xưởng và Kế toán kho một cách minh bạch.',
        bullets: ['Tạo phiếu yêu cầu sản xuất tự động', 'Gắn mã lô hàng để theo dõi tiến độ', 'Lưu vết trách nhiệm từng công đoạn'],
      },
      {
        icon: '📊',
        title: 'Giám sát tiến độ & Cảnh báo trễ hạn giao hàng',
        desc: 'Theo dõi tình trạng từng lệnh sản xuất trên bảng điều khiển vận hành, phát hiện điểm nghẽn ở từng xưởng.',
        bullets: ['Báo cáo trạng thái theo thời gian thực', 'Cảnh báo khi đơn hàng sắp đến hạn giao', 'Hỗ trợ đối soát nguyên vật liệu tiêu hao'],
      },
    ],
    relatedModules: [
      {
        title: 'Phòng Vận hành (Operations)',
        desc: 'Luân chuyển lệnh sản xuất và theo dõi tiến độ gia công.',
        href: '/departments/operations',
      },
      {
        title: 'Xử lý Đơn hàng (Order Automation)',
        desc: 'Bóc tách và đối soát đơn hàng B2B theo bảng giá đại lý.',
        href: '/products/order-automation',
      },
      {
        title: 'Tài chính & Kế toán (Finance)',
        desc: 'Đối soát chi phí nguyên vật liệu và tiến độ thanh toán.',
        href: '/departments/finance',
      },
    ],
    faqs: [
      {
        q: 'Hệ thống có thay thế được phần mềm quản lý sản xuất MES/ERP không?',
        a: 'Không. Trong giai đoạn 1, Nexagnet là lớp AI tiếp nhận, bóc tách và chuẩn hóa yêu cầu trước khi chuyển giao lệnh cho xưởng. Khi mở rộng, hệ thống có sẵn cổng kết nối để đẩy dữ liệu vào ERP/MES.',
      },
      {
        q: 'Nếu đơn hàng có yêu cầu bản vẽ kỹ thuật phức tạp thì xử lý thế nào?',
        a: 'AI sẽ trích xuất các yêu cầu cơ bản và gắn kèm file bản vẽ vào phiếu công việc, sau đó chuyển thẳng cho Kỹ sư trưởng xưởng thẩm định trước khi duyệt sản xuất.',
      },
    ],
  },
  {
    slug: 'logistics',
    title: 'Vận tải, Kho bãi & Logistics',
    subtitle: 'Đọc hiểu vận đơn, tra cứu biểu cước đa phương thức và điều phối xử lý sự cố giao vận theo thời gian thực',
    tagline: 'Tăng tốc độ báo giá cước vận chuyển và giám sát chặt chẽ tình trạng giao hàng trên từng chuyến xe.',
    icon: '🚚',
    color: '#F97316',
    description:
      'Giải quyết các thách thức vận hành của ngành logistics: Báo giá cước đường bộ, đường biển, đường hàng không bị chậm trễ; thông tin sự cố hư hỏng/trễ hàng không được cập nhật kịp thời giữa Điều vận, Khách hàng và Tài xế.',
    departmentsInvolved: ['Điều hành Vận tải (Dispatcher)', 'Chăm sóc Khách hàng', 'Đội xe & Tài xế', 'Kế toán Công nợ Cước'],
    painPoints: [
      {
        num: '01',
        title: 'Báo giá cước vận tải mất nhiều thời gian tra cứu',
        desc: 'Mỗi tuyến đường, tải trọng xe và phụ phí cầu đường, nâng hạ có biểu giá khác nhau. Nhân viên phải tính toán thủ công từng chuyến, dễ sai sót.',
      },
      {
        num: '02',
        title: 'Sự cố phát sinh trên đường chuyển tiếp chậm',
        desc: 'Khi xe bị trễ do tắc đường, hỏng xe hoặc sự cố giao nhận, thông tin không được thông báo kịp thời cho khách hàng, gây bức xúc.',
      },
      {
        num: '03',
        title: 'Đối soát chứng từ giao nhận (POD) và công nợ xe',
        desc: 'Biên bản bàn giao hàng (POD) bị thất lạc hoặc gửi về muộn khiến kế toán chậm thanh toán cho đối tác vận tải và chậm xuất hóa đơn cho chủ hàng.',
      },
    ],
    workflowSteps: [
      {
        step: 'BƯỚC 01',
        tag: 'TIẾP NHẬN YÊU CẦU',
        role: 'ai',
        title: 'Chủ hàng gửi yêu cầu vận chuyển hoặc tra cứu cước',
        desc: 'Khách hàng nhắn tin thông tin tuyến đường, trọng lượng và loại hàng hóa qua chat.',
        example: '“Cần 1 xe 5 tấn chở gạch men từ KCN Tiên Sơn Bắc Ninh về công trình tại Vinh, đi tối nay”',
      },
      {
        step: 'BƯỚC 02',
        tag: 'BÓC TÁCH TUYẾN ĐƯỜNG',
        role: 'ai',
        title: 'AI trích xuất địa điểm, tải trọng & Thời gian bốc hàng',
        desc: 'AI nhận diện điểm đi Tiên Sơn (Bắc Ninh), điểm đến Vinh (Nghệ An), tải trọng 5 tấn, loại hàng Gạch men.',
        example: 'Tuyến: Bắc Ninh → Vinh · Tải trọng: Xe 5T · Loại hàng: Gạch men · Thời gian: Tối nay (20:00)',
      },
      {
        step: 'BƯỚC 03',
        tag: 'TÍNH CƯỚC TẤT ĐỊNH',
        role: 'rules',
        title: 'Rules Engine tính toán biểu cước & Phụ phí theo bảng giá',
        desc: 'Hệ thống tính cước theo khoảng cách km, phụ phí bốc xếp và đối soát hạn mức công nợ của chủ hàng.',
        example: 'Cước chuẩn: 6.200.000 đ · Phụ phí bốc xếp: 300.000 đ · Tổng cước: 6.500.000 đ (Chưa VAT)',
      },
      {
        step: 'BƯỚC 04',
        tag: 'ĐIỀU XE & XÁC NHẬN',
        role: 'human',
        title: 'Điều vận gán xe & Xác nhận lịch trình với khách hàng',
        desc: 'Phiếu điều xe xuất hiện trên bảng việc của Điều vận để gán biển số xe và gửi xác nhận cho chủ hàng.',
        example: 'Đã gán xe 29C-881.24 (Tài xế: Nguyễn Văn B) · Gửi thông báo xác nhận lịch nhận hàng',
      },
    ],
    capabilities: [
      {
        icon: '🗺️',
        title: 'Tính toán cước phí tự động & chính xác',
        desc: 'Tự động tính cước theo cự ly, loại phương tiện, tải trọng và phụ phí theo biểu cước đã duyệt.',
        bullets: ['Biểu giá cước niêm yết theo tuyến', 'Tính toán phụ phí bốc xếp và cầu đường tự động', 'Không để nhân viên báo nhầm giá cước'],
      },
      {
        icon: '⚠️',
        title: 'Phân luồng & Cảnh báo sự cố hành trình',
        desc: 'Tiếp nhận thông tin sự cố từ tài xế và tự động tạo thông báo cảnh báo cho đội ngũ CSKH và chủ hàng.',
        bullets: ['Cập nhật trạng thái chậm chuyến tức thì', 'Tự động luân chuyển yêu cầu hỗ trợ kỹ thuật', 'Lưu nhật ký hành trình chuyến đi'],
      },
      {
        icon: '📑',
        title: 'Quản lý thu thập chứng từ bàn giao (POD)',
        desc: 'Nhắc nhở tài xế gửi ảnh chụp biên bản giao nhận hàng ngay khi giao xong, hỗ trợ kế toán đối soát nhanh.',
        bullets: ['Thu thập ảnh chụp POD qua chat', 'Kiểm tra tính hợp lệ của chữ ký nhận', 'Rút ngắn thời gian thu hồi công nợ'],
      },
    ],
    relatedModules: [
      {
        title: 'Phòng Vận hành (Operations)',
        desc: 'Điều phối lịch trình xe và quản lý hàng đợi chuyến hàng.',
        href: '/departments/operations',
      },
      {
        title: 'Chăm sóc Khách hàng (CSKH)',
        desc: 'Giải đáp và thông báo tình trạng chuyến hàng cho chủ hàng.',
        href: '/departments/customer-service',
      },
      {
        title: 'Tài chính & Kế toán (Finance)',
        desc: 'Đối soát cước phí, tạm ứng nhiên liệu và công nợ đối tác.',
        href: '/departments/finance',
      },
    ],
    faqs: [
      {
        q: 'Hệ thống có tích hợp được với thiết bị định vị GPS/TMS không?',
        a: 'Ở giai đoạn 1, hệ thống đóng vai trò tiếp nhận, bóc tách yêu cầu và điều phối chuyến. Ở các giai đoạn tiếp theo, hệ thống sẵn sàng kết nối API với các thiết bị GPS và phần mềm TMS của doanh nghiệp.',
      },
      {
        q: 'Nếu có thay đổi địa điểm giao hàng dọc đường thì xử lý thế nào?',
        a: 'Khi phát hiện yêu cầu đổi địa điểm, hệ thống bóc tách điểm mới và tính toán lại phụ phí phát sinh theo quy tắc, sau đó chuyển Điều vận xác nhận trước khi cập nhật cho tài xế.',
      },
    ],
  },
  {
    slug: 'financial-services',
    title: 'Tài chính, Bảo hiểm & Thẩm định',
    subtitle: 'Tiếp nhận hồ sơ yêu cầu bồi thường, kiểm tra tính hợp lệ của chứng từ và luân chuyển hồ sơ cho chuyên viên thẩm định',
    tagline: 'Rút ngắn thời gian xử lý hồ sơ từ vài ngày xuống vài giờ mà vẫn duy trì 100% quy tắc kiểm toán.',
    icon: '🛡️',
    color: '#10B981',
    description:
      'Giải quyết các điểm nghẽn trong quy trình xử lý hồ sơ tài chính và bảo hiểm: Khách hàng nộp hồ sơ thiếu giấy tờ, chuyên viên mất nhiều thời gian kiểm tra thủ công từng loại chứng từ và việc phê duyệt chi trả bị kéo dài.',
    departmentsInvolved: ['Tiếp nhận Hồ sơ Đa kênh', 'Hội đồng Thẩm định', 'Bộ phận Pháp chế & Tuân thủ', 'Kế toán Chi trả'],
    painPoints: [
      {
        num: '01',
        title: 'Hồ sơ khách hàng gửi thường bị thiếu hoặc mờ',
        desc: 'Khách hàng chụp ảnh giấy tờ (hóa đơn viện phí, giấy ra viện, CCCD) gửi qua chat thường bị mờ hoặc thiếu mục, khiến chuyên viên phải yêu cầu bổ sung nhiều lần.',
      },
      {
        num: '02',
        title: 'Quy trình kiểm tra tính hợp lệ tốn nhiều nhân lực',
        desc: 'Chuyên viên phải gõ lại số hợp đồng, kiểm tra thời hạn hiệu lực bảo hiểm và đối soát từng mục chi phí bằng tay.',
      },
      {
        num: '03',
        title: 'Thời gian phê duyệt bồi thường bị chậm trễ',
        desc: 'Hồ sơ chuyển qua nhiều cấp duyệt qua email hoặc giấy tờ nội bộ, khó theo dõi SLA xử lý của từng bộ phận.',
      },
    ],
    workflowSteps: [
      {
        step: 'BƯỚC 01',
        tag: 'TIẾP NHẬN HỒ SƠ',
        role: 'ai',
        title: 'Khách hàng gửi ảnh chứng từ yêu cầu quyền lợi',
        desc: 'Khách hàng gửi ảnh chụp giấy ra viện và hóa đơn viện phí qua cổng chat bảo hiểm.',
        example: '“Tôi gửi hồ sơ bồi thường viện phí đợt điều trị tại BV Bạch Mai, mã HĐ BH-9941”',
      },
      {
        step: 'BƯỚC 02',
        tag: 'TRÍCH XUẤT CHỨNG TỪ',
        role: 'ai',
        title: 'AI trích xuất số hợp đồng, cơ sở y tế & Tổng số tiền',
        desc: 'AI nhận diện mã hợp đồng BH-9941, nơi điều trị BV Bạch Mai, số ngày nằm viện 4 ngày và tổng tiền viện phí.',
        example: 'Mã HĐ: BH-9941 · Bệnh viện: Bạch Mai · Số ngày: 4 · Tổng chi phí yêu cầu: 8.500.000 đ',
      },
      {
        step: 'BƯỚC 03',
        tag: 'ĐỐI SOÁT QUY CHẾ',
        role: 'rules',
        title: 'Rules Engine kiểm tra hiệu lực hợp đồng & Hạn mức chi trả',
        desc: 'Thuật toán đối soát điều khoản hợp đồng: Tình trạng đóng phí đầy đủ, cơ sở y tế đúng tuyến, hạn mức quyền lợi nội trú.',
        example: 'Hợp đồng: Đang hiệu lực · Hạn mức nội trú: 2.000.000 đ/ngày · Số tiền duyệt sơ bộ: 8.000.000 đ',
      },
      {
        step: 'BƯỚC 04',
        tag: 'THẨM ĐỊNH & PHÊ DUYỆT',
        role: 'human',
        title: 'Chuyên viên thẩm định ký duyệt & Phát lệnh chi trả',
        desc: 'Hồ sơ đã gom đủ chứng từ xuất hiện trên bảng duyệt của Chuyên viên Thẩm định để ký duyệt 1-click.',
        example: 'Chuyên viên đã ký duyệt hồ sơ #CLM-4019 · Chuyển Kế toán thực hiện lệnh chuyển khoản',
      },
    ],
    capabilities: [
      {
        icon: '📑',
        title: 'Tiếp nhận & Kiểm tra tính đầy đủ hồ sơ',
        desc: 'Tự động kiểm tra danh mục giấy tờ cần nộp và nhắc nhở khách hàng bổ sung giấy tờ còn thiếu ngay lập tức.',
        bullets: ['Kiểm tra độ rõ nét của ảnh chụp chứng từ', 'Liệt kê các giấy tờ còn thiếu theo quy chế', 'Giảm 80% số lần liên hệ bổ sung hồ sơ'],
      },
      {
        icon: '⚖️',
        title: 'Đối soát hạn mức quyền lợi tất định',
        desc: 'Thực thi các quy tắc kiểm tra điều khoản bảo hiểm, loại trừ bệnh lý và tính toán hạn mức chi trả theo hợp đồng chuẩn.',
        bullets: ['Áp dụng đúng điều khoản theo gói hợp đồng', 'Tính toán số tiền đồng chi trả chính xác', 'Không để AI tự quyết định số tiền chi trả'],
      },
      {
        icon: '🔒',
        title: 'Lưu vết kiểm toán 100% cho từng hồ sơ',
        desc: 'Mọi bước thẩm định, phê duyệt và chi trả đều được ghi nhật ký kiểm toán phục vụ thanh tra và đối soát.',
        bullets: ['Lưu vết danh tính người phê duyệt', 'Theo dõi thời gian xử lý hồ sơ (SLA)', 'Bảo mật dữ liệu tài chính theo quy định'],
      },
    ],
    relatedModules: [
      {
        title: 'Ban Giám đốc (Executive)',
        desc: 'Phê duyệt các hồ sơ chi trả bồi thường giá trị lớn.',
        href: '/departments/executive',
      },
      {
        title: 'Tài chính & Kế toán (Finance)',
        desc: 'Đối chiếu chứng từ và thực thi lệnh chi trả.',
        href: '/departments/finance',
      },
      {
        title: 'Tri thức Doanh nghiệp (Knowledge)',
        desc: 'Quản trị cẩm nang quy chế sản phẩm và điều khoản hợp đồng.',
        href: '/products/knowledge',
      },
    ],
    faqs: [
      {
        q: 'Hệ thống có tự động duyệt chi tiền bồi thường không?',
        a: 'Tuyệt đối không. Hệ thống chỉ bóc tách dữ liệu và đối soát điều kiện sơ bộ. Quyết định phê duyệt chi trả cuối cùng luôn phải do Chuyên viên thẩm định có thẩm quyền ký duyệt.',
      },
      {
        q: 'Hệ thống có hỗ trợ kiểm tra phát hiện hóa đơn trùng lặp không?',
        a: 'Có. Rules Engine tự động đối soát số hóa đơn, ngày phát hành và mã số thuế cơ sở y tế với cơ sở dữ liệu đã lưu để cảnh báo nguy cơ nộp trùng hồ sơ.',
      },
    ],
  },
  {
    slug: 'construction-interior',
    title: 'Xây dựng, Nội thất & Vật liệu',
    subtitle: 'Bóc tách dự toán sơ bộ từ yêu cầu công trình, theo dõi phát sinh vật tư và luân chuyển nghiệm thu từng giai đoạn',
    tagline: 'Kiểm soát chặt chẽ ngân sách vật tư công trình và hạn chế tối đa tranh chấp phát sinh giữa Chủ đầu tư và Nhà thầu.',
    icon: '🏗️',
    color: '#D97706',
    description:
      'Giải quyết các nút thắt trong quản trị dự án thi công và nội thất: Báo giá bóc tách khối lượng (BOQ) tốn nhiều ngày; vật tư phát sinh tại công trường không được ghi nhận kịp thời; nghiệm thu từng đợt bị chậm trễ.',
    departmentsInvolved: ['Phòng Dự toán & Đấu thầu (QS)', 'Chỉ huy trưởng Công trường', 'Kho vật tư', 'Ban Giám đốc'],
    painPoints: [
      {
        num: '01',
        title: 'Bóc tách dự toán sơ bộ cho khách hàng mất nhiều thời gian',
        desc: 'Khách hàng gửi yêu cầu thi công kèm bảng khối lượng sơ bộ qua chat, kỹ sư QS phải mở nhiều file đơn giá định mức để tính toán, làm chậm tốc độ phản hồi báo giá.',
      },
      {
        num: '02',
        title: 'Vật tư phát sinh ngoài công trường không được kiểm soát',
        desc: 'Chỉ huy trưởng công trình gọi điện xin cấp thêm vật tư vượt định mức mà không có phiếu xác nhận phát sinh, dẫn đến thâm hụt ngân sách dự án.',
      },
      {
        num: '03',
        title: 'Nghiệm thu và bàn giao giai đoạn bị chậm tiến độ',
        desc: 'Biên bản nghiệm thu từng hạng mục (phần thô, điện nước, hoàn thiện) chuyển tay thủ công, gây chậm tiến độ giải ngân từ chủ đầu tư.',
      },
    ],
    workflowSteps: [
      {
        step: 'BƯỚC 01',
        tag: 'TIẾP NHẬN HẠNG MỤC',
        role: 'ai',
        title: 'Chủ nhà hoặc Nhà thầu phụ gửi bảng kê hạng mục',
        desc: 'Khách hàng gửi danh mục diện tích và vật liệu hoàn thiện căn hộ qua tin nhắn.',
        example: '“Căn hộ 85m2 chung cư Flora, cần thi công sàn gỗ công nghiệp 12mm và 3 bộ tủ bếp An Cường”',
      },
      {
        step: 'BƯỚC 02',
        tag: 'BÓC TÁCH KHỐI LƯỢNG',
        role: 'ai',
        title: 'AI trích xuất diện tích, chủng loại vật liệu & Hạng mục',
        desc: 'AI nhận diện Diện tích sàn 85m2, Chủng loại sàn gỗ 12mm chịu nước, Hạng mục tủ bếp gỗ MDF An Cường.',
        example: 'Hạng mục: Sàn gỗ 12mm (85m2) · Tủ bếp: MDF chống ẩm An Cường (3 bộ) · Địa điểm: Chung cư Flora',
      },
      {
        step: 'BƯỚC 03',
        tag: 'TÍNH DỰ TOÁN TẤT ĐỊNH',
        role: 'rules',
        title: 'Rules Engine tính đơn giá định mức vật liệu & Nhân công',
        desc: 'Hệ thống áp đúng bảng đơn giá thi công nội thất đã duyệt, tính toán chi phí vật tư và hao hụt 5%.',
        example: 'Đơn giá sàn gỗ: 380.000 đ/m2 · Dự toán sàn: 33.858.000 đ (kèm 5% hao hụt) · Dự toán tủ bếp: 45.000.000 đ',
      },
      {
        step: 'BƯỚC 04',
        tag: 'DUYỆT BÁO GIÁ',
        role: 'human',
        title: 'Kỹ sư QS duyệt bảng dự toán & Gửi hồ sơ cho khách hàng',
        desc: 'Bảng dự toán chi tiết xuất hiện trên Hàng việc của Kỹ sư QS để rà soát trước khi xuất bản gửi khách hàng.',
        example: 'Đã phát hành Bảng dự toán #BOQ-3312 · Gửi hồ sơ bản vẽ và dự toán cho Chủ nhà',
      },
    ],
    capabilities: [
      {
        icon: '📐',
        title: 'Bóc tách dự toán sơ bộ nhanh chóng',
        desc: 'Tự động trích xuất các hạng mục thi công và áp dụng đơn giá định mức chuẩn từ cơ sở dữ liệu doanh nghiệp.',
        bullets: ['Áp dụng đơn giá vật tư và nhân công niêm yết', 'Tự động tính toán tỷ lệ hao hụt định mức', 'Tăng tốc độ phản hồi báo giá cho khách hàng'],
      },
      {
        icon: '🚧',
        title: 'Kiểm soát đề xuất cấp vật tư công trường',
        desc: 'Theo dõi các yêu cầu xuất vật tư từ công trình, đối soát với hạn mức ngân sách đã phê duyệt ban đầu.',
        bullets: ['Cảnh báo khi yêu cầu vượt định mức dự toán', 'Gom hồ sơ phát sinh chuyển Chỉ huy trưởng ký', 'Hạn chế thất thoát vật tư tại công trường'],
      },
      {
        icon: '📋',
        title: 'Quản lý nghiệm thu theo từng giai đoạn',
        desc: 'Luân chuyển biên bản nghiệm thu hạng mục và hình ảnh hiện trường phục vụ thanh toán tiến độ.',
        bullets: ['Thu thập ảnh chụp hiện trạng hoàn thiện', 'Theo dõi tiến độ theo từng mốc công trình', 'Lưu nhật ký công trình minh bạch'],
      },
    ],
    relatedModules: [
      {
        title: 'Phòng Vận hành (Operations)',
        desc: 'Điều phối lịch thi công và quản lý tiến độ công trình.',
        href: '/departments/operations',
      },
      {
        title: 'Phòng Bán hàng (Sales)',
        desc: 'Tiếp nhận lead công trình và gửi hồ sơ báo giá.',
        href: '/departments/sales',
      },
      {
        title: 'Tài chính & Kế toán (Finance)',
        desc: 'Theo dõi tạm ứng vật tư và thanh toán tiến độ.',
        href: '/departments/finance',
      },
    ],
    faqs: [
      {
        q: 'Hệ thống có tự động thay thế kỹ sư bóc tách dự toán (QS) không?',
        a: 'Không. Hệ thống hỗ trợ bóc tách dự toán sơ bộ nhanh trong vòng vài phút. Kỹ sư QS vẫn là người kiểm tra lại bản vẽ chi tiết và ký duyệt trước khi gửi khách hàng.',
      },
      {
        q: 'Làm thế nào để quản lý các chi phí phát sinh ngoài hợp đồng?',
        a: 'Mọi đề xuất vật tư hoặc hạng mục phát sinh ngoài hợp đồng đều được hệ thống gắn nhãn "Ngoại lệ phát sinh" và bắt buộc phải có sự phê duyệt của Chủ đầu tư và Ban Giám đốc.',
      },
    ],
  },
  {
    slug: 'fnb-chains',
    title: 'Chuỗi Nhà hàng, F&B & Nhượng quyền',
    subtitle: 'Tiếp nhận đặt bàn cao điểm đa kênh, kiểm soát tiêu chuẩn phục vụ và điều phối nguyên liệu từ Bếp trung tâm cho chuỗi cơ sở',
    tagline: 'Phục vụ khách hàng nhanh chóng trong giờ cao điểm và chuẩn hóa chuỗi cung ứng giữa các chi nhánh.',
    icon: '🍽️',
    color: '#EF4444',
    description:
      'Giải quyết các bài toán vận hành của chuỗi nhà hàng và F&B: Khách hàng nhắn tin đặt bàn dồn dập vào giờ cao điểm; việc điều phối nguyên liệu từ Bếp trung tâm (Central Kitchen) tới các chi nhánh bị thiếu hụt; chất lượng phục vụ không đồng đều.',
    departmentsInvolved: ['Lễ tân Đặt bàn & CSKH', 'Bếp trung tâm (Central Kitchen)', 'Quản lý Chi nhánh', 'Kế toán Kho F&B'],
    painPoints: [
      {
        num: '01',
        title: 'Khách đặt bàn dồn dập vào khung giờ trưa và tối',
        desc: 'Khách nhắn tin qua Fanpage, Zalo đặt bàn tiệc đông người nhưng nhân viên đang bận phục vụ tại quán không kịp trả lời, dẫn đến mất bàn.',
      },
      {
        num: '02',
        title: 'Yêu cầu nguyên vật liệu từ chi nhánh gửi về Bếp trung tâm bị trễ',
        desc: 'Các cơ sở nhắn tin đặt số lượng thịt, sốt, rau củ qua nhóm chat riêng, gây khó khăn cho Bếp trung tâm trong việc tổng hợp kế hoạch sản xuất ca sáng.',
      },
      {
        num: '03',
        title: 'Khiếu nại về chất lượng món ăn và dịch vụ bị xử lý chậm',
        desc: 'Khách phản hồi về món ăn bị nguội hoặc phục vụ chậm, thông tin bị trôi trong tin nhắn và không có báo cáo cho Giám đốc chuỗi.',
      },
    ],
    workflowSteps: [
      {
        step: 'BƯỚC 01',
        tag: 'TIẾP NHẬN ĐẶT BÀN',
        role: 'ai',
        title: 'Khách nhắn tin đặt bàn kèm yêu cầu đặc biệt',
        desc: 'Khách hàng gửi tin nhắn đặt bàn tiệc sinh nhật cho 12 người qua Fanpage nhà hàng.',
        example: '“Cho mình đặt bàn 12 người tối thứ 7 lúc 19h30 ở cơ sở Phan Xích Long, có set up bàn trang trí sinh nhật”',
      },
      {
        step: 'BƯỚC 02',
        tag: 'ĐỌC HIỂU & GHI NHẬN',
        role: 'ai',
        title: 'AI bóc tách số lượng khách, chi nhánh & Thời gian',
        desc: 'AI trích xuất Số lượng 12 khách, Thời gian 19:30 Thứ Bảy, Chi nhánh Phan Xích Long, Yêu cầu trang trí sinh nhật.',
        example: 'Cơ sở: Phan Xích Long · Số khách: 12 · Giờ: 19:30 Thứ Bảy · Ghi chú: Trang trí bàn tiệc sinh nhật',
      },
      {
        step: 'BƯỚC 03',
        tag: 'ĐỐI SOÁT CHÍNH SÁCH',
        role: 'rules',
        title: 'Rules Engine kiểm tra chính sách đặt cọc & Khung giờ',
        desc: 'Thuật toán kiểm tra quy định: Bàn trên 10 khách vào tối cuối tuần áp dụng cọc 500.000 đ và gửi menu đặt món trước.',
        example: 'Chính sách: Yêu cầu cọc 500.000 đ đối với bàn ≥ 10 khách cuối tuần · Gửi số tài khoản chính thức',
      },
      {
        step: 'BƯỚC 04',
        tag: 'XÁC NHẬN VÀO SƠ ĐỒ BÀN',
        role: 'human',
        title: 'Quản lý cơ sở xác nhận bàn & Chuyển chuẩn bị tiệc',
        desc: 'Phiếu đặt bàn xuất hiện trên bảng việc của Quản lý chi nhánh Phan Xích Long để sắp xếp sơ đồ bàn và trang trí.',
        example: 'Đã xếp Bàn VIP-02 · Ghi nhận cọc 500.000 đ · Chuyển bộ phận chuẩn bị hoa trang trí',
      },
    ],
    capabilities: [
      {
        icon: '🛎️',
        title: 'Tự động hóa tiếp nhận đặt bàn đa kênh',
        desc: 'Phản hồi ngay lập tức 24/7 yêu cầu đặt bàn, kiểm tra chính sách đặt cọc và hướng dẫn chọn menu trước.',
        bullets: ['Bóc tách số lượng khách và thời gian chính xác', 'Áp dụng chính sách đặt cọc cho bàn đoàn đông', 'Giảm 90% tình trạng bỏ sót tin nhắn khách đặt bàn'],
      },
      {
        icon: '🍲',
        title: 'Tổng hợp đơn vật tư gửi Bếp trung tâm',
        desc: 'Tự động thu thập và chuẩn hóa bảng kê nguyên liệu từ tất cả các chi nhánh gửi về Bếp trung tâm trước giờ chốt sổ.',
        bullets: ['Gom đơn vật tư theo khung giờ quy định', 'Cảnh báo khi chi nhánh đặt vượt định mức tiêu thụ', 'Hỗ trợ Bếp trung tâm lên kế hoạch chuẩn bị'],
      },
      {
        icon: '⚠️',
        title: 'Tiếp nhận & Xử lý khiếu nại khách hàng tức thì',
        desc: 'Phân loại các phản hồi tiêu cực của khách hàng và chuyển giao ngay cho Quản lý ca để xử lý đền bù thỏa đáng.',
        bullets: ['Nhận diện mức độ nghiêm trọng của khiếu nại', 'Chuyển thông báo khẩn cấp tới Quản lý nhà hàng', 'Lưu vết lịch sử giải quyết sự cố'],
      },
    ],
    relatedModules: [
      {
        title: 'Chăm sóc Khách hàng (CSKH)',
        desc: 'Giải đáp thắc mắc và tiếp nhận đặt bàn 24/7.',
        href: '/departments/customer-service',
      },
      {
        title: 'Phòng Vận hành (Operations)',
        desc: 'Điều phối luồng cung ứng nguyên vật liệu cho chuỗi cơ sở.',
        href: '/departments/operations',
      },
      {
        title: 'Tri thức Doanh nghiệp (Knowledge)',
        desc: 'Quản trị menu, bảng giá món và cẩm nang phục vụ chuẩn.',
        href: '/products/knowledge',
      },
    ],
    faqs: [
      {
        q: 'Hệ thống có tự động xếp bàn vào phần mềm POS của nhà hàng không?',
        a: 'Trong giai đoạn 1, hệ thống tiếp nhận, bóc tách và gửi phiếu đặt bàn cho Quản lý chi nhánh xác nhận. Khi tích hợp POS ở giai đoạn sau, hệ thống cung cấp sẵn cổng API để đồng bộ sơ đồ bàn.',
      },
      {
        q: 'Nếu khách hàng yêu cầu món ngoài menu niêm yết thì xử lý thế nào?',
        a: 'AI sẽ ghi nhận yêu cầu và đối chiếu với cẩm nang phục vụ. Nếu là món đặc biệt, hệ thống chuyển phiếu yêu cầu cho Bếp trưởng chi nhánh xem xét khả năng đáp ứng.',
      },
    ],
  },
  {
    slug: 'professional-services',
    title: 'Luật, Thuế & Dịch vụ Doanh nghiệp',
    subtitle: 'Tư vấn biểu phí và thủ tục hành chính niêm yết, thu thập hồ sơ pháp lý ban đầu và luân chuyển cho luật sư/kế toán viên phụ trách',
    tagline: 'Giảm 70% thời gian giải đáp các câu hỏi thủ tục sơ bộ để chuyên viên tập trung vào công việc chuyên môn giá trị cao.',
    icon: '⚖️',
    color: '#6366F1',
    description:
      'Giải quyết các bài toán vận hành của các công ty luật, đại lý thuế và dịch vụ tư vấn doanh nghiệp: Khách hàng hỏi liên tục về thủ tục thành lập doanh nghiệp, giấy phép con, biểu phí dịch vụ khiến luật sư/chuyên viên mất nhiều thời gian trả lời lặp lại.',
    departmentsInvolved: ['Tiếp nhận Yêu cầu Khách hàng', 'Luật sư & Chuyên viên Thuế', 'Bộ phận Kế toán Dịch vụ', 'Ban Điều hành'],
    painPoints: [
      {
        num: '01',
        title: 'Chuyên viên mất nhiều thời gian giải đáp các câu hỏi thủ tục cơ bản',
        desc: 'Khách hàng thường xuyên nhắn tin hỏi các câu hỏi cơ bản (hồ sơ cần chuẩn bị gì, thời gian xử lý bao lâu, biểu phí trọn gói ra sao), làm gián đoạn thời gian nghiên cứu hồ sơ chuyên sâu của luật sư.',
      },
      {
        num: '02',
        title: 'Thu thập thông tin ban đầu từ khách hàng bị rời rạc',
        desc: 'Khách gửi ảnh CMND/CCCD, thông tin ngành nghề kinh doanh, địa chỉ qua nhiều tin nhắn rải rác, gây khó khăn cho việc lập hồ sơ pháp lý.',
      },
      {
        num: '03',
        title: 'Khó kiểm soát tiến độ xử lý và thời hạn nộp hồ sơ nhà nước',
        desc: 'Không có hệ thống nhắc việc tự động cho các mốc nộp báo cáo thuế, gia hạn giấy phép con, dễ dẫn đến nguy cơ bị phạt chậm nộp.',
      },
    ],
    workflowSteps: [
      {
        step: 'BƯỚC 01',
        tag: 'TIẾP NHẬN YÊU CẦU',
        role: 'ai',
        title: 'Khách hàng hỏi dịch vụ pháp lý hoặc tư vấn thuế',
        desc: 'Khách hàng nhắn tin hỏi về thủ tục thành lập công ty TNHH 2 thành viên và mở văn phòng đại diện.',
        example: '“Tôi muốn thành lập công ty TNHH 2 thành viên ngành thương mại điện tử tại Hà Nội, trọn gói bao nhiêu tiền và cần giấy tờ gì?”',
      },
      {
        step: 'BƯỚC 02',
        tag: 'TRA CỨU CẨM NANG',
        role: 'ai',
        title: 'AI cung cấp thông tin thủ tục & Danh mục giấy tờ chuẩn',
        desc: 'AI trích xuất yêu cầu và tra cứu cẩm nang dịch vụ doanh nghiệp đã duyệt, cung cấp biểu phí trọn gói niêm yết và hướng dẫn chuẩn bị CCCD.',
        example: 'Gói thành lập: TNHH 2TV · Phí niêm yết: 2.500.000 đ trọn gói · Giấy tờ cần: Bản chụp CCCD 2 thành viên',
      },
      {
        step: 'BƯỚC 03',
        tag: 'THU THẬP & KIỂM TRA',
        role: 'rules',
        title: 'Rules Engine kiểm tra tính đầy đủ thông tin pháp lý',
        desc: 'Hệ thống kiểm tra tính hợp lệ của mã ngành nghề kinh doanh mong muốn và thông tin đăng ký trụ sở doanh nghiệp.',
        example: 'Mã ngành TMĐT: 4791 (Khả dụng) · CCCD: Đủ 2 thành viên góp vốn · Trụ sở: Hợp lệ',
      },
      {
        step: 'BƯỚC 04',
        tag: 'PHÂN LUỒNG CHUYÊN VIÊN',
        role: 'human',
        title: 'Hệ thống tạo hồ sơ & Phân công Luật sư/Chuyên viên phụ trách',
        desc: 'Hồ sơ đã gom đủ thông tin được chuyển vào Hàng việc của Luật sư chuyên trách để soạn thảo bộ điều lệ và nộp sở Kế hoạch - Đầu tư.',
        example: 'Đã tạo hồ sơ #DN-1092 · Phân công: Luật sư Trần Thị C · Hạn hoàn thiện hồ sơ: 24h',
      },
    ],
    capabilities: [
      {
        icon: '📚',
        title: 'Cẩm nang tra cứu thủ tục & Biểu phí niêm yết',
        desc: 'Cung cấp thông tin quy trình hành chính và bảng giá dịch vụ chuẩn mực 24/7 theo tài liệu chuyên môn đã duyệt.',
        bullets: ['Biểu giá dịch vụ trọn gói công khai', 'Hướng dẫn chi tiết giấy tờ cần chuẩn bị', 'Tuyệt đối không tư vấn sai quy định pháp luật'],
      },
      {
        icon: '🗂️',
        title: 'Chuẩn hóa thu thập hồ sơ khách hàng ban đầu',
        desc: 'Thu thập có cấu trúc các thông tin căn cước, vốn điều lệ, địa chỉ trụ sở và ngành nghề kinh doanh.',
        bullets: ['Bóc tách thông tin từ ảnh chụp CCCD', 'Kiểm tra mã ngành nghề kinh doanh theo danh mục chuẩn', 'Tạo bộ hồ sơ đầu vào hoàn chỉnh cho chuyên viên'],
      },
      {
        icon: '⏰',
        title: 'Quản lý thời hạn & Cảnh báo hạn nộp hồ sơ',
        desc: 'Tự động nhắc nhở chuyên viên và khách hàng về các mốc nộp hồ sơ, gia hạn giấy phép và kỳ báo cáo thuế.',
        bullets: ['Cảnh báo trước 3 ngày đến hạn nộp', 'Theo dõi tiến độ theo từng giai đoạn xử lý', 'Lưu nhật ký tương tác và trao đổi với khách hàng'],
      },
    ],
    relatedModules: [
      {
        title: 'Phòng Bán hàng (Sales)',
        desc: 'Tiếp nhận lead khách hàng và gửi hợp đồng dịch vụ tư vấn.',
        href: '/departments/sales',
      },
      {
        title: 'Tri thức Doanh nghiệp (Knowledge)',
        desc: 'Quản trị cẩm nang văn bản pháp luật và biểu phí dịch vụ.',
        href: '/products/knowledge',
      },
      {
        title: 'Phòng Vận hành (Operations)',
        desc: 'Luân chuyển hồ sơ và giám sát tiến độ công việc chuyên viên.',
        href: '/departments/operations',
      },
    ],
    faqs: [
      {
        q: 'Hệ thống có tự động thay thế luật sư soạn thảo văn bản pháp lý không?',
        a: 'Không. Hệ thống đóng vai trò thu thập thông tin và chuẩn bị hồ sơ đầu vào. Việc rà soát pháp lý, soạn thảo điều lệ và ký tên đại diện luôn do Luật sư có chứng chỉ hành nghề phụ trách.',
      },
      {
        q: 'Thông tin bảo mật của khách hàng doanh nghiệp được lưu trữ thế nào?',
        a: 'Tất cả tài liệu và thông tin pháp lý của khách hàng đều được mã hóa và lưu trữ an toàn, tuân thủ Luật Bảo vệ Dữ liệu Cá nhân 91/2025/QH15.',
      },
    ],
  },
];
