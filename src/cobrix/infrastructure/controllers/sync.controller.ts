import { Controller, Get, Post, Param, Body, NotFoundException, Inject } from '@nestjs/common';
import { SyncService } from '../../application/use-cases/sync.service.ts';

@Controller()
export class SyncController {
    constructor(
        @Inject('ICobrixStore') private readonly store: any,
        @Inject(SyncService) private readonly syncService: SyncService,
    ) {}

    @Get('runs')
    getRuns() {
        return { runs: this.store.listSyncRuns(40) };
    }

    @Get('runs/:id')
    getRunDetail(@Param('id') id: string) {
        const record = this.store.getSyncRun(Number(id));
        if (!record) throw new NotFoundException('Corrida no encontrada');
        return record;
    }

    @Post('sync/import')
    async runImport(@Body('dryRun') dryRun: boolean) {
        const run = await this.syncService.runImport({ dryRun: Boolean(dryRun) });
        return { run };
    }

    @Post('sync/update-paid')
    async runUpdatePaid(@Body('dryRun') dryRun: boolean) {
        const run = await this.syncService.runUpdatePaid({ dryRun: Boolean(dryRun) });
        return { run };
    }
}