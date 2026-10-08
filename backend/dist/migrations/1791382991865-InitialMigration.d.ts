import { MigrationInterface, QueryRunner } from "typeorm";
export declare class InitialMigration1791382991865 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
