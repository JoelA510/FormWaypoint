-- CreateTable
CREATE TABLE "HtsCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "HtsCode_code_key" ON "HtsCode"("code");
