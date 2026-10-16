# Cobrix

*Postulante:* Jorge Landaeta

Esta es mi propuesta de implementación para la integración entre Cobrix y la API de administración de facturas de los ISP.

El objetivo principal de esta entrega no fue solo cumplir con los criterios de aceptación, sino estructurar el proyecto con un estándar de escalabilidad y mantenibilidad que me gusta manejar en proyectos personales.

## Cómo levantar el proyecto

El proyecto utiliza Node.js 24, en mi caso utilice `pnpm` (pero pueden usar `npm`) y `tsx` para la ejecución de TypeScript junto a NestJs.

**Instalar dependencias:**
```Bash
pnpm install
```

**Levantar la aplicación (API Simulada + NestJS + Frontend):**
```Bash
pnpm start
```

**Ejecutar la suite de pruebas:**
```Bash
pnpm run test
```

## Nota de Decisiones

### Base del proyecto en backend
Aunque el esqueleto base proporcionado utilizaba Node.js vanilla, decidí refactorizar el backend para utilizar NestJS implementando principios de Arquitectura Hexagonal.

Revisando los requisitos de la vacante, noté que NestJS es parte de su stack. Decidí implementarlo para entregar un proyecto altamente cohesivo, modular y testeable; reduciendo así el tiempo teórico de onboarding al stack real de la empresa. Considero esta estructura como mi punto diferencial, ya que prioriza la mantenibilidad a largo plazo.

Nota técnica: No utilicé un modelo purista al 100%. Para optimizar los tiempos de entrega de la prueba, permití un acoplamiento controlado donde ciertos datos de la API simulada interactúan directamente con la capa de domain, evitando así la duplicación excesiva de código en mapeadores intermedios. Fue un trade-off intencional.

### Frontend
Para cumplir con el requerimiento de levantar todo el ecosistema con un solo comando, configuré el módulo `@nestjs/serve-static` para que el mismo backend entregue la SPA de React. Sin embargo, para un entorno de producción real, esta no sería la arquitectura ideal. El frontend estático debería desplegarse en un CDN dejando a NestJS operar exclusivamente como una API REST unicamente.

Dado que mi perfil y experiencia están fuertemente orientados al desarrollo backend y arquitectura de sistemas, para la UI prioricé la funcionalidad, la claridad y el cumplimiento de las reglas de negocio, basándome estrictamente en el layout y jerarquía visual de las capturas de referencia proporcionadas.

### Factor diferencial

Considero como factor diferencial la arquitectura de mi proyecto y la decisión de usar una tecnología como NestJs que es requerida para el puesto, pero que no se especificaba en el enunciado.

La arquitectura es una con la que he trabajado mucho, limpia y escalable que permite que los proyectos sean mantenibles a largo plazo, si bien es sabido que aumenta el tiempo de desarrollo, muchas veces considero preferible invertir más tiempo en etapas tempranas que reduzcan la deuda técnica a futuro y acarreen más problemas técnicos consigo

## Como usé la IA en el proyecto

La Inteligencia Artificial fue una excelente herramienta de apoyo durante el desarrollo. La utilicé para rebotar ideas, asimilar rápidamente las reglas de negocio del enunciado y acelerar la maquetación de los componentes en React. Considero a la IA como un amplificador de capacidades, el código es solo el medio para un fin, y el valor real del desarrollador radica en el criterio para detectar problemas y proponer soluciones de alto nivel.

## Lo que haría con más tiempo

- **Migración a PostgreSQL:** Reemplazar el adaptador actual de SQLite nativo por TypeORM/Prisma con PostgreSQL para manejar índices más robustos y escalabilidad real, acorde al estándar de la industria.

- **Sistema de Colas:** Para ISPs con cientos de miles de contratos, la importación síncrona provocaría timeouts. Movería el procesamiento de las corridas a background jobs controlados por colas y WebSockets/SSE para actualizar la UI en tiempo real.

- **Refactor UI:** Actualizar el frontend integrando shadcn/ui para dotar al panel de una experiencia de usuario más moderna y responsiva, mejorando el manejo de estados de carga y errores complejos.


#### ¡Que tengan un feliz día!