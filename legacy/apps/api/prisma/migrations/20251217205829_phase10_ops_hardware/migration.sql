-- CreateTable
CREATE TABLE "BillOfMaterials" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "parentItemId" TEXT NOT NULL,
    "childItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    CONSTRAINT "BillOfMaterials_parentItemId_fkey" FOREIGN KEY ("parentItemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BillOfMaterials_childItemId_fkey" FOREIGN KEY ("childItemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "YardEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trailerNumber" TEXT NOT NULL,
    "carrier" TEXT,
    "status" TEXT NOT NULL,
    "dockLocation" TEXT,
    "checkInTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkOutTime" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "BillOfMaterials_parentItemId_childItemId_key" ON "BillOfMaterials"("parentItemId", "childItemId");
