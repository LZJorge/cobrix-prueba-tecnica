/**
 * Checks the environment handed to the candidate: the API answers as documented, every
 * documented route exists and the panel skeleton serves its screens.
 * 
 * I changed this test to sync with the NestJs stack.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { NestFactory } from '@nestjs/core';
import { CobrixModule } from '../src/cobrix/cobrix.module.ts';
import { SANDBOX_API_USER, seedBillingApi } from '../src/billing-api/seed.ts';
import { createBillingApiServer, type BillingApiServer } from '../src/billing-api/server.ts';

process.env.SANDBOX_TODAY = '2026-10-13';

describe('entorno de la prueba', () => {
    let dir: string;
    let api: BillingApiServer;
    let base: string;
    let nestApp: any;
    let panelBase: string;

    before(async () => {
        dir = mkdtempSync(join(tmpdir(), 'prueba-facturacion-'));
        
        seedBillingApi(join(dir, 'billing-api.sqlite'));
        api = createBillingApiServer(join(dir, 'billing-api.sqlite'));
        base = `http://127.0.0.1:${await api.listen(0)}`;

        process.env.COBRIX_DB = ':memory:';
        process.env.BILLING_API_PORT = new URL(base).port;
        
        nestApp = await NestFactory.create(CobrixModule, { logger: false });
        nestApp.setGlobalPrefix('api/cobrix');
        await nestApp.listen(0);
        
        const address = nestApp.getHttpServer().address();
        panelBase = `http://127.0.0.1:${address.port}`;
    });

    after(async () => {
        await nestApp.close();
        await api.close();
        rmSync(dir, { recursive: true, force: true });
    });

    it('login, lista de contratos y cuotas de un contrato', async () => {
        const login = await (await fetch(`${base}/api/v1/usuario/login`, { 
            method: 'POST', 
            body: JSON.stringify({ user_name: SANDBOX_API_USER.user_name, password: SANDBOX_API_USER.password }),
            headers: { 'Content-Type': 'application/json' }
        })).json() as Record<string, string>;
        
        const auth = { authorization: `Bearer ${login.access_token}` };
        const ids = await (await fetch(`${base}/api/v1/isp/lista_ids_contratos`, { headers: auth })).json() as { data: number[] };
        assert.equal(ids.data.length, 27);
        
        const rows = await (await fetch(`${base}/api/v1/isp/contrato/individual?id_contrato=900101`, { headers: auth })).json() as Array<Record<string, unknown>>;
        assert.ok(rows.length > 0);
        assert.equal(rows[0]!.contrato_id, 900101);
    });

    it('cada ruta documentada en Swagger existe', async () => {
        const spec = await (await fetch(`${base}/openapi.json`)).json() as { paths: Record<string, Record<string, unknown>> };
        for (const [path, methods] of Object.entries(spec.paths)) {
            for (const method of Object.keys(methods)) {
                if (path === '/__sim/reiniciar') continue;
                const response = await fetch(`${base}${path}`, { 
                    method: method.toUpperCase(), 
                    ...(method === 'post' ? { body: '{}', headers: { 'Content-Type': 'application/json' } } : {}) 
                });
                assert.ok(![404, 405].includes(response.status), `${method} ${path}`);
            }
        }
    });

    it('el panel backend de NestJS responde correctamente', async () => {
        const response = await fetch(`${panelBase}/api/cobrix/overview`);
        assert.equal(response.status, 200);
        const body = await response.json() as any;
        
        assert.ok(body.summary);
        assert.ok(body.config);
        assert.equal(body.config.companyName, 'Cobrix Venezuela, C.A.');
    });
});

