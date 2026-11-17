import fastifyStatic from '@fastify/static';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { join } from 'node:path';
import { AppModule } from './server/app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());

  await app.register(fastifyStatic, {
    root: join(__dirname, '../client/static'),
    prefix: '/static/',
    setHeaders(response, path) {
      if (path.endsWith('service-worker.js')) {
        response.header('Service-Worker-Allowed', '/');
        response.header('Cache-Control', 'no-cache');
      }
    },
  });

  await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
}

bootstrap().catch((error: unknown) => {
  console.error('Failed to start Shopping List', error);
  process.exitCode = 1;
});
