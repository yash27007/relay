-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CredentialType" ADD VALUE 'DEEPSEEK';
ALTER TYPE "CredentialType" ADD VALUE 'MISTRAL';
ALTER TYPE "CredentialType" ADD VALUE 'MOONSHOT';
ALTER TYPE "CredentialType" ADD VALUE 'OLLAMA';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NodeType" ADD VALUE 'DEEPSEEK';
ALTER TYPE "NodeType" ADD VALUE 'MISTRAL';
ALTER TYPE "NodeType" ADD VALUE 'MOONSHOT';
ALTER TYPE "NodeType" ADD VALUE 'OLLAMA';

-- AlterTable
ALTER TABLE "credential" ADD COLUMN     "config" JSONB,
ALTER COLUMN "value" DROP NOT NULL;
