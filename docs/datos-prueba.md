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
El periodo abre una semana antes de la primera clase y queda abierto hasta
90 días después de la carga. Las sesiones se reparten de lunes a viernes hasta
el día de carga o el último viernes si ejecutas el comando el fin de semana.
Después puedes añadir sesiones y seguir usando los flujos habituales.

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

Busca el periodo `DEMO-PRUEBA1`. En un lote nuevo, `DEMO-PRUEBA1-EN-M-A` es
Inglés Básico 1, turno mañana y sección A. `DEMO-PRUEBA1-PT-T-A` es Portugués
Básico 1, turno tarde y sección A. Con las cantidades predeterminadas también
hay turnos de noche y secciones B y C.

Puedes buscar a `Valeria Lucía Quispe Huamán` o su código `DEMO-PRUEBA1-E00001`.
Docentes y estudiantes usan combinaciones ficticias de nombres y apellidos,
documento `SINTETICO`, códigos del lote y correo del dominio reservado
`example.invalid`. Los vouchers tienen distintas fechas previas a las clases e
importes de ejemplo. Con suficientes estudiantes, cada grupo incluye solicitudes
pendientes, vouchers rechazados y matrículas activadas con voucher validado.

Los escenarios académicos incluyen notas cero, promedios de 12.40 y 12.50 y
notas pendientes, marcas P/F/T/J, justificaciones en distintos estados y
asistencias pendientes. Los perfiles se repiten dentro de cada grupo, por lo que
grupos pequeños contienen un subconjunto de los escenarios. Con seis grupos y
diez sesiones, puedes probar estos casos en `DEMO-PRUEBA1-EN-M-A`.

| Estudiante | Caso |
| --- | --- |
| `DEMO-PRUEBA1-E00001` | Promedio de 12.40 y asistencia completa. |
| `DEMO-PRUEBA1-E00007` | Promedio de 12.50 y 30 % exacto de inasistencias. |
| `DEMO-PRUEBA1-E00013` | Nota cero y 40 % de inasistencias. |
| `DEMO-PRUEBA1-E00019` | Tres tardanzas que equivalen a una falta computable. |

Los niveles llevan el código del lote `DEMO` y los planes de evaluación se
identifican como **SINTÉTICOS**. Usan Comprensión y Expresión, cada componente
de 50 % con dos indicadores de 50 %, exclusivamente para ejercitar el cálculo.
La referencia de aprobación del plan registra expresamente el propósito de
prueba. Las actas quedan abiertas para que pruebes el cierre desde administración.
Los reportes EN/PT mantienen la identificación **BORRADOR** de B19.

## Volver a ejecutar

El mismo lote con las mismas cantidades devuelve su resumen inicial y conserva
los cambios manuales, las contraseñas y los registros existentes. Cambiar las
cantidades de un lote ya creado produce un error con la indicación de usar otro
nombre. Para ver los ejemplos actualizados si ya cargaste `prueba1`, crea un lote
con `--batch prueba2` y las cantidades que necesites.

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
