-- Store the visitor's country (ISO 3166-1 alpha-2) captured at last login, for admin display.
ALTER TABLE "User" ADD COLUMN "lastLoginCountry" TEXT;
