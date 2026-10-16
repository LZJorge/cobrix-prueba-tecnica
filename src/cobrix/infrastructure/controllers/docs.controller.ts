import { Controller, Get, Header } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

@Controller('enunciado')
export class DocsController {
    @Get()
    @Header('Content-Type', 'text/html; charset=utf-8')
    getEnunciado() {
        const assignmentPath = resolve(process.cwd(), 'docs/ENUNCIADO.md');
        let text = 'No se encontró docs/ENUNCIADO.md.';
        try {
            text = readFileSync(assignmentPath, 'utf8');
        } catch {
            // Fails silently and returns the fallback text if the file is missing
        }
        return `<pre>${text}</pre>`;
    }
}