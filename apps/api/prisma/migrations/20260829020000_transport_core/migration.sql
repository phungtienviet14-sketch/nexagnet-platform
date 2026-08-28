-- CreateEnum
CREATE TYPE "TransportVehicleStatus" AS ENUM ('IDLE', 'ON_TRIP', 'UNDER_MAINTENANCE');

-- CreateEnum
CREATE TYPE "TransportDriverStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "TransportPartyStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "TransportPartnerRoleKind" AS ENUM ('CARRIER', 'ORDER_REFERRER');

-- CreateEnum
CREATE TYPE "TransportTripKind" AS ENUM ('OWN_DIRECT', 'EXTERNAL_CARRIER', 'PARTNER_REFERRED_INTERNAL_RUN');

-- CreateEnum
CREATE TYPE "TransportTripStatus" AS ENUM ('PLANNED', 'IN_TRANSIT', 'DELIVERED', 'RECONCILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "TransportVehicle" (
    "id" TEXT NOT NULL,
    "registrationPlate" TEXT NOT NULL,
    "vehicleClass" TEXT NOT NULL,
    "allowedPayloadKg" INTEGER,
    "currentOdoKm" INTEGER NOT NULL DEFAULT 0,
    "status" "TransportVehicleStatus" NOT NULL DEFAULT 'IDLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportDriver" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "licenceClass" TEXT NOT NULL,
    "licenceExpiry" VARCHAR(10) NOT NULL,
    "status" "TransportDriverStatus" NOT NULL DEFAULT 'ACTIVE',
    "authUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportDriver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportVehicleAssignment" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportVehicleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportCustomer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "address" TEXT,
    "taxCode" TEXT,
    "status" "TransportPartyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportPartner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "status" "TransportPartyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransportPartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportPartnerRole" (
    "partnerId" TEXT NOT NULL,
    "role" "TransportPartnerRoleKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportPartnerRole_pkey" PRIMARY KEY ("partnerId","role")
);

-- CreateTable
CREATE TABLE "TransportTrip" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "TransportTripKind" NOT NULL,
    "status" "TransportTripStatus" NOT NULL DEFAULT 'PLANNED',
    "businessDate" VARCHAR(10) NOT NULL,
    "originLabel" TEXT NOT NULL,
    "destinationLabel" TEXT NOT NULL,
    "cargoDescription" TEXT,
    "customerId" TEXT,
    "carrierPartnerId" TEXT,
    "referrerPartnerId" TEXT,
    "freightAmount" INTEGER,
    "currencyCode" VARCHAR(3) NOT NULL DEFAULT 'VND',
    "distanceKm" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,

    CONSTRAINT "TransportTrip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransportTripAssignment" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "driverId" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "assignedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportTripAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransportVehicle_registrationPlate_key" ON "TransportVehicle"("registrationPlate");

-- CreateIndex
CREATE INDEX "TransportVehicle_status_idx" ON "TransportVehicle"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TransportDriver_authUserId_key" ON "TransportDriver"("authUserId");

-- CreateIndex
CREATE INDEX "TransportDriver_status_idx" ON "TransportDriver"("status");

-- CreateIndex
CREATE INDEX "TransportDriver_licenceExpiry_idx" ON "TransportDriver"("licenceExpiry");

-- CreateIndex
CREATE INDEX "TransportVehicleAssignment_vehicleId_effectiveTo_idx" ON "TransportVehicleAssignment"("vehicleId", "effectiveTo");

-- CreateIndex
CREATE INDEX "TransportVehicleAssignment_driverId_idx" ON "TransportVehicleAssignment"("driverId");

-- CreateIndex
CREATE INDEX "TransportCustomer_status_idx" ON "TransportCustomer"("status");

-- CreateIndex
CREATE INDEX "TransportPartner_status_idx" ON "TransportPartner"("status");

-- CreateIndex
CREATE INDEX "TransportPartnerRole_role_idx" ON "TransportPartnerRole"("role");

-- CreateIndex
CREATE UNIQUE INDEX "TransportTrip_code_key" ON "TransportTrip"("code");

-- CreateIndex
CREATE INDEX "TransportTrip_status_idx" ON "TransportTrip"("status");

-- CreateIndex
CREATE INDEX "TransportTrip_businessDate_idx" ON "TransportTrip"("businessDate");

-- CreateIndex
CREATE INDEX "TransportTrip_kind_idx" ON "TransportTrip"("kind");

-- CreateIndex
CREATE INDEX "TransportTripAssignment_tripId_effectiveTo_idx" ON "TransportTripAssignment"("tripId", "effectiveTo");

-- CreateIndex
CREATE INDEX "TransportTripAssignment_driverId_idx" ON "TransportTripAssignment"("driverId");

-- CreateIndex
CREATE INDEX "TransportTripAssignment_vehicleId_idx" ON "TransportTripAssignment"("vehicleId");

-- AddForeignKey
ALTER TABLE "TransportVehicleAssignment" ADD CONSTRAINT "TransportVehicleAssignment_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "TransportVehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportVehicleAssignment" ADD CONSTRAINT "TransportVehicleAssignment_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "TransportDriver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportPartnerRole" ADD CONSTRAINT "TransportPartnerRole_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "TransportPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTrip" ADD CONSTRAINT "TransportTrip_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "TransportCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTrip" ADD CONSTRAINT "TransportTrip_carrierPartnerId_fkey" FOREIGN KEY ("carrierPartnerId") REFERENCES "TransportPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTrip" ADD CONSTRAINT "TransportTrip_referrerPartnerId_fkey" FOREIGN KEY ("referrerPartnerId") REFERENCES "TransportPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTripAssignment" ADD CONSTRAINT "TransportTripAssignment_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "TransportTrip"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTripAssignment" ADD CONSTRAINT "TransportTripAssignment_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "TransportVehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransportTripAssignment" ADD CONSTRAINT "TransportTripAssignment_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "TransportDriver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

