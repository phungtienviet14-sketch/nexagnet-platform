-- T3 — COSTING + DRIVER FUND (`TX-03`), Issue #85.
--
-- MOT chieu: THEM. Khong `ALTER` cot nao dang co, khong `DROP` gi, khong doc mot hang nao. Moi bang
-- va moi kieu duoi day deu moi tinh, nen migration nay ap len mot DB dang chay ma khong cham toi
-- du lieu cua `transport-core` hay cua mien ban hang.
--
-- DUONG LUI: cac lenh dao nguoc nam trong `README-rollback.sql` cung thu muc.
--
-- ---------------------------------------------------------------------------
-- PHAN DDL BANG/INDEX/KHOA NGOAI o duoi duoc SINH RA boi `prisma migrate diff`, khong go tay: hinh
-- dang bang phai khop tuyet doi voi `schema.prisma`, va go tay mot cot sai kieu se lam Prisma va
-- Postgres bat dong y nhau ma khong ai thay cho toi luc mot truy van tra sai.
--
-- PHAN RANG BUOC o cuoi thi NGUOC LAI: Prisma khong co cu phap cho `CHECK` lan `EXCLUDE`, nen chung
-- CHI ton tai o day. Sinh lai migration nay tu schema se lam TAT CA bien mat — va he thong van chay
-- binh thuong, chi khong con chan gi ca. `transport-costing-storage.spec.ts` doc chinh tep nay va do
-- neu mot ten bien mat.
--
-- ---------------------------------------------------------------------------
-- `btree_gist` — MOT PHU THUOC VAN HANH MOI, ghi ro thay vi de nguoi truc phat hien luc deploy:
--
-- `EXCLUDE ... USING gist` doi extension nay. Tu PostgreSQL 13, no la mot TRUSTED extension, nen
-- KHONG can superuser: mot role co quyen `CREATE` tren database (chu database) tao duoc no.
--
-- DO THAT, khong suy ra (PostgreSQL 16.15, 30/08/2026), tren dung hinh dang cua stack deploy —
-- role `zalo` LOGIN, `rolsuper = f`, chu database `zalo`:
--
--     zalo@zalo=> CREATE EXTENSION IF NOT EXISTS btree_gist;
--     CREATE EXTENSION
--
-- Neu mot muc tieu tuong lai (Postgres quan ly, quyen bi siet) tu choi lenh nay thi migration DUNG
-- LAI o dong dau tien va deploy do TO — chu khong lang le bo qua rang buoc chong lap ky roi chay
-- tiep. Do la hanh vi mong muon.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateEnum
CREATE TYPE "TransportDriverFundEntryKind" AS ENUM ('ADVANCE', 'RETURN', 'TRIP_EXPENSE', 'ADJUSTMENT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "TransportTripExpenseKind" AS ENUM ('EXPENSE', 'REVERSAL');

-- CreateEnum
CREATE TYPE "TransportExpenseFundingSource" AS ENUM ('DRIVER_FUND', 'COMPANY_DIRECT');

-- CreateEnum
CREATE TYPE "TransportFundPeriodStatus" AS ENUM ('OPEN', 'CLOSING', 'CLOSED', 'REOPENED');

-- CreateTable
CREATE TABLE "TransportDriverFundAccount" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'VND',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportDriverFundAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportDriverFundEntry" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "kind" "TransportDriverFundEntryKind" NOT NULL,
    "signedAmount" BIGINT NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'VND',
    "businessDate" VARCHAR(10) NOT NULL,
    "tripId" TEXT,
    "correlationKey" TEXT NOT NULL,
    "reversalOfId" TEXT,
    "note" TEXT,
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportDriverFundEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportTripExpense" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "kind" "TransportTripExpenseKind" NOT NULL,
    "categoryCode" VARCHAR(60) NOT NULL,
    "signedAmount" BIGINT NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'VND',
    "businessDate" VARCHAR(10) NOT NULL,
    "fundedBy" "TransportExpenseFundingSource" NOT NULL,
    "driverFundEntryId" TEXT,
    "driverId" TEXT,
    "correlationKey" TEXT NOT NULL,
    "reversalOfId" TEXT,
    "evidenceLocator" TEXT,
    "note" TEXT,
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportTripExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportDriverFundPeriod" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "startDate" VARCHAR(10) NOT NULL,
    "endDate" VARCHAR(10) NOT NULL,
    "status" "TransportFundPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenedBy" TEXT,
    "reopenReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportDriverFundPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportDriverFundPeriodSnapshot" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "openingBalance" BIGINT NOT NULL,
    "periodNet" BIGINT NOT NULL,
    "closingBalance" BIGINT NOT NULL,
    "entryCount" INTEGER NOT NULL,
    "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'VND',
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "takenBy" TEXT NOT NULL,

    CONSTRAINT "TransportDriverFundPeriodSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransportDriverFundAccount_driverId_key" ON "TransportDriverFundAccount"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportDriverFundEntry_correlationKey_key" ON "TransportDriverFundEntry"("correlationKey");

-- CreateIndex
CREATE UNIQUE INDEX "TransportDriverFundEntry_reversalOfId_key" ON "TransportDriverFundEntry"("reversalOfId");

-- CreateIndex
CREATE INDEX "TransportDriverFundEntry_accountId_businessDate_idx" ON "TransportDriverFundEntry"("accountId", "businessDate");

-- CreateIndex
CREATE INDEX "TransportDriverFundEntry_tripId_idx" ON "TransportDriverFundEntry"("tripId");

-- CreateIndex
CREATE INDEX "TransportDriverFundEntry_kind_idx" ON "TransportDriverFundEntry"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "TransportTripExpense_driverFundEntryId_key" ON "TransportTripExpense"("driverFundEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportTripExpense_correlationKey_key" ON "TransportTripExpense"("correlationKey");

-- CreateIndex
CREATE UNIQUE INDEX "TransportTripExpense_reversalOfId_key" ON "TransportTripExpense"("reversalOfId");

-- CreateIndex
CREATE INDEX "TransportTripExpense_tripId_businessDate_idx" ON "TransportTripExpense"("tripId", "businessDate");

-- CreateIndex
CREATE INDEX "TransportTripExpense_driverId_idx" ON "TransportTripExpense"("driverId");

-- CreateIndex
CREATE INDEX "TransportTripExpense_categoryCode_idx" ON "TransportTripExpense"("categoryCode");

-- CreateIndex
CREATE INDEX "TransportDriverFundPeriod_accountId_status_idx" ON "TransportDriverFundPeriod"("accountId", "status");

-- CreateIndex
CREATE INDEX "TransportDriverFundPeriod_accountId_startDate_idx" ON "TransportDriverFundPeriod"("accountId", "startDate");

-- CreateIndex
CREATE INDEX "TransportDriverFundPeriodSnapshot_periodId_idx" ON "TransportDriverFundPeriodSnapshot"("periodId");

-- CreateIndex
CREATE UNIQUE INDEX "TransportDriverFundPeriodSnapshot_periodId_sequence_key" ON "TransportDriverFundPeriodSnapshot"("periodId", "sequence");

-- AddForeignKey
ALTER TABLE "TransportDriverFundAccount" ADD CONSTRAINT "TransportDriverFundAccount_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "TransportDriver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportDriverFundEntry" ADD CONSTRAINT "TransportDriverFundEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TransportDriverFundAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportDriverFundEntry" ADD CONSTRAINT "TransportDriverFundEntry_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "TransportTrip"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportDriverFundEntry" ADD CONSTRAINT "TransportDriverFundEntry_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "TransportDriverFundEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTripExpense" ADD CONSTRAINT "TransportTripExpense_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "TransportTrip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTripExpense" ADD CONSTRAINT "TransportTripExpense_driverFundEntryId_fkey" FOREIGN KEY ("driverFundEntryId") REFERENCES "TransportDriverFundEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTripExpense" ADD CONSTRAINT "TransportTripExpense_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "TransportDriver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTripExpense" ADD CONSTRAINT "TransportTripExpense_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "TransportTripExpense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportDriverFundPeriod" ADD CONSTRAINT "TransportDriverFundPeriod_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TransportDriverFundAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportDriverFundPeriodSnapshot" ADD CONSTRAINT "TransportDriverFundPeriodSnapshot_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "TransportDriverFundPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===========================================================================
-- RANG BUOC — phan Prisma khong khai duoc. Doc chu thich dau tep truoc khi sua.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- KHOANG TIEN — cung hai hang so voi `money()` va voi `TransportTrip.freightAmount` (T2.1/F1).
--
-- T3 con CONG DON nhieu but toan lai, nen bien nay quan trong hon o T2: mot tong vuot 2^53-1 se mat
-- chinh xac LUC DOC, cho khong ai dang nhin. Cot la `BIGINT` (rong hon), `CHECK` bo hep ve dung
-- khoang ma JSON va `number` cua JavaScript con dem chinh xac duoc.
-- ---------------------------------------------------------------------------

ALTER TABLE "TransportDriverFundEntry"
  ADD CONSTRAINT "TransportDriverFundEntry_amount_money_range"
  CHECK ("signedAmount" BETWEEN -9007199254740991 AND 9007199254740991);

ALTER TABLE "TransportTripExpense"
  ADD CONSTRAINT "TransportTripExpense_amount_money_range"
  CHECK ("signedAmount" BETWEEN -9007199254740991 AND 9007199254740991);

ALTER TABLE "TransportDriverFundPeriodSnapshot"
  ADD CONSTRAINT "TransportDriverFundPeriodSnapshot_money_range"
  CHECK (
    "openingBalance" BETWEEN -9007199254740991 AND 9007199254740991
    AND "periodNet" BETWEEN -9007199254740991 AND 9007199254740991
    AND "closingBalance" BETWEEN -9007199254740991 AND 9007199254740991
  );

-- ---------------------------------------------------------------------------
-- DAU THEO LOAI BUT TOAN — ban sao o DB cua `driver-fund-ledger.ts`.
--
-- Vi sao phai co ca hai: ham TypeScript chi dung voi cac hang di QUA ung dung. Mot `INSERT` tay,
-- mot script nhap lieu, mot ban khoi phuc tu backup cu — khong duong nao trong so do goi
-- `signedAmountFor()`. Va mot `ADVANCE` mang so am se khong bao loi o dau ca: no chi lam so du di
-- sai huong roi nam yen toi khi ai do doi chieu tien mat cuoi thang.
--
-- `<> 0` cho ADJUSTMENT/REVERSAL: mot but toan 0 dong khong noi gi ve the gioi, va no lam moi bao
-- cao "so lan phat sinh" dem thua.
-- ---------------------------------------------------------------------------

ALTER TABLE "TransportDriverFundEntry"
  ADD CONSTRAINT "TransportDriverFundEntry_sign_by_kind"
  CHECK (
    ("kind" = 'ADVANCE' AND "signedAmount" > 0)
    OR ("kind" = 'RETURN' AND "signedAmount" < 0)
    OR ("kind" = 'TRIP_EXPENSE' AND "signedAmount" < 0)
    OR ("kind" = 'ADJUSTMENT' AND "signedAmount" <> 0)
    OR ("kind" = 'REVERSAL' AND "signedAmount" <> 0)
  );

ALTER TABLE "TransportTripExpense"
  ADD CONSTRAINT "TransportTripExpense_sign_by_kind"
  CHECK (
    ("kind" = 'EXPENSE' AND "signedAmount" > 0)
    OR ("kind" = 'REVERSAL' AND "signedAmount" < 0)
  );

-- ---------------------------------------------------------------------------
-- MOT BUT TOAN DAO PHAI TRO TOI BAN GOC, va chi but toan dao moi duoc tro.
--
-- Thieu rang buoc nay thi ton tai duoc mot hang `kind = 'REVERSAL'` khong tro toi gi — mot but toan
-- dao khong dao cai gi ca — va mot hang `kind = 'ADVANCE'` lai tro toi mot but toan khac. Ca hai
-- deu doc len van "hop le", va ca hai deu lam duong lan vet cua `INV-20` dut o giua.
-- ---------------------------------------------------------------------------

ALTER TABLE "TransportDriverFundEntry"
  ADD CONSTRAINT "TransportDriverFundEntry_reversal_kind"
  CHECK (("kind" = 'REVERSAL') = ("reversalOfId" IS NOT NULL));

ALTER TABLE "TransportTripExpense"
  ADD CONSTRAINT "TransportTripExpense_reversal_kind"
  CHECK (("kind" = 'REVERSAL') = ("reversalOfId" IS NOT NULL));

-- ---------------------------------------------------------------------------
-- HAI LOP CUA MOT KHOAN CHI — `INV-03`, cuong che o DB.
--
-- Tien tu quy        -> BAT BUOC co dong quy sinh doi VA co lai xe chiu trach nhiem;
-- cong ty tra thang  -> BAT BUOC khong co dong quy nao (tien khong di qua tay lai xe).
--
-- Thieu ve dau: mot khoan chi `DRIVER_FUND` mo coi lam so du quy khong tru, tuc lai xe "van con"
-- tien ho da tieu. Thieu ve sau: mot khoan `COMPANY_DIRECT` lai tru quy, tuc lai xe bi tru tien cho
-- mot khoan cong ty da tra. Ca hai deu la sai lech TIEN THAT, khong phai sai lech mo hinh.
-- ---------------------------------------------------------------------------

ALTER TABLE "TransportTripExpense"
  ADD CONSTRAINT "TransportTripExpense_fund_leg"
  CHECK (
    ("fundedBy" = 'DRIVER_FUND' AND "driverFundEntryId" IS NOT NULL AND "driverId" IS NOT NULL)
    OR ("fundedBy" = 'COMPANY_DIRECT' AND "driverFundEntryId" IS NULL)
  );

-- ---------------------------------------------------------------------------
-- NGAY NGHIEP VU — cung khuon voi T2.1/F3, cung ly le.
--
-- Giu `VARCHAR(10)` dang `YYYY-MM-DD` (`INV-25`): doi sang `DATE` se dua mot doi tuong `Date` (mot
-- KHOANH KHAC) tro lai tang ung dung, va "dinh dang lai mot khoanh khac thanh ngay" chinh la phep
-- tinh ma `INV-25` sinh ra de xoa bo.
--
-- Regex chan sai DANG; vong `to_date`/`to_char` chan ngay KHONG CO THAT (`2026-02-30`). Tu
-- PostgreSQL 10, `to_date` KHONG cuon ngay tran sang thang sau — no nem
-- `date/time field value out of range`. Ket qua nghiep vu giong nhau (lenh ghi bi huy), co che thi
-- khac; ghi ro de bao cao sau nay khong mo ta nham.
-- ---------------------------------------------------------------------------

ALTER TABLE "TransportDriverFundEntry"
  ADD CONSTRAINT "TransportDriverFundEntry_businessDate_iso"
  CHECK (
    "businessDate" ~ '^\d{4}-\d{2}-\d{2}$'
    AND to_char(to_date("businessDate", 'YYYY-MM-DD'), 'YYYY-MM-DD') = "businessDate"
  );

ALTER TABLE "TransportTripExpense"
  ADD CONSTRAINT "TransportTripExpense_businessDate_iso"
  CHECK (
    "businessDate" ~ '^\d{4}-\d{2}-\d{2}$'
    AND to_char(to_date("businessDate", 'YYYY-MM-DD'), 'YYYY-MM-DD') = "businessDate"
  );

-- Ba dieu trong MOT rang buoc vi chung cung noi mot cau: "hai moc cua ky la ngay co that, va chung
-- dung thu tu". Tach lam ba se cho ra ba thong diep loi cho cung mot o nhap sai.
ALTER TABLE "TransportDriverFundPeriod"
  ADD CONSTRAINT "TransportDriverFundPeriod_dates_iso"
  CHECK (
    "startDate" ~ '^\d{4}-\d{2}-\d{2}$'
    AND to_char(to_date("startDate", 'YYYY-MM-DD'), 'YYYY-MM-DD') = "startDate"
    AND "endDate" ~ '^\d{4}-\d{2}-\d{2}$'
    AND to_char(to_date("endDate", 'YYYY-MM-DD'), 'YYYY-MM-DD') = "endDate"
    AND "startDate" <= "endDate"
  );

-- ---------------------------------------------------------------------------
-- ANH CHUP PHAI TU NHAT QUAN: `closingBalance = openingBalance + periodNet`.
--
-- Day la mot phep cong ba cot, nen mot `UPDATE` tay khong the de lai mot anh chup "gan dung". Neu
-- thieu, mot anh chup sai se song mai trong lich su bao cao va khong con gi de doi chieu no voi.
-- ---------------------------------------------------------------------------

ALTER TABLE "TransportDriverFundPeriodSnapshot"
  ADD CONSTRAINT "TransportDriverFundPeriodSnapshot_balance_sum"
  CHECK ("closingBalance" = "openingBalance" + "periodNet");

-- ---------------------------------------------------------------------------
-- HAI KY QUY CUA CUNG MOT SO QUY KHONG DUOC CHONG LAP THOI GIAN.
--
-- Vi sao phai la DB chu khong phai service: kiem "doc danh sach ky roi so khoang" dung voi MOT
-- nguoi ghi. Hai request cung luc mo hai ky giao nhau deu doc thay danh sach CU roi deu `INSERT` —
-- va khong tang nao trong ung dung nhin thay duoc dieu do. Ket qua la mot ngay nghiep vu thuoc hai
-- ky, tuc cau hoi "ky nay chot bao nhieu" co hai cau tra loi.
--
-- Day dung la EXCLUSION CONSTRAINT ma T2.1 da GHI TEN nhu mot lua chon siet them ve sau (chu thich
-- F2 cua `20260830090000_transport_storage_invariants`). T3 dung no o dung cho no can den.
--
-- VI SAO KHONG DUNG `to_date(...)` — DO DUOC, khong suy ra (PostgreSQL 16.15, 30/08/2026):
--
--     SELECT proname, provolatile FROM pg_proc WHERE proname IN ('to_date','make_date','substr');
--       to_date    | s      <-- STABLE
--       make_date  | i      <-- IMMUTABLE
--       substr     | i      <-- IMMUTABLE
--
-- `to_date` la STABLE (dinh dang cua no chiu anh huong cua `DateStyle`/`lc_time` o mot so mau), va
-- mot bieu thuc STABLE KHONG dung duoc trong index hay constraint: Postgres tu choi voi
-- `ERROR: functions in index expression must be marked IMMUTABLE` (42P17). Ban dau tep nay dung
-- `to_date` va migration DO NGAY o lenh cuoi — do la ly do khoi chu thich nay ton tai.
--
-- `make_date(int,int,int)` cong `substr` deu IMMUTABLE, nen chung dung duoc. Rang buoc
-- `..._dates_iso` phia tren da bao dam chuoi co dang `YYYY-MM-DD`, nen ba lat cat luon la so.
-- Thu tu danh gia giua hai rang buoc khong duoc SQL bao dam, nen mot chuoi rac VE LY THUYET co the
-- ra loi ep kieu thay vi vi pham `CHECK` — ca hai deu la tu choi, khong duong nao cho hang xau di
-- qua. Do la tat ca nhung gi cap rang buoc nay hua.
--
-- `'[]'` — khoang DONG CA HAI DAU. Ky 01/08..31/08 va ky 31/08..30/09 PHAI bi coi la chong lap, vi
-- mot but toan ngay 31/08 roi vao ca hai. Neu dung `'[)'` thi dung cap ky do di lot, va bat bien
-- nay se rong o chinh cho de sai nhat.
-- ---------------------------------------------------------------------------

ALTER TABLE "TransportDriverFundPeriod"
  ADD CONSTRAINT "TransportDriverFundPeriod_no_overlap"
  EXCLUDE USING gist (
    "accountId" WITH =,
    daterange(
      make_date(
        substr("startDate", 1, 4)::int,
        substr("startDate", 6, 2)::int,
        substr("startDate", 9, 2)::int
      ),
      make_date(
        substr("endDate", 1, 4)::int,
        substr("endDate", 6, 2)::int,
        substr("endDate", 9, 2)::int
      ),
      '[]'
    ) WITH &&
  );
