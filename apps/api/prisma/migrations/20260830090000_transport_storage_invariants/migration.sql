-- T2.1 — SIET BAT BIEN TANG LUU TRU CUA MIEN VAN TAI (Issue #79).
--
-- Ba viec, khong viec nao doc du lieu, khong viec nao xoa gi:
--   F1  cot tien `INTEGER` -> `BIGINT` + `CHECK` khoang, de khong con gia tri "mien cho, DB chet"
--   F2  unique MOT PHAN cho ban phan cong dang hieu luc, de hai nguoi ghi cung luc khong the de
--       lai hai ban cung hieu luc
--   F3  `CHECK` dang `YYYY-MM-DD` cho hai cot ngay-chi-co-ngay
--
-- AN TOAN TIEN LEN tu `main`: `ALTER TYPE integer -> bigint` la mo rong, moi gia tri `INTEGER` dang
-- co deu nam gon trong `BIGINT`. Ba `CHECK` va hai unique deu duoc kiem tren du lieu dang co luc
-- them; neu du lieu hien tai vi pham thi lenh DUNG LAI o day thay vi im lang bo qua — do la hanh vi
-- mong muon. Khong `prisma migrate reset`, khong DROP bang/cot nao.
--
-- DUONG LUI: cac lenh dao nguoc nam trong `README-rollback.sql` cung thu muc.

-- ---------------------------------------------------------------------------
-- F1 — khoang tien
-- ---------------------------------------------------------------------------

ALTER TABLE "TransportTrip"
  ALTER COLUMN "freightAmount" TYPE BIGINT;

-- Bien la +-(2^53-1), KHONG phai bien cua BIGINT: tien di ra ngoai bang JSON va `number` cua
-- JavaScript chi dem chinh xac toi do. Cho DB rong hon mien thi cai lech vua vá quay lai theo chieu
-- nguoc — mot hang doc len khong bieu dien duoc, hong luc DOC, cho khong ai dang nhin.
ALTER TABLE "TransportTrip"
  ADD CONSTRAINT "TransportTrip_freightAmount_money_range"
  CHECK (
    "freightAmount" IS NULL
    OR ("freightAmount" BETWEEN -9007199254740991 AND 9007199254740991)
  );

-- ---------------------------------------------------------------------------
-- F2 — MOT ban phan cong dang hieu luc, cuong che boi DB
-- ---------------------------------------------------------------------------
--
-- Vi sao phai la DB chu khong phai service: mau "tim ban dang hieu luc roi dong no lai roi mo ban
-- moi" dung voi MOT nguoi ghi. Voi hai giao dich cung luc tren mot chuyen CHUA co ban nao, ca hai
-- deu `UPDATE` trung 0 dong roi ca hai deu `INSERT` — va khong tang nao trong ung dung nhin thay
-- duoc dieu do. Ket qua la mot chuyen co hai lai xe "dang hieu luc", khong loi, khong log.
--
-- Postgres coi moi `NULL` la khac nhau nen `UNIQUE(tripId, effectiveTo)` KHONG chan duoc; menh de
-- `WHERE ... IS NULL` moi la thu bien "dang hieu luc" thanh mot khoa that su duy nhat.

CREATE UNIQUE INDEX "TransportTripAssignment_activeTrip_key"
  ON "TransportTripAssignment" ("tripId")
  WHERE "effectiveTo" IS NULL;

CREATE UNIQUE INDEX "TransportVehicleAssignment_activeVehicle_key"
  ON "TransportVehicleAssignment" ("vehicleId")
  WHERE "effectiveTo" IS NULL;

-- ---------------------------------------------------------------------------
-- F3 — ngay-chi-co-ngay van la chuoi, nhung khong con la chuoi TU DO
-- ---------------------------------------------------------------------------
--
-- Quyet dinh: GIU `VARCHAR(10)` dang `YYYY-MM-DD` (`GD-04`/`INV-25`) — doi sang `DATE` se dua mot
-- doi tuong `Date` (mot KHOANH KHAC) tro lai tang ung dung, va "dinh dang lai mot khoanh khac
-- thanh ngay" chinh la phep tinh ma `INV-25` sinh ra de xoa bo.
--
-- Cai con thieu la o DB: hom nay mot `UPDATE` tay ghi duoc `'hom qua'` vao cot ky. Hai `CHECK`
-- duoi vá dung cho do:
--   · regex chan sai DANG (`2026-8-1`, `2026-08-01T00:00:00Z`, chuoi rong)
--   · vong `to_date`/`to_char` chan ngay KHONG CO THAT: `to_date` cuon `2026-02-30` thanh
--     `2026-03-02`, nen chuoi quay ve khong con bang chuoi ban dau va `CHECK` tra FALSE — mot lan
--     tu choi sach, khong nem loi.

ALTER TABLE "TransportTrip"
  ADD CONSTRAINT "TransportTrip_businessDate_iso"
  CHECK (
    "businessDate" ~ '^\d{4}-\d{2}-\d{2}$'
    AND to_char(to_date("businessDate", 'YYYY-MM-DD'), 'YYYY-MM-DD') = "businessDate"
  );

ALTER TABLE "TransportDriver"
  ADD CONSTRAINT "TransportDriver_licenceExpiry_iso"
  CHECK (
    "licenceExpiry" ~ '^\d{4}-\d{2}-\d{2}$'
    AND to_char(to_date("licenceExpiry", 'YYYY-MM-DD'), 'YYYY-MM-DD') = "licenceExpiry"
  );
