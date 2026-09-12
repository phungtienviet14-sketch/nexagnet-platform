CREATE TYPE "TransportCustomerReconciliationBatchStatus" AS ENUM ('DRAFT', 'CLOSED', 'CANCELLED');
CREATE TYPE "TransportCustomerReconciliationLineState" AS ENUM ('PENDING', 'CONFIRMED', 'DEFERRED');
CREATE TYPE "TransportCustomerPaymentAllocationKind" AS ENUM ('APPLY', 'RELEASE');

CREATE TABLE "TransportCustomerReconciliationBatch" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'VND',
  "status" "TransportCustomerReconciliationBatchStatus" NOT NULL DEFAULT 'DRAFT',
  "periodStart" VARCHAR(10),
  "periodEnd" VARCHAR(10),
  "reference" TEXT,
  "note" TEXT,
  "sourceContext" VARCHAR(60) NOT NULL,
  "sourceId" VARCHAR(160) NOT NULL,
  "sourceFingerprint" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedBy" TEXT,
  "closedAt" TIMESTAMPTZ(6),
  CONSTRAINT "TransportCustomerReconciliationBatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TransportCustomerReconciliationBatch_currency_shape" CHECK ("currencyCode" ~ '^[A-Z]{3}$'),
  CONSTRAINT "TransportCustomerReconciliationBatch_period_shape" CHECK (
    ("periodStart" IS NULL AND "periodEnd" IS NULL)
    OR ("periodStart" ~ '^\d{4}-\d{2}-\d{2}$' AND "periodEnd" ~ '^\d{4}-\d{2}-\d{2}$'
      AND to_char(to_date("periodStart", 'YYYY-MM-DD'), 'YYYY-MM-DD') = "periodStart"
      AND to_char(to_date("periodEnd", 'YYYY-MM-DD'), 'YYYY-MM-DD') = "periodEnd"
      AND "periodStart" <= "periodEnd")
  ),
  CONSTRAINT "TransportCustomerReconciliationBatch_actor_shape" CHECK (
    length(btrim("createdBy")) > 0
    AND (("status" = 'DRAFT' AND "closedBy" IS NULL AND "closedAt" IS NULL)
      OR ("status" <> 'DRAFT' AND length(btrim("closedBy")) > 0 AND "closedAt" IS NOT NULL))
  )
);

CREATE TABLE "TransportCustomerReconciliationBatchLine" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "orderCode" TEXT NOT NULL,
  "proposedAmount" BIGINT NOT NULL,
  "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'VND',
  "state" "TransportCustomerReconciliationLineState" NOT NULL DEFAULT 'PENDING',
  "resolutionReason" TEXT,
  "resolvedBy" TEXT,
  "resolvedAt" TIMESTAMPTZ(6),
  "resolutionSourceId" VARCHAR(160),
  "resolutionFingerprint" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TransportCustomerReconciliationBatchLine_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TransportCustomerReconciliationBatchLine_amount_range" CHECK ("proposedAmount" BETWEEN 0 AND 9007199254740991),
  CONSTRAINT "TransportCustomerReconciliationBatchLine_currency_shape" CHECK ("currencyCode" ~ '^[A-Z]{3}$'),
  CONSTRAINT "TransportCustomerReconciliationBatchLine_resolution_shape" CHECK (
    ("state" = 'PENDING' AND "resolvedBy" IS NULL AND "resolvedAt" IS NULL AND "resolutionSourceId" IS NULL AND "resolutionFingerprint" IS NULL)
    OR ("state" <> 'PENDING' AND length(btrim("resolvedBy")) > 0 AND "resolvedAt" IS NOT NULL AND length(btrim("resolutionSourceId")) > 0 AND length(btrim("resolutionFingerprint")) > 0)
  )
);

CREATE TABLE "TransportCustomerReconciliation" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "batchLineId" TEXT,
  "proposedAmount" BIGINT NOT NULL,
  "confirmedAmount" BIGINT NOT NULL,
  "differenceAmount" BIGINT NOT NULL,
  "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'VND',
  "businessDate" VARCHAR(10) NOT NULL,
  "dueDate" VARCHAR(10),
  "differenceReason" TEXT,
  "confirmationReference" TEXT,
  "evidenceRefs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "sourceContext" VARCHAR(60) NOT NULL,
  "sourceId" VARCHAR(160) NOT NULL,
  "sourceFingerprint" TEXT NOT NULL,
  "confirmedBy" TEXT NOT NULL,
  "confirmedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settlementDocumentId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TransportCustomerReconciliation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TransportCustomerReconciliation_amount_shape" CHECK (
    "proposedAmount" BETWEEN 0 AND 9007199254740991
    AND "confirmedAmount" BETWEEN 1 AND 9007199254740991
    AND "differenceAmount" = abs("proposedAmount" - "confirmedAmount")
  ),
  CONSTRAINT "TransportCustomerReconciliation_currency_shape" CHECK ("currencyCode" ~ '^[A-Z]{3}$'),
  CONSTRAINT "TransportCustomerReconciliation_date_shape" CHECK (
    "businessDate" ~ '^\d{4}-\d{2}-\d{2}$'
    AND to_char(to_date("businessDate", 'YYYY-MM-DD'), 'YYYY-MM-DD') = "businessDate"
    AND ("dueDate" IS NULL OR ("dueDate" ~ '^\d{4}-\d{2}-\d{2}$'
      AND to_char(to_date("dueDate", 'YYYY-MM-DD'), 'YYYY-MM-DD') = "dueDate"))
  ),
  CONSTRAINT "TransportCustomerReconciliation_difference_basis" CHECK (
    "differenceAmount" = 0 OR length(btrim(coalesce("differenceReason", ''))) > 0
      OR length(btrim(coalesce("confirmationReference", ''))) > 0 OR cardinality("evidenceRefs") > 0
  ),
  CONSTRAINT "TransportCustomerReconciliation_actor_not_blank" CHECK (length(btrim("confirmedBy")) > 0)
);

CREATE TABLE "TransportCustomerPayment" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "amount" BIGINT NOT NULL,
  "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'VND',
  "receivedAt" TIMESTAMPTZ(6) NOT NULL,
  "businessDate" VARCHAR(10) NOT NULL,
  "externalRef" TEXT,
  "note" TEXT,
  "recordedBy" TEXT NOT NULL,
  "sourceContext" VARCHAR(60) NOT NULL,
  "sourceId" VARCHAR(160) NOT NULL,
  "sourceFingerprint" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TransportCustomerPayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TransportCustomerPayment_amount_positive" CHECK ("amount" BETWEEN 1 AND 9007199254740991),
  CONSTRAINT "TransportCustomerPayment_currency_shape" CHECK ("currencyCode" ~ '^[A-Z]{3}$'),
  CONSTRAINT "TransportCustomerPayment_business_date_iso" CHECK (
    "businessDate" ~ '^\d{4}-\d{2}-\d{2}$'
    AND to_char(to_date("businessDate", 'YYYY-MM-DD'), 'YYYY-MM-DD') = "businessDate"
  ),
  CONSTRAINT "TransportCustomerPayment_recordedBy_not_blank" CHECK (length(btrim("recordedBy")) > 0)
);

CREATE TABLE "TransportCustomerPaymentAllocation" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "kind" "TransportCustomerPaymentAllocationKind" NOT NULL DEFAULT 'APPLY',
  "amount" BIGINT NOT NULL,
  "businessDate" VARCHAR(10) NOT NULL,
  "reversesId" TEXT,
  "sourceContext" VARCHAR(60) NOT NULL,
  "sourceId" VARCHAR(160) NOT NULL,
  "sourceFingerprint" TEXT NOT NULL,
  "note" TEXT,
  "recordedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TransportCustomerPaymentAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TransportCustomerPaymentAllocation_amount_positive" CHECK ("amount" BETWEEN 1 AND 9007199254740991),
  CONSTRAINT "TransportCustomerPaymentAllocation_date_iso" CHECK (
    "businessDate" ~ '^\d{4}-\d{2}-\d{2}$'
    AND to_char(to_date("businessDate", 'YYYY-MM-DD'), 'YYYY-MM-DD') = "businessDate"
  ),
  CONSTRAINT "TransportCustomerPaymentAllocation_actor_not_blank" CHECK (length(btrim("recordedBy")) > 0),
  CONSTRAINT "TransportCustomerPaymentAllocation_release_shape" CHECK (
    ("kind" = 'APPLY' AND "reversesId" IS NULL) OR ("kind" = 'RELEASE' AND "reversesId" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "TransportCustomerReconciliationBatch_source_key" ON "TransportCustomerReconciliationBatch"("sourceContext", "sourceId");
CREATE INDEX "TransportCustomerReconciliationBatch_customerId_status_idx" ON "TransportCustomerReconciliationBatch"("customerId", "status");
CREATE INDEX "TransportCustomerReconciliationBatch_periodStart_periodEnd_idx" ON "TransportCustomerReconciliationBatch"("periodStart", "periodEnd");
CREATE UNIQUE INDEX "TransportCustomerReconciliationBatchLine_batchId_orderId_key" ON "TransportCustomerReconciliationBatchLine"("batchId", "orderId");
CREATE INDEX "TransportCustomerReconciliationBatchLine_batchId_state_idx" ON "TransportCustomerReconciliationBatchLine"("batchId", "state");
CREATE INDEX "TransportCustomerReconciliationBatchLine_orderId_idx" ON "TransportCustomerReconciliationBatchLine"("orderId");
CREATE UNIQUE INDEX "TransportCustomerReconciliationBatchLine_one_pending_order_key"
  ON "TransportCustomerReconciliationBatchLine"("orderId") WHERE "state" = 'PENDING';
CREATE UNIQUE INDEX "TransportCustomerReconciliation_orderId_key" ON "TransportCustomerReconciliation"("orderId");
CREATE UNIQUE INDEX "TransportCustomerReconciliation_batchLineId_key" ON "TransportCustomerReconciliation"("batchLineId");
CREATE UNIQUE INDEX "TransportCustomerReconciliation_source_key" ON "TransportCustomerReconciliation"("sourceContext", "sourceId");
CREATE UNIQUE INDEX "TransportCustomerReconciliation_settlementDocumentId_key" ON "TransportCustomerReconciliation"("settlementDocumentId");
CREATE INDEX "TransportCustomerReconciliation_customerId_businessDate_idx" ON "TransportCustomerReconciliation"("customerId", "businessDate");
CREATE UNIQUE INDEX "TransportCustomerPayment_source_key" ON "TransportCustomerPayment"("sourceContext", "sourceId");
CREATE INDEX "TransportCustomerPayment_customerId_businessDate_idx" ON "TransportCustomerPayment"("customerId", "businessDate");
CREATE UNIQUE INDEX "TransportCustomerPaymentAllocation_source_key" ON "TransportCustomerPaymentAllocation"("sourceContext", "sourceId");
CREATE UNIQUE INDEX "TransportCustomerPaymentAllocation_reversesId_key" ON "TransportCustomerPaymentAllocation"("reversesId");
CREATE INDEX "TransportCustomerPaymentAllocation_paymentId_idx" ON "TransportCustomerPaymentAllocation"("paymentId");
CREATE INDEX "TransportCustomerPaymentAllocation_documentId_idx" ON "TransportCustomerPaymentAllocation"("documentId");

ALTER TABLE "TransportCustomerReconciliationBatch" ADD CONSTRAINT "TransportCustomerReconciliationBatch_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "TransportCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransportCustomerReconciliationBatchLine" ADD CONSTRAINT "TransportCustomerReconciliationBatchLine_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "TransportCustomerReconciliationBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransportCustomerReconciliationBatchLine" ADD CONSTRAINT "TransportCustomerReconciliationBatchLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TransportOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransportCustomerReconciliation" ADD CONSTRAINT "TransportCustomerReconciliation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TransportOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransportCustomerReconciliation" ADD CONSTRAINT "TransportCustomerReconciliation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "TransportCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransportCustomerReconciliation" ADD CONSTRAINT "TransportCustomerReconciliation_batchLineId_fkey" FOREIGN KEY ("batchLineId") REFERENCES "TransportCustomerReconciliationBatchLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransportCustomerReconciliation" ADD CONSTRAINT "TransportCustomerReconciliation_settlementDocumentId_fkey" FOREIGN KEY ("settlementDocumentId") REFERENCES "TransportSettlementDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransportCustomerPayment" ADD CONSTRAINT "TransportCustomerPayment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "TransportCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransportCustomerPaymentAllocation" ADD CONSTRAINT "TransportCustomerPaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "TransportCustomerPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransportCustomerPaymentAllocation" ADD CONSTRAINT "TransportCustomerPaymentAllocation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "TransportSettlementDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransportCustomerPaymentAllocation" ADD CONSTRAINT "TransportCustomerPaymentAllocation_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "TransportCustomerPaymentAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "transport_customer_ar_append_only"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'transport customer AR history is append-only' USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "transport_customer_reconciliation_append_only" BEFORE UPDATE OR DELETE ON "TransportCustomerReconciliation" FOR EACH ROW EXECUTE FUNCTION "transport_customer_ar_append_only"();
CREATE TRIGGER "transport_customer_payment_append_only" BEFORE UPDATE OR DELETE ON "TransportCustomerPayment" FOR EACH ROW EXECUTE FUNCTION "transport_customer_ar_append_only"();
CREATE TRIGGER "transport_customer_payment_allocation_append_only" BEFORE UPDATE OR DELETE ON "TransportCustomerPaymentAllocation" FOR EACH ROW EXECUTE FUNCTION "transport_customer_ar_append_only"();

CREATE OR REPLACE FUNCTION "transport_customer_ar_period_guard"() RETURNS trigger AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('settlement-period:CUSTOMER_FREIGHT', 0));
  IF EXISTS (
    SELECT 1 FROM "TransportSettlementPeriod"
    WHERE "flow" = 'CUSTOMER_FREIGHT' AND "status" IN ('CLOSING', 'CLOSED')
      AND "startDate" <= NEW."businessDate" AND "endDate" >= NEW."businessDate"
  ) THEN
    RAISE EXCEPTION 'customer AR period is frozen' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "transport_customer_payment_period_guard"
  BEFORE INSERT ON "TransportCustomerPayment"
  FOR EACH ROW EXECUTE FUNCTION "transport_customer_ar_period_guard"();

CREATE OR REPLACE FUNCTION "transport_customer_reconciliation_batch_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'transport customer reconciliation batch history is append-only' USING ERRCODE = '23514';
  END IF;
  IF OLD."customerId" <> NEW."customerId" OR OLD."currencyCode" <> NEW."currencyCode"
    OR OLD."periodStart" IS DISTINCT FROM NEW."periodStart" OR OLD."periodEnd" IS DISTINCT FROM NEW."periodEnd"
    OR OLD."reference" IS DISTINCT FROM NEW."reference" OR OLD."note" IS DISTINCT FROM NEW."note"
    OR OLD."sourceContext" <> NEW."sourceContext" OR OLD."sourceId" <> NEW."sourceId"
    OR OLD."sourceFingerprint" <> NEW."sourceFingerprint" OR OLD."createdBy" <> NEW."createdBy"
    OR OLD."createdAt" <> NEW."createdAt" THEN
    RAISE EXCEPTION 'transport customer reconciliation batch economic fields are immutable' USING ERRCODE = '23514';
  END IF;
  IF NOT (OLD."status" = 'DRAFT' AND NEW."status" IN ('CLOSED', 'CANCELLED')) THEN
    RAISE EXCEPTION 'invalid transport customer reconciliation batch transition' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "transport_customer_reconciliation_batch_guard" BEFORE UPDATE OR DELETE ON "TransportCustomerReconciliationBatch" FOR EACH ROW EXECUTE FUNCTION "transport_customer_reconciliation_batch_guard"();

CREATE OR REPLACE FUNCTION "transport_customer_reconciliation_line_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'transport customer reconciliation batch line history is append-only' USING ERRCODE = '23514';
  END IF;
  IF OLD."batchId" <> NEW."batchId" OR OLD."orderId" <> NEW."orderId" OR OLD."orderCode" <> NEW."orderCode"
    OR OLD."proposedAmount" <> NEW."proposedAmount" OR OLD."currencyCode" <> NEW."currencyCode" OR OLD."createdAt" <> NEW."createdAt" THEN
    RAISE EXCEPTION 'transport customer reconciliation batch line economic fields are immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD."state" <> 'PENDING' OR NEW."state" NOT IN ('CONFIRMED', 'DEFERRED') THEN
    RAISE EXCEPTION 'invalid transport customer reconciliation batch line transition' USING ERRCODE = '23514';
  END IF;
  IF NEW."state" = 'CONFIRMED' AND NOT EXISTS (
    SELECT 1 FROM "TransportCustomerReconciliation" r
    WHERE r."batchLineId" = NEW."id" AND r."orderId" = NEW."orderId"
  ) THEN
    RAISE EXCEPTION 'confirmed batch line requires reconciliation audit' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "transport_customer_reconciliation_line_guard" BEFORE UPDATE OR DELETE ON "TransportCustomerReconciliationBatchLine" FOR EACH ROW EXECUTE FUNCTION "transport_customer_reconciliation_line_guard"();

CREATE OR REPLACE FUNCTION "transport_customer_reconciliation_line_insert_guard"() RETURNS trigger AS $$
DECLARE
  v_batch RECORD;
  v_order RECORD;
BEGIN
  SELECT * INTO v_batch FROM "TransportCustomerReconciliationBatch" WHERE "id" = NEW."batchId" FOR UPDATE;
  SELECT o.*, a."state"::text AS acceptance_state INTO v_order
    FROM "TransportOrder" o
    LEFT JOIN "TransportCommercialAcceptance" a ON a."orderId" = o."id"
    WHERE o."id" = NEW."orderId" FOR UPDATE OF o;
  IF v_batch."id" IS NULL OR v_order."id" IS NULL
    OR v_batch."status" <> 'DRAFT' OR v_order."status" <> 'FULFILLED'
    OR v_order.acceptance_state <> 'APPROVED' OR v_order."customerId" IS NULL
    OR v_order."customerId" <> v_batch."customerId" OR v_order."currencyCode" <> v_batch."currencyCode"
    OR v_order."currencyCode" <> NEW."currencyCode" OR v_order."code" <> NEW."orderCode"
    OR v_order."freightAmount" IS NULL OR v_order."freightAmount" <> NEW."proposedAmount"
    OR EXISTS (SELECT 1 FROM "TransportCustomerReconciliation" r WHERE r."orderId" = NEW."orderId") THEN
    RAISE EXCEPTION 'order is not eligible for reconciliation batch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "transport_customer_reconciliation_line_insert_guard"
  BEFORE INSERT ON "TransportCustomerReconciliationBatchLine"
  FOR EACH ROW EXECUTE FUNCTION "transport_customer_reconciliation_line_insert_guard"();

CREATE OR REPLACE FUNCTION "transport_customer_reconciliation_insert_guard"() RETURNS trigger AS $$
DECLARE
  v_customer_id TEXT;
  v_currency_code TEXT;
  v_order_status TEXT;
  v_acceptance_state TEXT;
  v_line RECORD;
  v_document RECORD;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('settlement-period:CUSTOMER_FREIGHT', 0));
  IF EXISTS (
    SELECT 1 FROM "TransportSettlementPeriod"
    WHERE "flow" = 'CUSTOMER_FREIGHT' AND "status" IN ('CLOSING', 'CLOSED')
      AND "startDate" <= NEW."businessDate" AND "endDate" >= NEW."businessDate"
  ) THEN
    RAISE EXCEPTION 'customer receivable period is frozen' USING ERRCODE = '23514';
  END IF;
  SELECT o."customerId", o."currencyCode", o."status", a."state"::text
    INTO v_customer_id, v_currency_code, v_order_status, v_acceptance_state
    FROM "TransportOrder" o
    LEFT JOIN "TransportCommercialAcceptance" a ON a."orderId" = o."id"
    WHERE o."id" = NEW."orderId" FOR UPDATE OF o;
  IF NOT FOUND OR v_order_status <> 'FULFILLED' OR v_acceptance_state <> 'APPROVED' THEN
    RAISE EXCEPTION 'order is not ready for customer reconciliation' USING ERRCODE = '23514';
  END IF;
  IF v_customer_id IS NULL OR v_customer_id <> NEW."customerId" OR v_currency_code <> NEW."currencyCode" THEN
    RAISE EXCEPTION 'customer reconciliation order identity/currency mismatch' USING ERRCODE = '23514';
  END IF;
  IF (SELECT "freightAmount" FROM "TransportOrder" WHERE "id" = NEW."orderId") <> NEW."proposedAmount" THEN
    RAISE EXCEPTION 'customer reconciliation proposed amount must match order' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_document FROM "TransportSettlementDocument" WHERE "id" = NEW."settlementDocumentId" FOR UPDATE;
  IF NOT FOUND OR v_document."kind" <> 'ORIGINAL' OR v_document."status" <> 'POSTED'
    OR v_document."direction" <> 'RECEIVABLE' OR v_document."flow" <> 'CUSTOMER_FREIGHT'
    OR v_document."counterpartyKind" <> 'CUSTOMER' OR v_document."counterpartyId" <> NEW."customerId"
    OR v_document."currencyCode" <> NEW."currencyCode" OR v_document."signedAmount" <> NEW."confirmedAmount"
    OR v_document."sourceContext" <> 'CUSTOMER_RECONCILIATION' OR v_document."sourceId" <> NEW."orderId" THEN
    RAISE EXCEPTION 'customer reconciliation settlement document mismatch' USING ERRCODE = '23514';
  END IF;
  IF NEW."batchLineId" IS NOT NULL THEN
    SELECT l.*, b."customerId" AS batch_customer, b."currencyCode" AS batch_currency, b."status"::text AS batch_status
      INTO v_line FROM "TransportCustomerReconciliationBatchLine" l
      JOIN "TransportCustomerReconciliationBatch" b ON b."id" = l."batchId"
      WHERE l."id" = NEW."batchLineId" FOR UPDATE OF l, b;
    IF NOT FOUND OR v_line."state" <> 'PENDING' OR v_line."orderId" <> NEW."orderId"
      OR v_line.batch_customer <> NEW."customerId" OR v_line.batch_currency <> NEW."currencyCode" OR v_line.batch_status <> 'DRAFT' THEN
      RAISE EXCEPTION 'invalid customer reconciliation batch line' USING ERRCODE = '23514';
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM "TransportCustomerReconciliationBatchLine"
    WHERE "orderId" = NEW."orderId" AND "state" = 'PENDING'
  ) THEN
    RAISE EXCEPTION 'order has a pending reconciliation batch line' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "transport_customer_reconciliation_insert_guard" BEFORE INSERT ON "TransportCustomerReconciliation" FOR EACH ROW EXECUTE FUNCTION "transport_customer_reconciliation_insert_guard"();

CREATE OR REPLACE FUNCTION "transport_customer_payment_allocation_guard"() RETURNS trigger AS $$
DECLARE
  v_payment RECORD;
  v_document RECORD;
  v_reverse RECORD;
  v_payment_used BIGINT;
  v_document_gross BIGINT;
  v_legacy_allocated BIGINT;
  v_customer_allocated BIGINT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('settlement-period:CUSTOMER_FREIGHT', 0));
  IF EXISTS (
    SELECT 1 FROM "TransportSettlementPeriod"
    WHERE "flow" = 'CUSTOMER_FREIGHT' AND "status" IN ('CLOSING', 'CLOSED')
      AND "startDate" <= NEW."businessDate" AND "endDate" >= NEW."businessDate"
  ) THEN
    RAISE EXCEPTION 'customer AR allocation period is frozen' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_payment FROM "TransportCustomerPayment" WHERE "id" = NEW."paymentId" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'customer payment not found' USING ERRCODE = '23503'; END IF;
  SELECT * INTO v_document FROM "TransportSettlementDocument" WHERE "id" = NEW."documentId" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'customer receivable document not found' USING ERRCODE = '23503'; END IF;
  IF v_document."kind" <> 'ORIGINAL' OR v_document."status" <> 'POSTED' OR v_document."direction" <> 'RECEIVABLE'
    OR v_document."flow" <> 'CUSTOMER_FREIGHT' OR v_document."counterpartyKind" <> 'CUSTOMER' THEN
    RAISE EXCEPTION 'allocation target is not an official customer receivable' USING ERRCODE = '23514';
  END IF;
  IF v_document."counterpartyId" <> v_payment."customerId" THEN
    RAISE EXCEPTION 'customer payment/receivable customer mismatch' USING ERRCODE = '23514';
  END IF;
  IF v_document."currencyCode" <> v_payment."currencyCode" THEN
    RAISE EXCEPTION 'customer payment/receivable currency mismatch' USING ERRCODE = '23514';
  END IF;
  IF NEW."kind" = 'RELEASE' THEN
    SELECT * INTO v_reverse FROM "TransportCustomerPaymentAllocation" WHERE "id" = NEW."reversesId" FOR UPDATE;
    IF NOT FOUND OR v_reverse."kind" <> 'APPLY' OR v_reverse."paymentId" <> NEW."paymentId"
      OR v_reverse."documentId" <> NEW."documentId" OR v_reverse."amount" <> NEW."amount" THEN
      RAISE EXCEPTION 'release must exactly reverse one allocation' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  SELECT coalesce(sum(CASE WHEN "kind" = 'APPLY' THEN "amount" ELSE -"amount" END), 0)
    INTO v_payment_used FROM "TransportCustomerPaymentAllocation" WHERE "paymentId" = NEW."paymentId";
  IF v_payment_used + NEW."amount" > v_payment."amount" THEN
    RAISE EXCEPTION 'customer payment allocation exceeds unallocated balance' USING ERRCODE = '23514';
  END IF;
  SELECT coalesce(sum("signedAmount"), 0) INTO v_document_gross FROM "TransportSettlementDocument"
    WHERE ("id" = NEW."documentId" OR "adjustsId" = NEW."documentId") AND "status" = 'POSTED';
  SELECT coalesce(sum("amount"), 0) INTO v_legacy_allocated FROM "TransportSettlementAllocation" WHERE "documentId" = NEW."documentId";
  SELECT coalesce(sum(CASE WHEN "kind" = 'APPLY' THEN "amount" ELSE -"amount" END), 0)
    INTO v_customer_allocated FROM "TransportCustomerPaymentAllocation" WHERE "documentId" = NEW."documentId";
  IF v_legacy_allocated + v_customer_allocated + NEW."amount" > v_document_gross THEN
    RAISE EXCEPTION 'customer payment allocation exceeds receivable outstanding' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "transport_customer_payment_allocation_guard" BEFORE INSERT ON "TransportCustomerPaymentAllocation" FOR EACH ROW EXECUTE FUNCTION "transport_customer_payment_allocation_guard"();

CREATE OR REPLACE FUNCTION "transport_customer_legacy_allocation_guard"() RETURNS trigger AS $$
DECLARE
  v_document RECORD;
  v_flow TEXT;
  v_gross BIGINT;
  v_allocated BIGINT;
BEGIN
  SELECT "flow"::text INTO v_flow FROM "TransportSettlementDocument" WHERE "id" = NEW."documentId";
  IF NOT FOUND OR v_flow <> 'CUSTOMER_FREIGHT' THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('settlement-period:CUSTOMER_FREIGHT', 0));
  IF EXISTS (
    SELECT 1 FROM "TransportSettlementPeriod"
    WHERE "flow" = 'CUSTOMER_FREIGHT' AND "status" IN ('CLOSING', 'CLOSED')
      AND "startDate" <= NEW."businessDate" AND "endDate" >= NEW."businessDate"
  ) THEN
    RAISE EXCEPTION 'customer receivable allocation period is frozen' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_document FROM "TransportSettlementDocument" WHERE "id" = NEW."documentId" FOR UPDATE;
  IF NOT FOUND OR v_document."flow" <> 'CUSTOMER_FREIGHT' THEN
    RAISE EXCEPTION 'customer receivable allocation target changed' USING ERRCODE = '23514';
  END IF;
  IF v_document."kind" <> 'ORIGINAL' OR v_document."status" <> 'POSTED' THEN
    RAISE EXCEPTION 'allocation target is not an active customer receivable' USING ERRCODE = '23514';
  END IF;
  SELECT coalesce(sum("signedAmount"), 0) INTO v_gross FROM "TransportSettlementDocument"
    WHERE ("id" = NEW."documentId" OR "adjustsId" = NEW."documentId") AND "status" = 'POSTED';
  SELECT
    coalesce((SELECT sum("amount") FROM "TransportSettlementAllocation" WHERE "documentId" = NEW."documentId"), 0)
    + coalesce((SELECT sum(CASE WHEN "kind" = 'APPLY' THEN "amount" ELSE -"amount" END)
        FROM "TransportCustomerPaymentAllocation" WHERE "documentId" = NEW."documentId"), 0)
    INTO v_allocated;
  IF v_allocated + NEW."amount" > v_gross THEN
    RAISE EXCEPTION 'legacy allocation exceeds customer receivable outstanding' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "transport_customer_legacy_allocation_guard"
  BEFORE INSERT ON "TransportSettlementAllocation"
  FOR EACH ROW EXECUTE FUNCTION "transport_customer_legacy_allocation_guard"();

CREATE OR REPLACE FUNCTION "transport_customer_legacy_allocation_append_only"() RETURNS trigger AS $$
DECLARE
  v_document_flow TEXT;
BEGIN
  SELECT "flow"::text INTO v_document_flow
    FROM "TransportSettlementDocument" WHERE "id" = OLD."documentId";
  IF v_document_flow = 'CUSTOMER_FREIGHT' THEN
    RAISE EXCEPTION 'customer receivable allocation history is append-only' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "transport_customer_legacy_allocation_append_only"
  BEFORE UPDATE OR DELETE ON "TransportSettlementAllocation"
  FOR EACH ROW EXECUTE FUNCTION "transport_customer_legacy_allocation_append_only"();

CREATE OR REPLACE FUNCTION "transport_customer_receivable_document_guard"() RETURNS trigger AS $$
DECLARE
  v_gross BIGINT;
  v_allocated BIGINT;
  v_target RECORD;
BEGIN
  IF TG_OP = 'DELETE' AND OLD."flow" = 'CUSTOMER_FREIGHT' THEN
    RAISE EXCEPTION 'customer receivable settlement history is append-only' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD."flow" = 'CUSTOMER_FREIGHT' THEN
    IF (to_jsonb(OLD) - 'status') <> (to_jsonb(NEW) - 'status')
      OR OLD."status" <> 'POSTED' OR NEW."status" <> 'REVERSED' THEN
      RAISE EXCEPTION 'customer receivable settlement history is append-only' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM "TransportSettlementDocument"
      WHERE "adjustsId" = OLD."id" AND "kind" = 'REVERSAL' AND "status" = 'POSTED'
    ) OR (SELECT coalesce(sum("signedAmount"), 0) FROM "TransportSettlementDocument"
      WHERE ("id" = OLD."id" OR "adjustsId" = OLD."id") AND "status" = 'POSTED') <> 0 THEN
      RAISE EXCEPTION 'customer receivable reversal requires a complete reversal audit row' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW."flow" = 'CUSTOMER_FREIGHT' AND NEW."kind" = 'ORIGINAL'
    AND NEW."sourceContext" <> 'CUSTOMER_RECONCILIATION' THEN
    RAISE EXCEPTION 'new customer receivable requires customer reconciliation' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' AND NEW."flow" = 'CUSTOMER_FREIGHT' AND NEW."kind" <> 'ORIGINAL' THEN
    SELECT * INTO v_target FROM "TransportSettlementDocument" WHERE "id" = NEW."adjustsId" FOR UPDATE;
    IF NOT FOUND OR v_target."kind" <> 'ORIGINAL' OR v_target."status" <> 'POSTED' THEN
      RAISE EXCEPTION 'customer receivable correction target must be an active original' USING ERRCODE = '23514';
    END IF;
    SELECT coalesce(sum("signedAmount"), 0) + NEW."signedAmount" INTO v_gross
      FROM "TransportSettlementDocument"
      WHERE ("id" = NEW."adjustsId" OR "adjustsId" = NEW."adjustsId") AND "status" = 'POSTED';
    SELECT
      coalesce((SELECT sum("amount") FROM "TransportSettlementAllocation" WHERE "documentId" = NEW."adjustsId"), 0)
      + coalesce((SELECT sum(CASE WHEN "kind" = 'APPLY' THEN "amount" ELSE -"amount" END)
          FROM "TransportCustomerPaymentAllocation" WHERE "documentId" = NEW."adjustsId"), 0)
      INTO v_allocated;
    IF v_gross < v_allocated THEN
      RAISE EXCEPTION 'customer receivable correction would fall below allocated amount' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "transport_customer_receivable_document_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON "TransportSettlementDocument"
  FOR EACH ROW EXECUTE FUNCTION "transport_customer_receivable_document_guard"();

CREATE OR REPLACE FUNCTION "transport_customer_receivable_requires_reconciliation"() RETURNS trigger AS $$
BEGIN
  IF NEW."flow" = 'CUSTOMER_FREIGHT' AND NEW."kind" = 'ORIGINAL'
    AND NEW."sourceContext" = 'CUSTOMER_RECONCILIATION'
    AND NOT EXISTS (
      SELECT 1 FROM "TransportCustomerReconciliation" r
      WHERE r."settlementDocumentId" = NEW."id" AND r."orderId" = NEW."sourceId"
    ) THEN
    RAISE EXCEPTION 'customer receivable is missing reconciliation audit' USING ERRCODE = '23514';
  END IF;
  IF NEW."flow" = 'CUSTOMER_FREIGHT' AND NEW."kind" = 'REVERSAL'
    AND NOT EXISTS (
      SELECT 1 FROM "TransportSettlementDocument" original
      WHERE original."id" = NEW."adjustsId" AND original."kind" = 'ORIGINAL'
        AND original."status" = 'REVERSED'
    ) THEN
    RAISE EXCEPTION 'customer receivable reversal did not reverse its original' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER "transport_customer_receivable_requires_reconciliation"
  AFTER INSERT ON "TransportSettlementDocument"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION "transport_customer_receivable_requires_reconciliation"();
