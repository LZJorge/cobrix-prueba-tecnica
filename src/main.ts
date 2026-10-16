import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';

process.env.SANDBOX_TODAY ??= '2026-10-13';

const { DEFAULT_BILLING_API_DB, seedBillingApi } = await import('./billing-api/seed.ts');
const { createBillingApiServer } = await import('./billing-api/server.ts');
const { CobrixModule } = await import('./cobrix/cobrix.module.ts');

const billingApiDb = process.env.BILLING_API_DB ?? DEFAULT_BILLING_API_DB;
const appPort = Number(process.env.PORT ?? 4300);
const billingApiPort = Number(process.env.BILLING_API_PORT ?? 4310);
const host = process.env.HOST ?? '127.0.0.1';

if (!existsSync(billingApiDb)) seedBillingApi(billingApiDb);

const billingApi = createBillingApiServer(billingApiDb);
await billingApi.listen(billingApiPort, host);
const simulatorUrl = `http://${host}:${billingApiPort}`;

const app = await NestFactory.create(CobrixModule);

app.enableCors();
app.setGlobalPrefix('api/cobrix');

await app.listen(appPort, host);

console.log(`Panel Cobrix:             http://${host}:${appPort}`);
console.log(`API del administrador:    ${simulatorUrl}/api/v1`);
console.log(`Swagger:                  ${simulatorUrl}/docs`);
console.log(`Fecha de la prueba:       ${process.env.SANDBOX_TODAY}`);

const shutdown = async (): Promise<void> => {
    await app.close();
    await billingApi.close();
    process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);