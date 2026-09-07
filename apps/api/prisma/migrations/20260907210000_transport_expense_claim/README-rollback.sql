-- DUONG LUI cua `20260907210000_transport_expense_claim` (R1-C -- #232 `D-06` / #234 A2).
--
-- Chay tay khi can quay ve hinh dang truoc migration. KHONG phai mot migration Prisma.
--
-- MIGRATION NAY CHI THEM: hai kieu enum moi, hai bang moi. No khong sua mot cot nao cua T3, va
-- khoa ngoai chi di MOT huong: bang moi -> bang cu (`TransportDriver`, `TransportTrip`,
-- `TransportVehicleRun`, `TransportRunLeg`, `TransportTripExpense`).
--
-- CAI PHAI DOC KY TRUOC KHI LUI: mot de nghi DA DUYET co the da sinh ra mot `TransportTripExpense`
-- va mot but toan quy. Nhung hang do la GIA THANH THAT va KHONG bi migration nay dung toi -- lui
-- bang nay chi xoa mat DAU VET "khoan chi do den tu de nghi nao, ai duyet, luc nao, vi ly do gi".
--
-- Noi cach khac: tien khong mat, nhung co so giai trinh cua tien thi mat. Neu ky ke toan da dong
-- dua tren nhung khoan do, HAY XUAT RA TRUOC:
--
--     \copy (SELECT c.*, d.sequence, d.outcome, d."approvedAmount" AS decision_amount,
--                   d."reasonCode", d."decidedBy", d."decidedAt"
--              FROM "TransportExpenseClaim" c
--              LEFT JOIN "TransportExpenseClaimDecision" d ON d."claimId" = c.id
--             ORDER BY c.id, d.sequence)
--       TO 'expense-claims.csv' CSV HEADER;
--
-- Truoc khi chay, DEM da:
--
--     SELECT status, count(*) FROM "TransportExpenseClaim" GROUP BY status;
--     SELECT count(*) FROM "TransportExpenseClaimDecision";
--     SELECT count(*) FROM "TransportExpenseClaim" WHERE "settlementExpenseId" IS NOT NULL;

DROP TABLE IF EXISTS "TransportExpenseClaimDecision";
DROP TABLE IF EXISTS "TransportExpenseClaim";
DROP TYPE IF EXISTS "TransportExpenseClaimDecisionOutcome";
DROP TYPE IF EXISTS "TransportExpenseClaimStatus";
