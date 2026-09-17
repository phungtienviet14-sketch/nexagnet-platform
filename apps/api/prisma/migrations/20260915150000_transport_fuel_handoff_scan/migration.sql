-- ===========================================================================
-- VI TRI QUET hop thu di cua TX-04 — `#295` Lane V, P0.
--
-- Bang nay sua mot loi SONG (liveness), khong phai mot loi tien.
--
-- Truoc no, vong quet doc 500 hang DAU cua `TransportFuelSettlementHandoff`
-- theo `emittedAt` tang dan, roi moi doi chieu con tro tieu thu ben TX-05.
-- Phia TX-04 khong biet hang nao da doc roi, nen no tra ve dung 500 hang do
-- moi nhip. Khi ca 500 ky dau tien deu da co cong no, ky thu 501 khong bao gio
-- duoc nhin thay — ban giao hop le, ma khoan phai tra cho cay xang khong bao
-- gio xuat hien.
--
-- Bang nay giu VI TRI DOC dang keyset, nen moi nhip bat dau tu cho nhip truoc
-- dung lai. Het duoi bang thi quay ve dau (`lastEmittedAt = NULL`).
--
-- KHONG gop voi `TransportSettlementFuelHandoffCursor`: bang do tra loi "ky
-- nay con viec khong" (dung/sai ve tien), bang nay tra loi "lan sau doc tu
-- dau" (chay/dung ve tien). Hai cau hoi khac nhau, hai vong doi khac nhau.
--
-- KHONG co khoa ngoai nao sang `transport-fuel`, cung ly do voi bang con tro:
-- chieu phu thuoc TX-05 -> TX-04 la mot chieu va chi doc.
-- ===========================================================================

-- CreateTable
CREATE TABLE "TransportSettlementFuelHandoffScan" (
    "id" TEXT NOT NULL,
    "lastEmittedAt" TIMESTAMP(3),
    "lastHandoffId" TEXT,
    "cycles" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportSettlementFuelHandoffScan_pkey" PRIMARY KEY ("id")
);

-- ===========================================================================
-- HAI COT KEYSET DI CUNG NHAU HOAC CUNG VANG.
--
-- Mot nua keyset la mot vi tri khong so sanh duoc: ve phai cua
-- `(emittedAt, id) > (X, Y)` khong viet ra duoc khi thieu mot ve. Ma mot vi
-- tri khong so sanh duoc thi vong quet hoac bo qua mot hang, hoac doc lai mot
-- hang mai mai — dung hai trieu chung ma bang nay sinh ra de chua.
--
-- Rang buoc nay o tang CSDL chu khong o tang ung dung vi no la mot tinh chat
-- cua DU LIEU: mot ban va sau nay ghi mot nua keyset se hong im lang, va se
-- hong theo kieu chi lo ra sau vai thang van hanh.
-- ===========================================================================
ALTER TABLE "TransportSettlementFuelHandoffScan"
    ADD CONSTRAINT "TransportSettlementFuelHandoffScan_keyset_paired"
    CHECK (
        ("lastEmittedAt" IS NULL AND "lastHandoffId" IS NULL)
        OR ("lastEmittedAt" IS NOT NULL AND "lastHandoffId" IS NOT NULL)
    );

-- `cycles` chi tang. Mot so vong AM la mot lan ghi sai, khong phai mot trang
-- thai nghiep vu.
ALTER TABLE "TransportSettlementFuelHandoffScan"
    ADD CONSTRAINT "TransportSettlementFuelHandoffScan_cycles_non_negative"
    CHECK ("cycles" >= 0);
