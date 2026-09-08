-- TX-09 DIA DIEM VAN HANH — mot phap nhan, nhieu cho lam viec (Lane H, Issue #267 H1)
--
-- Gia tri enum `COUNTERPARTY_SITE` da duoc them o migration ngay truoc
-- (`20260909230000_transport_geofence_counterparty_site_kind`) va KHONG the nam o day: Postgres
-- cam dung mot gia tri enum vua them trong cung mot giao dich.
--
-- KHONG co lenh doi mot bang nao dang chay. Migration nay CONG THEM: moi truy van, moi rang buoc
-- va moi hang du lieu co truoc no deu doc/ghi y nguyen sau no.

-- ---------------------------------------------------------------------------------------------
-- BANG DIA DIEM
CREATE TABLE "TransportCounterpartySite" (
    "id" TEXT NOT NULL,
    "counterpartyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "status" "TransportPartyStatus" NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportCounterpartySite_pkey" PRIMARY KEY ("id")
);

-- Hai kho cua CUNG mot cong ty khong duoc trung ten: man hinh lai xe chi hien ten cho, nen hai
-- dong chu giong het nhau la hai lua chon ma khong ai phan biet duoc.
CREATE UNIQUE INDEX "TransportCounterpartySite_counterparty_name_key"
  ON "TransportCounterpartySite"("counterpartyId", "name");

CREATE INDEX "TransportCounterpartySite_counterpartyId_status_idx"
  ON "TransportCounterpartySite"("counterpartyId", "status");

CREATE INDEX "TransportCounterpartySite_status_idx"
  ON "TransportCounterpartySite"("status");

-- `RESTRICT` chu khong `CASCADE`: mot phap nhan con dia diem thi khong xoa cung duoc. Duong nghi
-- viec la `status = INACTIVE` — `GD-02`, huy thay xoa.
ALTER TABLE "TransportCounterpartySite"
  ADD CONSTRAINT "TransportCounterpartySite_counterpartyId_fkey"
  FOREIGN KEY ("counterpartyId") REFERENCES "TransportCounterparty"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------
-- HAI RANG BUOC HINH DANG
--
-- Mot dia diem ten rong hien ra tren man hinh lai xe la mot the trang, va lai xe se cham vao no.
ALTER TABLE "TransportCounterpartySite"
  ADD CONSTRAINT "TransportCounterpartySite_name_not_blank"
  CHECK (btrim("name") <> '');

-- Dia chi NULL nghia la CHUA NHAP — hop le. Mot chuoi toan khoang trang thi khong: no trong nhu
-- da nhap trong moi phep kiem `IS NOT NULL`, va se lam mot bao cao "da co dia chi" noi sai.
ALTER TABLE "TransportCounterpartySite"
  ADD CONSTRAINT "TransportCounterpartySite_address_not_blank"
  CHECK ("address" IS NULL OR btrim("address") <> '');
