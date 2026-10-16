import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { resolve } from 'node:path';

import { SyncController } from './infrastructure/controllers/sync.controller.ts';
import { DashboardController } from './infrastructure/controllers/dashboard.controller.ts';
import { CustomersController } from './infrastructure/controllers/customers.controller.ts';
import { ConfigController } from './infrastructure/controllers/config.controller.ts';
import { DocsController } from './infrastructure/controllers/docs.controller.ts';

import { SyncService } from './application/use-cases/sync.service.ts';
import { SyncSchedulerService } from './infrastructure/cron/sync-scheduler.service.ts';
import { SqliteStoreService } from './infrastructure/persistence/sqlite/sqlite-store.service.ts';
import { IspApiService } from './infrastructure/api-client/isp-api.service.ts';

const host = process.env.HOST ?? '127.0.0.1';
const billingApiPort = Number(process.env.BILLING_API_PORT ?? 4310);
const simulatorUrl = `http://${host}:${billingApiPort}`;
const cobrixDb = process.env.COBRIX_DB ?? resolve(process.cwd(), 'data/cobrix.sqlite');

@Module({
    imports: [
        ServeStaticModule.forRoot({
            rootPath: resolve(process.cwd(), 'dist/web'),
            exclude: ['/api/{*splat}'],
        }),
    ],
    controllers: [
        SyncController,
        DashboardController,
        CustomersController,
        ConfigController,
        DocsController
    ],
    providers: [
        SyncService,
        SyncSchedulerService,
        {
            provide: 'DB_PATH',
            useValue: cobrixDb,
        },
        {
            provide: 'SIMULATOR_URL',
            useValue: simulatorUrl,
        },
        {
            provide: 'ICobrixStore',
            useClass: SqliteStoreService,
        },
        {
            provide: 'IIspApiClient',
            useClass: IspApiService,
        }
    ],
})
export class CobrixModule {}