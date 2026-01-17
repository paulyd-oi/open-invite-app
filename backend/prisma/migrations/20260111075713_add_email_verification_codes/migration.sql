-- CreateTable
CREATE TABLE "email_verification_code" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_code_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_verification_code_email_idx" ON "email_verification_code"("email");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_code_email_code_key" ON "email_verification_code"("email", "code");
