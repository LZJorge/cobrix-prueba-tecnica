import { Controller, Get, Inject } from '@nestjs/common';

@Controller('overview')
export class DashboardController {
    constructor(
        @Inject('ICobrixStore') private readonly store: any,
        @Inject('SIMULATOR_URL') private readonly simulatorUrl: string,
    ) {}

    @Get()
    getOverview() {
        const config = this.store.getConfig();
        const { apiPassword, ...publicCfg } = config;

        return {
            summary: this.store.getDashboardSummary(),
            radar: this.store.getOperationalRadar(),
            config: { ...publicCfg, simulatorUrl: this.simulatorUrl },
            recentRuns: this.store.listSyncRuns(6),
        };
    }
}