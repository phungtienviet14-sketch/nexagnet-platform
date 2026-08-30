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
--
-- PHAM VI CUA HAI INDEX NAY, noi cho het (T2.1R/R1): chung cuong che DUNG MOT DIEU — "toi da MOT
-- ban dang hieu luc". Chung KHONG noi gi ve lich su, nen NHIEU ban DA DONG (`effectiveTo IS NOT
-- NULL`) cua cung mot chuyen/mot xe van ghi duoc. Do la dieu `GD-06` doi hoi: doi lai xe phai de
-- lai vet, khong ghi de.
--
-- "Nhieu ban da dong duoc phep" KHONG dong nghia "khoang thoi gian lich su duoc phep chong lap".
-- Bat bien T1 §5 `TX-01` — *khong chong lap thoi gian cho cung mot xe* — GIU NGUYEN, khong bi
-- T2.1 noi ra. Duong ghi duoc ho tro giu no bang cach dong ban cu DUNG TAI moc mo ban moi
-- (`previous.effectiveTo = current.effectiveFrom`), nen ghi binh thuong khong tao ra chong lap;
-- co bai test doc lai hang da luu de khoa dieu do.
--
-- Chan chong lap lich su TUY Y (vi du mot `UPDATE` tay lui `effectiveTo` ve qua khu) can mot
-- EXCLUSION CONSTRAINT tren `tstzrange` kem `btree_gist`. Ghi lai day nhu mot lua chon SIET THEM
-- ve sau, khong lam o T2.1: no doi mot extension va mot quyet dinh ve nua mo/nua dong cua khoang,
-- va bat bien hien tai chua bi duong ghi nao pha.

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
-- duoi va dung cho do: regex chan sai DANG, va vong `to_date`/`to_char` chan ngay KHONG CO THAT.
--
-- HANH VI DO DUOC, khong phai hanh vi suy ra (PostgreSQL 16.15, 30/08/2026). Mot ngay khong hop le
-- bi DB tu choi, nhung CO BA CO CHE khac nhau tuy dau vao — dung mot cau "CHECK tra FALSE" cho ca
-- ba la mo ta sai:
--
--   · `'2026-08-01T00:00:00Z'`  -> `value too long for type character varying(10)`
--                                (kieu cot chan truoc, chua toi luot `CHECK`)
--   · `'hom qua'`, `'2026-8-1'`, `'01/08/2026'`, `''`
--                             -> `violates check constraint` (regex khong khop)
--   · `'2026-02-30'`, `'2026-13-01'`, `'2025-02-29'`
--                             -> `ERROR: date/time field value out of range` NEM TU `to_date`
--
-- Cai thu ba dang chu y: tu PostgreSQL 10, `to_date` KHONG con cuon ngay tran sang thang sau. Do
-- truc tiep: `SELECT to_date('2026-02-30','YYYY-MM-DD')` tra `ERROR: date/time field value out of
-- range: "2026-02-30"`, KHONG tra `2026-03-02`. Ket qua nghiep vu khong doi (lenh ghi bi huy, hang
-- xau khong vao duoc), nhung co che thi khac, va bao cao cu noi sai cho do.
--
-- Thu tu danh gia hai ve cua `AND` khong duoc SQL bao dam, nen mot dau vao sai dang VE LY THUYET co
-- the ra loi cua `to_date` thay vi vi pham `CHECK`. Ca hai deu la tu choi; khong duong nao cho hang
-- xau di qua. Do la tat ca nhung gi rang buoc nay hua.

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
