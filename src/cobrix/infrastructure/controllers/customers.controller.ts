import { Controller, Get, Param, Query, NotFoundException, Inject, Header } from '@nestjs/common';

@Controller('customers')
export class CustomersController {
    constructor(@Inject('ICobrixStore') private readonly store: any) {}

    @Get()
    getCustomers(@Query('q') q?: string) {
        return { customers: this.store.listCustomers(q ?? '') };
    }

    @Get('.csv')
    @Header('Content-Type', 'text/csv; charset=utf-8')
    @Header('Content-Disposition', 'attachment; filename="clientes-cobrix.csv"')
    getCustomersCsv(@Query('q') q?: string) {
        const list = this.store.listCustomers(q ?? '');
        const header = 'Documento,Nombre,Tipo,Contratos,Facturas_Abiertas,Facturas_Pagadas,Deuda_USD,Vencimiento_Mas_Antiguo\n';
        const rows = list
            .map((c: any) =>
                [
                    c.id,
                    `"${c.name.replaceAll('"', '""')}"`,
                    c.personType,
                    c.contractsCount,
                    c.openInvoicesCount,
                    c.paidInvoicesCount,
                    (c.debtCents / 100).toFixed(2),
                    c.oldestDueDate ?? '',
                ].join(','),
            )
            .join('\n');

        return header + rows;
    }

    @Get(':id')
    getCustomerDossier(@Param('id') id: string) {
        const dossier = this.store.getCustomerDossier(id);
        if (!dossier) throw new NotFoundException('Cliente no encontrado');
        return dossier;
    }
}