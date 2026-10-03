import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);
  private readonly pool: InstanceType<typeof pg.Pool>;

  constructor() {
    const connectionString =
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5432/chat_db?schema=public';

    // Cloud-hosted PostgreSQL (Render, Neon, Supabase, AWS, etc.) requires SSL/TLS
    const requiresSsl =
      connectionString.includes('render.com') ||
      connectionString.includes('sslmode=require') ||
      connectionString.includes('aws') ||
      connectionString.includes('neon') ||
      connectionString.includes('supabase') ||
      connectionString.includes('aivencloud');

    const pool = new pg.Pool({
      connectionString,
      ssl: requiresSsl ? { rejectUnauthorized: false } : undefined,
    });

    const adapter = new PrismaPg(pool);
    super({ adapter });
    this.pool = pool;
  }

  async onModuleInit() {
    try {
      await this.$connect();
      // Verify active query execution to ensure connection is healthy
      await this.$queryRaw`SELECT 1`;
      this.logger.log('Prisma 7 successfully connected to PostgreSQL with SSL');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `PostgreSQL database connection could not be established on startup: ${message}. Check DATABASE_URL in .env`,
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
    this.logger.log('Prisma disconnected from PostgreSQL');
  }
}
