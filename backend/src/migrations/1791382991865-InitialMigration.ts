import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialMigration1791382991865 implements MigrationInterface {
    name = 'InitialMigration1791382991865'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "auto_bids" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "maxAmount" integer NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "auctionId" uuid NOT NULL, "bidderId" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_cffbc8d9c5b813af93ccabfb49e" UNIQUE ("auctionId", "bidderId"), CONSTRAINT "PK_061d5ba96ec38593a90b9e64cf7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "name" character varying NOT NULL, "password" character varying NOT NULL, "role" character varying NOT NULL DEFAULT 'bidder', "isActive" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "bids" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "amount" integer NOT NULL, "type" character varying NOT NULL DEFAULT 'MANUAL', "auctionId" uuid NOT NULL, "bidderId" uuid NOT NULL, "bidderName" character varying NOT NULL, "idempotencyKey" character varying, "placedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_7950d066d322aab3a488ac39fe5" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "eventType" character varying NOT NULL, "auctionId" uuid, "actorId" character varying, "actorName" character varying, "metadata" json, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "auctions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying NOT NULL, "description" text NOT NULL, "startingPrice" integer NOT NULL, "reservePrice" integer, "currentPrice" integer NOT NULL, "startTime" TIMESTAMP NOT NULL, "endTime" TIMESTAMP NOT NULL, "minimumBidIncrement" integer NOT NULL DEFAULT '500', "antiSnipingDuration" integer NOT NULL DEFAULT '120', "extensionDuration" integer NOT NULL DEFAULT '120', "maxExtensions" integer NOT NULL DEFAULT '3', "extensionCount" integer NOT NULL DEFAULT '0', "status" character varying NOT NULL DEFAULT 'DRAFT', "winnerId" character varying, "winnerName" character varying, "winningBidAmount" integer, "createdById" character varying, "leadingBidderId" character varying, "leadingBidderName" character varying, "isClosing" boolean NOT NULL DEFAULT false, "version" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_87d2b34d4829f0519a5c5570368" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "auto_bids" ADD CONSTRAINT "FK_392a904034d22f220af762898d8" FOREIGN KEY ("auctionId") REFERENCES "auctions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "auto_bids" ADD CONSTRAINT "FK_f27655947d2725886013ab47f0f" FOREIGN KEY ("bidderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "bids" ADD CONSTRAINT "FK_6d6b20987ed2f61e8801398f8d1" FOREIGN KEY ("auctionId") REFERENCES "auctions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "bids" ADD CONSTRAINT "FK_fe34abd3aeb153efaea7a03c676" FOREIGN KEY ("bidderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ADD CONSTRAINT "FK_509e700be3073d175317114d6e4" FOREIGN KEY ("auctionId") REFERENCES "auctions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "audit_logs" DROP CONSTRAINT "FK_509e700be3073d175317114d6e4"`);
        await queryRunner.query(`ALTER TABLE "bids" DROP CONSTRAINT "FK_fe34abd3aeb153efaea7a03c676"`);
        await queryRunner.query(`ALTER TABLE "bids" DROP CONSTRAINT "FK_6d6b20987ed2f61e8801398f8d1"`);
        await queryRunner.query(`ALTER TABLE "auto_bids" DROP CONSTRAINT "FK_f27655947d2725886013ab47f0f"`);
        await queryRunner.query(`ALTER TABLE "auto_bids" DROP CONSTRAINT "FK_392a904034d22f220af762898d8"`);
        await queryRunner.query(`DROP TABLE "auctions"`);
        await queryRunner.query(`DROP TABLE "audit_logs"`);
        await queryRunner.query(`DROP TABLE "bids"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TABLE "auto_bids"`);
    }

}
