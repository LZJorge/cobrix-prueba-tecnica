import { Injectable } from '@nestjs/common';
import { addMonths, currentPeriod } from '../../../shared/dates.ts';
import { IspApiException } from '../../domain/exceptions/isp-api.exception.ts';
import type { LedgerRow, RawContractInstallmentRow } from '../../domain/entities/domain.ts';

export interface IspApiCredentials {
    readonly baseUrl: string;
    readonly user: string;
    readonly password: string;
}

@Injectable()
export class IspApiService {
    private baseUrl = '';
    private user = '';
    private password = '';
    private token: string | null = null;
    private tokenExpiresAtMs = 0;

    configure(creds: IspApiCredentials): void {
        this.baseUrl = creds.baseUrl.replace(/\/+$/, '');
        this.user = creds.user.trim();
        this.password = creds.password;
        this.token = null;
        this.tokenExpiresAtMs = 0;
    }

    async login(): Promise<string> {
        const bodyPayload = this.user.includes('@')
            ? { email: this.user, password: this.password }
            : { user_name: this.user, password: this.password };

        let response: Response;
        try {
            response = await fetch(`${this.baseUrl}/api/v1/usuario/login`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(bodyPayload),
            });
        } catch (error) {
            throw new IspApiException(
                `Network failure connecting to ${this.baseUrl}: ${error instanceof Error ? error.message : String(error)}`,
                0,
            );
        }

        const data = (await this.safeJson(response)) as Record<string, unknown>;
        if (!response.ok || typeof data.access_token !== 'string') {
            const detail = (data.detail as Record<string, unknown> | undefined)?.mensaje;
            throw new IspApiException(
                typeof detail === 'string' ? detail : `Authentication failed (HTTP ${response.status})`,
                response.status,
                data,
            );
        }

        this.token = data.access_token;
        // The API returns `access_token_expires_in` as naive UTC without a trailing 'Z'.
        const rawExp = typeof data.access_token_expires_in === 'string' ? data.access_token_expires_in : '';
        const parsedExp = rawExp ? Date.parse(rawExp.endsWith('Z') ? rawExp : `${rawExp}Z`) : NaN;
        this.tokenExpiresAtMs = Number.isFinite(parsedExp) ? parsedExp - 30_000 : Date.now() + 7_100_000;

        return this.token;
    }

    private async getValidToken(forceRefresh = false): Promise<string> {
        if (!forceRefresh && this.token && Date.now() < this.tokenExpiresAtMs) {
            return this.token;
        }
        return this.login();
    }

    private async requestJson(pathWithQuery: string, retryOn401 = true): Promise<unknown> {
        const token = await this.getValidToken(false);
        let response: Response;
        try {
            response = await fetch(`${this.baseUrl}${pathWithQuery}`, {
                method: 'GET',
                headers: { authorization: `Bearer ${token}` },
            });
        } catch (error) {
            throw new IspApiException(
                `Network failure querying ${pathWithQuery}: ${error instanceof Error ? error.message : String(error)}`,
                0,
            );
        }

        if (response.status === 401 && retryOn401) {
            await this.getValidToken(true);
            return this.requestJson(pathWithQuery, false);
        }

        const data = await this.safeJson(response);
        if (!response.ok) {
            const detail = ((data as Record<string, unknown> | null)?.detail as Record<string, unknown> | undefined)?.mensaje;
            throw new IspApiException(
                typeof detail === 'string' ? detail : `Unexpected API response (HTTP ${response.status})`,
                response.status,
                data,
            );
        }
        return data;
    }

    private async safeJson(response: Response): Promise<unknown> {
        const text = await response.text();
        if (!text) return {};
        try {
            return JSON.parse(text);
        } catch {
            throw new IspApiException(`API returned invalid JSON (HTTP ${response.status})`, response.status, text);
        }
    }

    /**
     * Never passes `estado` in the query string because any value restricts the API to active contracts only.
     */
    async listContractIds(): Promise<number[]> {
        const body = (await this.requestJson('/api/v1/isp/lista_ids_contratos')) as Record<string, unknown>;
        if (!body || !Array.isArray(body.data)) {
            throw new IspApiException('Invalid format in lista_ids_contratos: missing data array', 502, body);
        }
        const ids: number[] = [];
        for (const item of body.data) {
            if (typeof item !== 'number' || !Number.isInteger(item)) {
                throw new IspApiException(`Invalid contract ID in lista_ids_contratos: ${String(item)}`, 502, body);
            }
            ids.push(item);
        }
        return ids;
    }

    async getContractInstallments(contractId: number): Promise<RawContractInstallmentRow[]> {
        const body = await this.requestJson(`/api/v1/isp/contrato/individual?id_contrato=${contractId}`);
        if (!Array.isArray(body)) {
            throw new IspApiException(`Invalid format in contrato/individual for contract ${contractId}`, 502, body);
        }
        return body as RawContractInstallmentRow[];
    }

    /**
     * Ignores `body.success` because `pago_informacion` always returns `success: false` even with valid rows.
     * Passes a wide explicit date range so no installment is hidden by the API's static default window.
     */
    async getContractPaymentLedger(
        contractId: number,
        fromDate = '2020-01-01',
        toDate = `${addMonths(currentPeriod(), 12)}-31`,
    ): Promise<LedgerRow[]> {
        const query = new URLSearchParams({
            id_contrato: String(contractId),
            tipo_busqueda: 'CUOTA',
            fecha_inicio: fromDate,
            fecha_fin: toDate,
        });
        const body = (await this.requestJson(`/api/v1/isp/pago_informacion?${query.toString()}`)) as Record<string, unknown>;
        if (!body || !Array.isArray(body.data)) {
            throw new IspApiException(`Invalid format in pago_informacion for contract ${contractId}`, 502, body);
        }
        return body.data as LedgerRow[];
    }
}