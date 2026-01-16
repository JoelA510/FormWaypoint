-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "header" TEXT,
    "lines" TEXT,
    "checksums" TEXT,
    "references" TEXT,
    "meta" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT,
    CONSTRAINT "Document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Document" ("checksums", "createdAt", "error", "filename", "header", "id", "lines", "meta", "references", "status", "updatedAt") SELECT "checksums", "createdAt", "error", "filename", "header", "id", "lines", "meta", "references", "status", "updatedAt" FROM "Document";
DROP TABLE "Document";
ALTER TABLE "new_Document" RENAME TO "Document";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
