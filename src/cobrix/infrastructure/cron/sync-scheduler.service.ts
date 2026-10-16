import { 
    Injectable, 
    Inject, 
    type OnApplicationBootstrap, 
    type OnApplicationShutdown 
} from '@nestjs/common';
import { SyncService } from '../../application/use-cases/sync.service.ts';

@Injectable()
export class SyncSchedulerService implements OnApplicationBootstrap, OnApplicationShutdown {
    private timer: ReturnType<typeof setInterval> | null = null;
    private lastTriggeredDate: string | null = null;
    private running = false;

    constructor(
        @Inject('ICobrixStore') private readonly store: any,
        @Inject(SyncService) private readonly syncService: SyncService,
    ) {}

    onApplicationBootstrap(): void {
        this.start(30_000);
    }

    onApplicationShutdown(): void {
        this.stop();
    }

    start(intervalMs = 30_000): void {
        if (this.timer) return;
        this.timer = setInterval(() => {
            void this.tick();
        }, intervalMs);
        this.timer.unref();
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    async tick(now = new Date()): Promise<boolean> {
        if (this.running) return false;
        const cfg = this.store.getConfig();
        if (!cfg.autoRunEnabled) return false;

        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Caracas',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hour12: false,
        });
        const parts = formatter.formatToParts(now);
        const getPart = (type: string) => parts.find(p => p.type === type)?.value ?? '';
        
        const caracasDate = `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
        const caracasTime = `${getPart('hour')}:${getPart('minute')}`;

        if (caracasTime === cfg.autoRunTime && this.lastTriggeredDate !== caracasDate) {
            this.running = true;
            this.lastTriggeredDate = caracasDate;
            try {
                await this.syncService.runImport({ dryRun: false });
                await this.syncService.runUpdatePaid({ dryRun: false });
                return true;
            } finally {
                this.running = false;
            }
        }
        return false;
    }
}