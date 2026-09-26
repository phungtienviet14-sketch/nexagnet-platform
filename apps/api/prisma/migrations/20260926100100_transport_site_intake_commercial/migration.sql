-- ===========================================================================
-- #398 — VIEC TAI XE NHAN TRUC TIEP -> DON TU DONG, KHONG NHAN DOI VONG CHAY/CHANG.
--
-- MIGRATION NAY CHI THEM:
--
--   · sau kieu enum moi;
--   · MOT cot nullable tren `TransportRunSiteIntake` (`siteMatch`) — hang cu giu `NULL`, nghia la
--     "khong biet lan xac nhan do khop dia diem ra sao", KHONG PHAI mot gia tri doan;
--   · MOT bang moi `TransportSiteIntakeCommercial` kem rang buoc va trigger cua chinh no;
--   · MOT trigger tren `TransportRunLeg`: `orderId` gan MOT LAN (`X -> Y` bi cam).
--
-- Khong cot nao doi kieu, khong rang buoc nao bi go, khong hang cu nao bi viet lai. Duong lui o
-- `README-rollback.sql` cung thu muc.
--
-- CANH BAO: `prisma migrate dev` diff schema voi DB se sinh lenh XOA moi `CHECK` va trigger duoi
-- day. Ai chay lenh do PHAI doc lai migration sinh ra va bo cac dong do truoc khi commit — cung
-- canh bao da ghi o `schema.prisma` tren khoi `TransportSiteIntakeCommercial`.
-- ===========================================================================

-- ---------------------------------------------------------------------------------------------
-- 1. LAN XAC NHAN KHOP DIA DIEM RA SAO — ghi CUNG LUC voi lan xac nhan, khong suy lai sau.
--
-- `#398` §8 doi *"ambiguous Site"* va *"stale/unusable location"* phai ra NEEDS_REVIEW thay vi tu
-- tao don. May chu biet dieu do DUNG LUC lai xe bam (ket qua `resolveSiteCandidates`), va chi luc
-- do: hang rao sua ngay mai se lam mot lan suy lai noi khac. Nen no la mot cot cua CHINH ban ghi
-- xac nhan — bang chi-ghi-them — chu khong phai mot o co the sua.
-- ---------------------------------------------------------------------------------------------
CREATE TYPE "TransportSiteIntakeSiteMatch" AS ENUM ('UNIQUE_INSIDE', 'CHOSEN_AMONG_SEVERAL', 'NO_LOCATION');

ALTER TABLE "TransportRunSiteIntake" ADD COLUMN "siteMatch" "TransportSiteIntakeSiteMatch";

-- ---------------------------------------------------------------------------------------------
-- 2. PHAN THUONG MAI cua mot lan nhan viec — MOT hang cho MOT lan xac nhan.
-- ---------------------------------------------------------------------------------------------
CREATE TYPE "TransportSiteIntakeCommercialStatus" AS ENUM ('PENDING', 'ORDER_BOUND', 'REJECTED');

CREATE TYPE "TransportSiteIntakeBindingMode" AS ENUM ('AUTO_CREATED', 'OFFICE_COMPLETED', 'OFFICE_EXISTING_ORDER');

CREATE TYPE "TransportSiteIntakeDestinationSource" AS ENUM ('KNOWN_PLACE', 'PLACE_SEARCH');

CREATE TYPE "TransportSiteIntakeActorRole" AS ENUM ('DRIVER', 'OFFICE');

CREATE TYPE "TransportSiteIntakeExceptionOutcome" AS ENUM (
  'ORDER_CANCELLED_WORK_CANCELLED',
  'ORDER_CANCELLED_OPERATION_PRESERVED',
  'INTAKE_REJECTED_WORK_CANCELLED',
  'INTAKE_REJECTED_OPERATION_PRESERVED',
  'ANOMALY_RECORDED_ORDER_TERMINAL'
);

CREATE TABLE "TransportSiteIntakeCommercial" (
    "id" TEXT NOT NULL,
    "intakeId" TEXT NOT NULL,
    "status" "TransportSiteIntakeCommercialStatus" NOT NULL DEFAULT 'PENDING',
    "destinationLabel" TEXT,
    "destinationLatitude" DOUBLE PRECISION,
    "destinationLongitude" DOUBLE PRECISION,
    "destinationSource" "TransportSiteIntakeDestinationSource",
    "destinationRef" TEXT,
    "destinationSetBy" TEXT,
    "destinationSetByRole" "TransportSiteIntakeActorRole",
    "destinationSetAt" TIMESTAMP(3),
    "destinationEventId" TEXT,
    "originAttestedBy" TEXT,
    "originAttestedAt" TIMESTAMP(3),
    "orderId" TEXT,
    "bindingMode" "TransportSiteIntakeBindingMode",
    "boundBy" TEXT,
    "boundAt" TIMESTAMP(3),
    "exceptionReason" TEXT,
    "exceptionOutcome" "TransportSiteIntakeExceptionOutcome",
    "exceptionBy" TEXT,
    "exceptionAt" TIMESTAMP(3),
    "exceptionKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportSiteIntakeCommercial_pkey" PRIMARY KEY ("id")
);

-- MOT hang thuong mai cho MOT lan xac nhan.
CREATE UNIQUE INDEX "TransportSiteIntakeCommercial_intakeId_key" ON "TransportSiteIntakeCommercial"("intakeId");

-- MOT don chi nhan MOT lan nhan viec. Chieu con lai (mot lan nhan viec chi co MOT don) la cot
-- `orderId` don tri + trigger ben duoi.
CREATE UNIQUE INDEX "TransportSiteIntakeCommercial_orderId_key" ON "TransportSiteIntakeCommercial"("orderId");

CREATE INDEX "TransportSiteIntakeCommercial_status_idx" ON "TransportSiteIntakeCommercial"("status");

CREATE INDEX "TransportSiteIntakeCommercial_boundAt_idx" ON "TransportSiteIntakeCommercial"("boundAt");

-- `RESTRICT` ca hai chieu: mot lan xac nhan da co phan thuong mai thi khong bo duoc, va mot don da
-- nhan mot lan nhan viec thi khong xoa cung duoc (`GD-02` — huy thay xoa).
ALTER TABLE "TransportSiteIntakeCommercial"
  ADD CONSTRAINT "TransportSiteIntakeCommercial_intakeId_fkey"
  FOREIGN KEY ("intakeId") REFERENCES "TransportRunSiteIntake"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TransportSiteIntakeCommercial"
  ADD CONSTRAINT "TransportSiteIntakeCommercial_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "TransportOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DIEM GIAO LA MOT KHOI, KHONG PHAI BAY O LE. Nhan + toa do + nguon + ai + vai + luc nao: co du
-- ca, hoac khong co gi. Nua khoi (co nhan, khong toa do) la dung cai "free-text gia lam su that vi
-- tri" ma `#398` §3.3 cam.
ALTER TABLE "TransportSiteIntakeCommercial"
  ADD CONSTRAINT "TransportSiteIntakeCommercial_destination_complete"
  CHECK (
    ("destinationLabel" IS NULL AND "destinationLatitude" IS NULL AND "destinationLongitude" IS NULL
      AND "destinationSource" IS NULL AND "destinationSetBy" IS NULL
      AND "destinationSetByRole" IS NULL AND "destinationSetAt" IS NULL AND "destinationRef" IS NULL)
    OR
    ("destinationLabel" IS NOT NULL AND "destinationLatitude" IS NOT NULL
      AND "destinationLongitude" IS NOT NULL AND "destinationSource" IS NOT NULL
      AND "destinationSetBy" IS NOT NULL AND "destinationSetByRole" IS NOT NULL
      AND "destinationSetAt" IS NOT NULL)
  );

-- Dia diem da biet PHAI tro ve hang rao da chon — neu khong thi "da biet" chi la mot loi khai.
ALTER TABLE "TransportSiteIntakeCommercial"
  ADD CONSTRAINT "TransportSiteIntakeCommercial_known_place_has_ref"
  CHECK ("destinationSource" IS DISTINCT FROM 'KNOWN_PLACE' OR "destinationRef" IS NOT NULL);

ALTER TABLE "TransportSiteIntakeCommercial"
  ADD CONSTRAINT "TransportSiteIntakeCommercial_destination_label_not_blank"
  CHECK ("destinationLabel" IS NULL OR btrim("destinationLabel") <> '');

-- Cung khoang va cung bien null island voi `TransportOrder_*` (#379): mot toa do ma don se nhan
-- lai phai qua dung mot cua voi don.
ALTER TABLE "TransportSiteIntakeCommercial"
  ADD CONSTRAINT "TransportSiteIntakeCommercial_destination_latitude_range"
  CHECK ("destinationLatitude" IS NULL OR ("destinationLatitude" >= -90 AND "destinationLatitude" <= 90));

ALTER TABLE "TransportSiteIntakeCommercial"
  ADD CONSTRAINT "TransportSiteIntakeCommercial_destination_longitude_range"
  CHECK ("destinationLongitude" IS NULL OR ("destinationLongitude" >= -180 AND "destinationLongitude" <= 180));

ALTER TABLE "TransportSiteIntakeCommercial"
  ADD CONSTRAINT "TransportSiteIntakeCommercial_destination_not_null_island"
  CHECK ("destinationLatitude" IS NULL OR abs("destinationLatitude") >= 1e-9 OR abs("destinationLongitude") >= 1e-9);

-- Van phong XAC NHAN noi lay hang: ai + luc nao, di cung nhau.
ALTER TABLE "TransportSiteIntakeCommercial"
  ADD CONSTRAINT "TransportSiteIntakeCommercial_origin_attestation_paired"
  CHECK ((("originAttestedBy" IS NULL) = ("originAttestedAt" IS NULL))
    AND ("originAttestedBy" IS NULL OR btrim("originAttestedBy") <> ''));

-- GAN DON: trang thai `ORDER_BOUND` KHI VA CHI KHI co don + che do + ai + luc nao.
ALTER TABLE "TransportSiteIntakeCommercial"
  ADD CONSTRAINT "TransportSiteIntakeCommercial_binding_shape"
  CHECK (
    ("status" = 'ORDER_BOUND' AND "orderId" IS NOT NULL AND "bindingMode" IS NOT NULL
      AND "boundBy" IS NOT NULL AND "boundAt" IS NOT NULL)
    OR
    ("status" <> 'ORDER_BOUND' AND "orderId" IS NULL AND "bindingMode" IS NULL
      AND "boundBy" IS NULL AND "boundAt" IS NULL)
  );

-- BAT THUONG / HUY: ly do + ket cuc + ai + luc nao, di cung nhau; ly do khong rong.
ALTER TABLE "TransportSiteIntakeCommercial"
  ADD CONSTRAINT "TransportSiteIntakeCommercial_exception_shape"
  CHECK (
    ("exceptionReason" IS NULL AND "exceptionOutcome" IS NULL AND "exceptionBy" IS NULL
      AND "exceptionAt" IS NULL AND "exceptionKey" IS NULL)
    OR
    ("exceptionReason" IS NOT NULL AND btrim("exceptionReason") <> ''
      AND "exceptionOutcome" IS NOT NULL AND "exceptionBy" IS NOT NULL
      AND "exceptionAt" IS NOT NULL AND "exceptionKey" IS NOT NULL)
  );

-- `REJECTED` chi den tu mot lan bao bat thuong co ly do — khong co duong "tu choi im lang".
ALTER TABLE "TransportSiteIntakeCommercial"
  ADD CONSTRAINT "TransportSiteIntakeCommercial_rejected_has_reason"
  CHECK ("status" <> 'REJECTED' OR "exceptionAt" IS NOT NULL);

-- ---------------------------------------------------------------------------------------------
-- 3. TRIGGER: phan THUONG MAI khong quay nguoc, va don GAN MOT LAN.
--
-- Mot cong o tang mien chung minh duoc DUONG DO khong sua; no khong chung minh duoc khong con duong
-- nao khac. Trigger chung minh ca voi mot cau `UPDATE` viet tay tren psql — cung ly le voi
-- `transport_run_leg_completed_is_immutable`.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "transport_site_intake_commercial_guard"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'transport_site_intake_commercial_guard: khong xoa duoc phan thuong mai cua mot lan nhan viec';
  END IF;
  IF NEW."intakeId" IS DISTINCT FROM OLD."intakeId" THEN
    RAISE EXCEPTION 'transport_site_intake_commercial_guard: khong doi duoc lan nhan viec (hang %)', OLD."id";
  END IF;
  -- MOT LAN GAN: null -> X duoc, X -> X la khong doi, X -> Y (ke ca X -> null) bi cam.
  IF OLD."orderId" IS NOT NULL AND NEW."orderId" IS DISTINCT FROM OLD."orderId" THEN
    RAISE EXCEPTION
      'transport_site_intake_commercial_guard: lan nhan viec % da gan don %, khong gan lai duoc', OLD."intakeId", OLD."orderId";
  END IF;
  IF OLD."boundAt" IS NOT NULL AND (NEW."bindingMode" IS DISTINCT FROM OLD."bindingMode"
      OR NEW."boundBy" IS DISTINCT FROM OLD."boundBy" OR NEW."boundAt" IS DISTINCT FROM OLD."boundAt") THEN
    RAISE EXCEPTION 'transport_site_intake_commercial_guard: dau vet gan don khong sua duoc (hang %)', OLD."id";
  END IF;
  -- Trang thai cuoi khong quay nguoc: `ORDER_BOUND` va `REJECTED` dung yen.
  IF OLD."status" <> 'PENDING' AND NEW."status" IS DISTINCT FROM OLD."status" THEN
    RAISE EXCEPTION
      'transport_site_intake_commercial_guard: trang thai % khong doi duoc (hang %)', OLD."status", OLD."id";
  END IF;
  -- Diem giao dong bang khi phan thuong mai da xong: sau do su that nam o DON.
  IF OLD."status" <> 'PENDING' AND (
      NEW."destinationLabel" IS DISTINCT FROM OLD."destinationLabel"
      OR NEW."destinationLatitude" IS DISTINCT FROM OLD."destinationLatitude"
      OR NEW."destinationLongitude" IS DISTINCT FROM OLD."destinationLongitude"
      OR NEW."destinationSource" IS DISTINCT FROM OLD."destinationSource"
      OR NEW."destinationRef" IS DISTINCT FROM OLD."destinationRef") THEN
    RAISE EXCEPTION 'transport_site_intake_commercial_guard: diem giao da dong bang (hang %)', OLD."id";
  END IF;
  IF OLD."exceptionAt" IS NOT NULL AND (NEW."exceptionReason" IS DISTINCT FROM OLD."exceptionReason"
      OR NEW."exceptionOutcome" IS DISTINCT FROM OLD."exceptionOutcome"
      OR NEW."exceptionBy" IS DISTINCT FROM OLD."exceptionBy"
      OR NEW."exceptionAt" IS DISTINCT FROM OLD."exceptionAt"
      OR NEW."exceptionKey" IS DISTINCT FROM OLD."exceptionKey") THEN
    RAISE EXCEPTION 'transport_site_intake_commercial_guard: lan bao bat thuong da ghi khong sua duoc (hang %)', OLD."id";
  END IF;
  IF OLD."originAttestedAt" IS NOT NULL AND (NEW."originAttestedBy" IS DISTINCT FROM OLD."originAttestedBy"
      OR NEW."originAttestedAt" IS DISTINCT FROM OLD."originAttestedAt") THEN
    RAISE EXCEPTION 'transport_site_intake_commercial_guard: lan xac nhan noi lay hang khong sua duoc (hang %)', OLD."id";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "transport_site_intake_commercial_guard"
  BEFORE UPDATE OR DELETE ON "TransportSiteIntakeCommercial"
  FOR EACH ROW EXECUTE FUNCTION "transport_site_intake_commercial_guard"();

-- ---------------------------------------------------------------------------------------------
-- 4. CHANG: `orderId` GAN MOT LAN.
--
-- `#398` §6: *"null -> Order X allowed; X -> X idempotent; X -> Y forbidden"*. Tang mien chi co
-- MOT duong dat `orderId` len mot chang da ton tai (lenh nhan lai cua `transport-site-intake`, voi
-- `WHERE "orderId" IS NULL`); trigger nay chan moi duong con lai, ke ca psql.
--
-- `X -> NULL` KHONG bi chan o day, va do la co y: khoa ngoai `TransportRunLeg_orderId_fkey` da co
-- tu `20260907190000_transport_movement` la `ON DELETE SET NULL`, tuc chinh Postgres ghi `NULL`
-- khi mot don bi xoa cung. Chan no se lam hong mot rang buoc cua lane khac. Mien khong co duong
-- xoa don nao (`GD-02`), nen canh do chi mo cho ha tang, khong cho mot lan gan lai.
--
-- Chang da `COMPLETED` van bi khoa CA cot nay boi `transport_run_leg_completed_is_immutable`.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "transport_run_leg_order_binding_once"()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."orderId" IS NOT NULL AND NEW."orderId" IS NOT NULL
     AND NEW."orderId" IS DISTINCT FROM OLD."orderId" THEN
    RAISE EXCEPTION
      'transport_run_leg_order_binding_once: chang % da phuc vu don %, khong gan sang don khac', OLD."id", OLD."orderId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "transport_run_leg_order_binding_once"
  BEFORE UPDATE ON "TransportRunLeg"
  FOR EACH ROW EXECUTE FUNCTION "transport_run_leg_order_binding_once"();
