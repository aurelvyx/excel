# Base técnica de B01 y B02

Fecha: 24 de septiembre de 2026. Estado: implementado para desarrollo y demostración;
pendiente de revisión por otro integrante del equipo.

## Fuentes y alcance

Plan de Desarrollo, sprint 1: B01 (RF01, RNF12–13) y B02 (RF06–13, RNF05).
Modelo de Datos y Diccionario: secciones 3, 6.1 y 6.2.
Arquitectura del Sistema: secciones 6, 8, 10 y 11. `AGENTS.md` rige las reglas.

B01 aporta el entorno reproducible, configuración validada, salud técnica, OpenAPI
y un workflow de verificación. RF01 todavía corresponde a la implementación de acceso de B03.
B02 aporta las 15 tablas de identidad y oferta académica, restricciones, migraciones
y datos iniciales. No declara completados los CRUD ni permisos de RF06–13, que requieren
B03–B04. Matrículas, asistencia, notas, auditoría y reportes tendrán migraciones en sus historias.

## Decisiones técnicas

- Workspace pnpm 11.19.0, Node.js 24, NestJS 12 y React con Vite. Se usa el lockfile
  y `pnpm install --frozen-lockfile` en integración continua.
- TypeORM 1.1.1 con `@nestjs/typeorm` 12 y `pg`; se concreta la propuesta ADR03
  del diseño. Son dependencias de persistencia, no una infraestructura adicional.
  `synchronize`, `dropSchema` automático y migraciones al arrancar no se habilitan.
  Las migraciones explícitas se ejecutan en una transacción. Las entidades y
  repositorios de los CRUD se incorporarán por módulo en B04.
- PostgreSQL 18 en Docker Compose, siguiendo la configuración existente. Desarrollo
  usa un volumen persistente y puerto local. Pruebas usan otro proyecto de Compose,
  contraseña aleatoria, puerto efímero y tmpfs; se retira al finalizar incluso si fallan.
- Se cargan variables con Node.js, sin agregar un paquete de configuración.
  `pnpm env:setup` genera secretos locales si el archivo no existe y respeta archivos existentes.
- Swagger documenta la única ruta técnica pública `/api/v1/health`; no devuelve
  usuarios ni datos académicos. Los endpoints del negocio no están expuestos.
- Argon2id genera el hash de una contraseña aleatoria descartada para la cuenta
  sintética deshabilitada. No se entrega usuario operativo ni contraseña inicial.
- Se retira `vite-tsconfig-paths`: Vite resuelve esas rutas de forma nativa y
  el plugin anterior exigía TypeScript 5 aunque el generador ya usa TypeScript 6.

## Integridad y decisiones de modelado

Se respetan BIGINT/SMALLINT IDENTITY, nombres snake_case, NUMERIC y claves del
diccionario. Los IDs BIGINT y valores NUMERIC se mantienen como cadenas en el
controlador PostgreSQL para evitar pérdida de precisión en JavaScript.

Las claves foráneas usan RESTRICT. Los índices adicionales cubren columnas de
referencia que no sean el comienzo de una clave única. El prerrequisito usa una
clave compuesta para exigir el mismo idioma. Como concreción técnica de «nivel
anterior», exige orden menor; se comprueban también los niveles dependientes al
cambiar el orden y se serializan cambios con un bloqueo transaccional.

Propuestas técnicas explícitas: orden y duración positivos; ambos horarios de turno
presentes o ambos vacíos. No se fija una relación adicional entre el intervalo de
matrícula y el de clases: esa política no está confirmada. Capacidad puede ser NULL.

Las versiones de parámetros se hacen inmutables desde su creación, una protección
más estricta que impedir solo las versiones ya utilizadas. `vigente_hasta` se fija
al crear la versión; no se modifica después. La selección de vigencia y el servicio
administrativo con auditoría se implementarán con RF13, antes de activar matrículas.
Los cambios a reglas requieren nuevas versiones y no recalculan el pasado.

No se inventan pesos de evaluación ni códigos institucionales. La migración de datos
iniciales crea únicamente los cuatro roles acordados. El seed opcional usa prefijos
DEMO y tipo de documento SINTETICO; 13/30/3 son las reglas acordadas, pero la versión
de prueba no representa aprobación o configuración institucional.

`down` de las migraciones de estructura rechaza tablas con datos. Retirar los roles
iniciales falla si están asignados. La herramienta de reversión está bloqueada en
NODE_ENV=production. En entornos con datos institucionales se requiere respaldo y
migración correctiva revisada; nunca borrar datos para forzar una reversión.

## Referencias de implementación

- [TypeORM: migraciones](https://typeorm.io/docs/migrations/setup/)
- [TypeORM: configuración](https://typeorm.io/docs/data-source/data-source-options/)
- [NestJS: OpenAPI](https://docs.nestjs.com/openapi/introduction)
- [pnpm 11: política de scripts de dependencias](https://github.com/pnpm/pnpm.io/blob/main/blog/releases/11.0.md)

Se revisó también la configuración del adaptador `@nestjs/typeorm` instalado.
