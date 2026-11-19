# Datos para pruebas manuales

La carga configurable amplía los datos de demostración de B02 y la preparación
de verificación de B20. Permite recorrer la aplicación con registros sintéticos
y detectar errores de navegación, paginación, permisos y cálculos. Sus tiempos y
resultados pertenecen al entorno de pruebas.

## Crear un lote

Desde la raíz del proyecto, prepara la base de desarrollo con la configuración y
las migraciones habituales. En PowerShell 7 ejecuta lo siguiente.

```powershell
pnpm env:setup
pnpm db:up
pnpm db:migrate

$env:ALLOW_DEMO_SEED = 'true'
$env:DEMO_SEED_PASSWORD = Read-Host 'Contraseña temporal para las cuentas de prueba (12 a 128 caracteres)' -MaskInput
try {
  pnpm db:seed:practice --batch prueba1 --students 500 --groups 20 --teachers 10 --sessions 10
} finally {
  Remove-Item Env:DEMO_SEED_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:ALLOW_DEMO_SEED -ErrorAction SilentlyContinue
}
```

La conexión se toma de `apps/api/.env`, igual que las migraciones. Utiliza una
base destinada a desarrollo. La carga requiere `ALLOW_DEMO_SEED=true` y se
bloquea cuando `NODE_ENV=production`. La contraseña se recibe por entorno y
se almacena con Argon2id. El comando informa las cantidades y los nombres de
usuario creados.

El ejemplo crea 500 estudiantes distribuidos en 20 grupos, 10 docentes y 10
sesiones por grupo. Con las mismas variables habilitadas, `pnpm db:seed:practice`
usa las cantidades predeterminadas y `pnpm db:seed:practice --help` muestra la ayuda.

| Opción | Predeterminado | Valores permitidos |
| --- | --- | --- |
| `--batch` | `prueba1` | Entre 1 y 8 letras minúsculas o números. Comienza por letra. |
| `--students` | 120 | Entre 2 y 5000. |
| `--groups` | 6 | Entre 2 y 100, hasta la cantidad de estudiantes. |
| `--teachers` | 3 | Entre 1 y 100, hasta la cantidad de grupos. |
| `--sessions` | 10 | Entre 1 y 60 por grupo. |

El producto de estudiantes y sesiones tiene un límite de 100000 para mantener
acotada la carga. Las fechas se calculan respecto al día de ejecución en Lima.
El periodo permite matrícula durante 90 días y las sesiones terminan en el día
de la carga. Después puedes añadir sesiones y seguir usando los flujos habituales.

## Ingresar y probar

Para `--batch prueba1`, los nombres de usuario son los siguientes.

| Rol | Usuario |
| --- | --- |
| Administración | `demo_prueba1_admin` |
| Secretaría | `demo_prueba1_secretaria` |
| Coordinación | `demo_prueba1_coordinador` |
| Docentes | `demo_prueba1_docente001` hasta la cantidad solicitada. |

Todas las cuentas nuevas usan la contraseña temporal que introdujiste. En el
primer ingreso se exige cambiarla y después iniciar sesión con la nueva clave.
Los docentes tienen grupos asignados para comprobar el alcance de sus permisos.

Busca el periodo `DEMO-PRUEBA1`. Los estudiantes usan documento `SINTETICO`,
códigos con el prefijo del lote y correos del dominio reservado `example.invalid`.
Cada grupo conserva solicitudes pendientes y matrículas activadas con voucher
validado cuando su cantidad de estudiantes permite distribuir estos escenarios.

Los escenarios académicos incluyen notas cero, 12.40, 12.50 y pendientes,
marcas P/F/T/J, expedientes de justificación en sus distintos estados y
asistencias pendientes. Con diez sesiones, algunos perfiles tienen 30 % exacto
y otros superan el límite. Tres tardanzas permiten comprobar su conversión a
una falta computable. Los perfiles se repiten dentro de cada grupo, por lo que
grupos pequeños contienen un subconjunto de los escenarios.

Los niveles y planes de evaluación propios del lote se identifican como
**SINTÉTICOS**. Usan dos componentes de 50 % con dos indicadores de 50 % cada uno,
exclusivamente para ejercitar el cálculo. La referencia de aprobación del plan
registra expresamente el propósito de prueba. Las actas quedan abiertas para
que pruebes el cierre desde administración. Los reportes EN/PT mantienen la
identificación **BORRADOR** de B19.

## Volver a ejecutar

El mismo lote con las mismas cantidades devuelve su resumen inicial y conserva
los cambios manuales, las contraseñas y los registros existentes. Cambiar las
cantidades de un lote ya creado produce un error con la indicación de usar otro
nombre. Para añadir más datos, repite el comando con `--batch prueba2` y las
cantidades que necesites.

Cada lote se confirma dentro de una transacción. Ante un error se revierten sus
datos y auditoría, y puedes repetir el comando. Las secuencias de PostgreSQL
pueden conservar saltos. Las sesiones utilizadas para generar los registros se
revocan al terminar y la cuenta técnica del lote queda inactiva.

Los idiomas de demostración existentes se reutilizan. Los niveles, periodos,
grupos, personas y criterios del lote se crean por separado. Se conserva la
versión de reglas vigente para las matrículas. Si la base aún carece de reglas
vigentes, se añade una versión con los valores acordados 13/30/3 y se registra
su procedencia de demostración en auditoría.

## Verificación

```sh
pnpm test:seed
pnpm check
```

`test:seed` crea una base PostgreSQL temporal y prueba las restricciones del
generador, idempotencia, concurrencia, preservación de datos y rollback completo.
La suite también forma parte de `pnpm test:db` y de la verificación de GitHub Actions.
