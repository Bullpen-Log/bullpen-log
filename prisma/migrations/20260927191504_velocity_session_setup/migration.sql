-- AlterTable
ALTER TABLE "VelocitySession" ADD COLUMN     "cameraPos" TEXT NOT NULL DEFAULT 'behind-pitcher',
ADD COLUMN     "mode" TEXT NOT NULL DEFAULT 'pitch',
ADD COLUMN     "net" BOOLEAN NOT NULL DEFAULT true;

