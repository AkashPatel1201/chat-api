import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule, ObserveInstrument } from './app.module.js';
import { WsAdapter } from '@nestjs/platform-ws';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });

  app.useWebSocketAdapter(new WsAdapter(app as any));

  // Comprehensive CORS configuration supporting localhost, 127.0.0.1, LAN IPs, and FRONTEND_URL
  const configuredFrontendUrls = (process.env.FRONTEND_URL || '')
    .split(',')
    .map((url) => url.trim().replace(/\/$/, ''))
    .filter(Boolean);

  const defaultAllowedOrigins = [
    ...configuredFrontendUrls,
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:3002',
  ];

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server, Postman)
      if (!origin) {
        return callback(null, true);
      }

      const normalizedOrigin = origin.replace(/\/$/, '');

      // Check configured / default origins
      if (defaultAllowedOrigins.includes(normalizedOrigin)) {
        return callback(null, true);
      }

      // Allow any localhost, 127.0.0.1, or private IPv4 address (e.g., 10.x.x.x, 192.168.x.x, 172.16-31.x.x) on any port
      const isLocalOrLan =
        /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalizedOrigin) ||
        /^http:\/\/(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(
          normalizedOrigin,
        );

      if (isLocalOrLan || process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }

      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'Authentication',
      'Access-Control-Allow-Headers',
      'Access-Control-Allow-Origin',
      'Access-Control-Allow-Credentials',
      'sec-websocket-protocol',
      'sec-websocket-key',
      'sec-websocket-version',
      'sec-websocket-extensions',
    ],
    exposedHeaders: ['Authorization'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
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
    .addTag('Channels', 'Workspace channel creation, member management, and channel messages')
    .addTag('Direct Messages', '1-on-1 direct message conversations and history')
    .addTag('Users', 'User directory, profile lookup, and status updates')
    .addTag('Messages', 'Emoji reactions and message deletion')
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