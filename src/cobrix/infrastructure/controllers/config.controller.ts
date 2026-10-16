import { Controller, Get, Put, Post, Body, Inject } from '@nestjs/common';
import { SyncService } from '../../application/use-cases/sync.service.ts';
import { KNOWN_CONTRACT_STATUSES } from '../../domain/entities/domain.ts';

const DOC_TYPES = ['V', 'E', 'J', 'G', 'P'];

@Controller('config')
export class ConfigController {
    constructor(
        @Inject('ICobrixStore') private readonly store: any,
        @Inject('SIMULATOR_URL') private readonly simulatorUrl: string,
        @Inject(SyncService) private readonly syncService: SyncService,
    ) {}

    private toPublicConfig(cfg: any) {
        const { apiPassword, ...rest } = cfg;
        return { ...rest, simulatorUrl: this.simulatorUrl };
    }

    @Get()
    getConfig() {
        return this.toPublicConfig(this.store.getConfig());
    }

    @Put()
    updateConfig(@Body() body: any) {
        const current = this.store.getConfig();

        const allowedStatuses = Array.isArray(body.allowedStatuses)
            ? body.allowedStatuses.map(String).filter((s: string) => KNOWN_CONTRACT_STATUSES.includes(s as any))
            : current.allowedStatuses;

        const excludedDocTypes = Array.isArray(body.excludedDocTypes)
            ? body.excludedDocTypes.map(String).filter((d: string) => DOC_TYPES.includes(d))
            : current.excludedDocTypes;

        const windowMonths = [3, 6, 9, 12].includes(Number(body.windowMonths)) ? Number(body.windowMonths) : null;

        const maxRecentNum = Number(body.maxRecentInstallments);
        const maxRecentInstallments =
            body.maxRecentInstallments !== null &&
            body.maxRecentInstallments !== '' &&
            Number.isInteger(maxRecentNum) &&
            maxRecentNum >= 1 &&
            maxRecentNum <= 60
                ? maxRecentNum
                : null;

        const graceNum = Number(body.graceDays);
        const graceDays = Number.isInteger(graceNum) ? Math.min(60, Math.max(0, graceNum)) : current.graceDays;

        const maxInvNum = Number(body.maxNewInvoices);
        const maxNewInvoices =
            body.maxNewInvoices !== null && body.maxNewInvoices !== '' && Number.isInteger(maxInvNum) && maxInvNum > 0
                ? maxInvNum
                : null;

        const maxAmountNum = Number(body.maxNewAmountCents);
        const maxNewAmountCents =
            body.maxNewAmountCents !== null && body.maxNewAmountCents !== '' && Number.isFinite(maxAmountNum) && maxAmountNum > 0
                ? Math.round(maxAmountNum)
                : null;

        const updated = this.store.updateConfig({
            companyName: typeof body.companyName === 'string' && body.companyName.trim() ? body.companyName.trim() : current.companyName,
            companyRif: typeof body.companyRif === 'string' && body.companyRif.trim() ? body.companyRif.trim() : current.companyRif,
            companyEmail: typeof body.companyEmail === 'string' && body.companyEmail.trim() ? body.companyEmail.trim() : current.companyEmail,
            apiUrl: typeof body.apiUrl === 'string' && body.apiUrl.trim() ? body.apiUrl.trim() : current.apiUrl,
            apiUser: typeof body.apiUser === 'string' && body.apiUser.trim() ? body.apiUser.trim() : current.apiUser,
            apiPassword: typeof body.apiPassword === 'string' ? body.apiPassword : '',
            allowedStatuses: allowedStatuses.length > 0 ? allowedStatuses : ['ACTIVO', 'CORTADO'],
            excludedDocTypes,
            windowMonths,
            maxRecentInstallments,
            graceDays,
            maxNewInvoices,
            maxNewAmountCents,
            autoRunEnabled: Boolean(body.autoRunEnabled),
            autoRunTime: typeof body.autoRunTime === 'string' && /^\d{2}:\d{2}$/.test(body.autoRunTime) ? body.autoRunTime : current.autoRunTime,
        });

        return this.toPublicConfig(updated);
    }

    @Post('test-connection')
    async testConnection(@Body() body: any) {
        return this.syncService.testConnection({
            apiUrl: typeof body.apiUrl === 'string' ? body.apiUrl : undefined,
            apiUser: typeof body.apiUser === 'string' ? body.apiUser : undefined,
            apiPassword: typeof body.apiPassword === 'string' ? body.apiPassword : undefined,
        });
    }
}