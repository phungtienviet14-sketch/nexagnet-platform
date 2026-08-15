# Hướng dẫn Triển khai Website Marketing `nexagnet247.com`

Tài liệu này hướng dẫn quy trình đưa website marketing `apps/marketing` lên hạ tầng **Google Cloud Run** và trỏ tên miền chính thức **`nexagnet247.com`** khi đã mua tên miền.

---

## 1. Kiến trúc Triển khai (Production Architecture)

```
                       ┌───────────────────────────────┐
                       │   Tên miền: nexagnet247.com   │
                       └───────────────┬───────────────┘
                                       │
                         [DNS: A / AAAA / CNAME]
                                       │
                                       ▼
                       ┌───────────────────────────────┐
                       │      Google Cloud Run         │
                       │   (Service: nexagnet-mkt)     │
                       │   - Container: Next.js 15     │
                       │   - Standalone Node runtime   │
                       │   - Auto-SSL (Google Managed) │
                       └───────────────────────────────┘
```

* **Ứng dụng**: Next.js 15 (`apps/marketing`), xuất bản dạng Standalone Node.js container siêu nhẹ (~80MB).
* **Hiệu năng**: 100% trang được static pre-render (`○ (Static)`), First Load JS chỉ ~119 kB, phản hồi dưới 50ms trên edge.
* **Bảo mật**: Chạy non-root user (`nextjs:nodejs`), `poweredByHeader: false`, nén gzip/brotli tự động.

---

## 2. Các bước Chuẩn bị trước khi Deploy

### Bước 1: Mua và sở hữu Tên miền
1. Đăng ký tên miền `nexagnet247.com` tại nhà cung cấp (Namecheap, Cloudflare, Mat Bao, PA Vietnam...).
2. Đảm bảo có quyền quản trị bản ghi DNS của tên miền.

### Bước 2: Chuẩn bị Dự án GCP
Đảm bảo tài khoản đã xác thực `gcloud` và chọn đúng Project ID của dự án:
```bash
gcloud auth login
gcloud config set project <YOUR_GCP_PROJECT_ID>
```

---

## 3. Lệnh Build & Deploy lên Google Cloud Run

### 3.1. Build & Push Container Image lên Google Artifact Registry

```bash
# Đặt biến môi trường
PROJECT_ID=$(gcloud config get-value project)
REGION="asia-southeast1" # Hoặc us-central1
REPO="nexagnet-docker"
IMAGE="asia-southeast1-docker.pkg.dev/${PROJECT_ID}/${REPO}/marketing:latest"

# Tạo Artifact Registry (nếu chưa có)
gcloud artifacts repositories create ${REPO} \
  --repository-format=docker \
  --location=${REGION} \
  --description="Docker repository for nexagnet services" 2>/dev/null || true

# Build và submit image qua Cloud Build
gcloud builds submit \
  --tag ${IMAGE} \
  --project ${PROJECT_ID} \
  -f apps/marketing/Dockerfile .
```

### 3.2. Deploy Service lên Google Cloud Run

```bash
gcloud run deploy nexagnet-marketing \
  --image ${IMAGE} \
  --platform managed \
  --region ${REGION} \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --set-env-vars="NODE_ENV=production"
```

---

## 4. Cấu hình Tên miền Tùy chỉnh (Custom Domain Mapping)

### 4.1. Khởi tạo Domain Mapping trên Cloud Run
```bash
# Ánh xạ tên miền gốc (Apex domain)
gcloud beta run domain-mappings create \
  --service nexagnet-marketing \
  --domain nexagnet247.com \
  --region ${REGION}

# Ánh xạ tên miền phụ www
gcloud beta run domain-mappings create \
  --service nexagnet-marketing \
  --domain www.nexagnet247.com \
  --region ${REGION}
```

### 4.2. Cấu hình Bản ghi DNS tại Nhà cung cấp Tên miền

Sau khi chạy lệnh trên, Google Cloud sẽ cấp danh sách bản ghi DNS. Cập nhật vào trang quản lý DNS của `nexagnet247.com`:

| Loại bản ghi (Type) | Tên / Host (Name) | Giá trị đích (Value / Points to) | Ghi chú |
|---|---|---|---|
| **A** | `@` (hoặc để trống) | `216.239.32.21`<br>`216.239.34.21`<br>`216.239.36.21`<br>`216.239.38.21` | Google Anycast IPv4 |
| **AAAA** | `@` (hoặc để trống) | `2001:4860:4802:32::15`<br>`2001:4860:4802:34::15`<br>`2001:4860:4802:36::15`<br>`2001:4860:4802:38::15` | Google Anycast IPv6 |
| **CNAME** | `www` | `ghs.googlehosted.com.` | Tự động chuyển hướng www |

> **Lưu ý chứng chỉ SSL**: Google Cloud Run tự động cấp phát và gia hạn chứng chỉ HTTPS/SSL miễn phí (Google-managed Certificate). Quá trình kích hoạt mất khoảng 15–60 phút sau khi bản ghi DNS nhận diện thành công.

---

## 5. Tùy chọn Triển khai qua Caddy Reverse Proxy (Nếu dùng Máy chủ Riêng / VPS)

Nếu bạn muốn deploy marketing site chung máy chủ với backend/operator console qua Docker Compose và Caddy:

**File `Caddyfile`:**
```caddyfile
nexagnet247.com, www.nexagnet247.com {
    reverse_proxy marketing:8080 {
        header_up Host {host}
        header_up X-Real-IP {remote_host}
    }
    encode gzip zstd
}
```

---

## 6. Kiểm tra Sau Triển khai (Post-deployment Checklist)

* [ ] Truy cập `https://nexagnet247.com` hiển thị trang chủ hoàn chỉnh.
* [ ] Kiểm tra responsive trên Desktop (1440px) và Mobile (390px).
* [ ] Truy cập `https://nexagnet247.com/sitemap.xml` và `https://nexagnet247.com/robots.txt`.
* [ ] Test gửi form đăng ký tư vấn tại section `#demo`.
* [ ] Kiểm tra điểm PageSpeed Insights (Mục tiêu: Performance 95+, SEO 100).
