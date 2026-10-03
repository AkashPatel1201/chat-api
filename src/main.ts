import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule, ObserveInstrument } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });

  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Configure Swagger OpenAPI documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Chat API')
    .setDescription(
      'High-performance Chat API with Multi-SSO (Google, GitHub, Microsoft, OIDC) & PostgreSQL (Prisma 7)',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter your JWT Bearer token',
        in: 'header',
      },
      'JWT',
    )
    .addTag('Authentication & Multi-SSO', 'Multi-provider SSO and token management')
    .build();

  // Note: Cast `app as any` to avoid pnpm peer-dependency virtual store type mismatch with INestApplication
  const document = SwaggerModule.createDocument(app as any, swaggerConfig);
  SwaggerModule.setup('api/docs', app as any, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
    customSiteTitle: 'Chat API Docs',
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`🚀 Chat API running on: http://localhost:${port}`);
  console.log(
    `📖 Swagger API documentation available at: http://localhost:${port}/api/docs`,
  );
}
await bootstrap();