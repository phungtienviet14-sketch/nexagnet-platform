/** Legacy console entry now routes into the durable, approval-gated campaign workspace. */
export function BroadcastPanel() {
  return (
    <div className="bc-wrap">
      <div className="composer">
        <p>Chiến dịch hiện dùng queue bền vững, bắt buộc duyệt nội dung và lên lịch trước khi gửi.</p>
        <a className="btn btn-primary btn-block" href="/settings?tab=campaigns">
          Mở Chiến dịch CSKH trong Cấu hình
        </a>
      </div>
    </div>
  );
}
