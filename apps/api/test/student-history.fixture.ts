import type { DataSource } from 'typeorm';

/**
 * Carga historia sintética anterior a B17 en una base de pruebas verificada.
 * La alteración del trigger y la inserción son atómicas: un error revierte ambas.
 * No existe excepción ni contexto equivalente en la aplicación de producción.
 */
export async function insertHistoricalGrade(
  source: DataSource,
  input: {
    matriculaId: string;
    indicadorId: string;
    grupoId: string;
    nota: string;
    registradoPor: string;
  },
): Promise<void> {
  const database = source.options.database;
  if (
    process.env.NODE_ENV !== 'test' ||
    typeof database !== 'string' ||
    database !== process.env.DB_NAME ||
    !/^excel_(students(_web)?|enrollments|evaluation|grades(_web)?|acts(_web)?|reports(_web)?)_test$/.test(
      database,
    )
  )
    throw new Error('La carga histórica requiere una base aislada de pruebas');
  await source.transaction(async (manager) => {
    await manager.query(
      'ALTER TABLE calificaciones DISABLE TRIGGER calificaciones_abiertas_validacion',
    );
    await manager.query(
      'INSERT INTO calificaciones(matricula_id,indicador_id,grupo_id,nota,registrado_por) VALUES($1,$2,$3,$4,$5)',
      [
        input.matriculaId,
        input.indicadorId,
        input.grupoId,
        input.nota,
        input.registradoPor,
      ],
    );
    // Ejecuta el guard diferido antes del ALTER: la fila legacy no tiene acta.
    await manager.query(
      'SET CONSTRAINTS calificaciones_acta_recalculo IMMEDIATE',
    );
    await manager.query(
      'ALTER TABLE calificaciones ENABLE TRIGGER calificaciones_abiertas_validacion',
    );
  });
}

/**
 * Conserva las fixtures de actas sintéticas anteriores a B18 sin darles aprobación
 * ni fabricar resultados. No es un comando disponible en la aplicación.
 */
export async function insertHistoricalAct(
  source: DataSource,
  groupId: string,
  actorId: string,
): Promise<void> {
  const database = source.options.database;
  if (
    process.env.NODE_ENV !== 'test' ||
    typeof database !== 'string' ||
    database !== process.env.DB_NAME ||
    !/^excel_(evaluation|grades|acts|reports)(_web)?_test$/.test(database)
  )
    throw new Error(
      'La carga de acta histórica requiere una base aislada de pruebas',
    );
  await source.transaction(async (manager) => {
    for (const name of [
      'cierres_asistencia_registro',
      'actas_resultados_completos',
    ])
      await manager.query(
        `ALTER TABLE cierres_academicos DISABLE TRIGGER ${name}`,
      );
    await manager.query(
      "INSERT INTO cierres_academicos(grupo_id,tipo,estado,realizado_por,revision,resumen) VALUES($1,'ACTA','CERRADO',$2,$3,'{}'::jsonb)",
      [groupId, actorId, 'c'.repeat(64)],
    );
    for (const name of [
      'cierres_asistencia_registro',
      'actas_resultados_completos',
    ])
      await manager.query(
        `ALTER TABLE cierres_academicos ENABLE TRIGGER ${name}`,
      );
  });
}

/** Mutación controlada de una fixture legacy para verificar el prerrequisito B08. */
export async function updateHistoricalPrerequisiteResult(
  source: DataSource,
  studentId: string,
  confirmed: boolean,
): Promise<void> {
  if (
    process.env.NODE_ENV !== 'test' ||
    source.options.database !== 'excel_enrollments_test' ||
    process.env.DB_NAME !== 'excel_enrollments_test'
  )
    throw new Error(
      'La preparación del prerrequisito requiere su base aislada de pruebas',
    );
  await source.transaction(async (manager) => {
    await manager.query(
      'ALTER TABLE resultados_academicos DISABLE TRIGGER resultados_acta_validacion',
    );
    await manager.query(
      `UPDATE resultados_academicos SET condicion='APROBADO',nota_oficial=13,confirmado_at=CASE WHEN $2::boolean THEN now() ELSE NULL END
       WHERE cierre_id IS NULL AND matricula_id IN (SELECT id FROM matriculas WHERE estudiante_id=$1 AND estado='CERRADA')`,
      [studentId, confirmed],
    );
    await manager.query(
      'SET CONSTRAINTS resultados_acta_consistencia IMMEDIATE',
    );
    await manager.query(
      'ALTER TABLE resultados_academicos ENABLE TRIGGER resultados_acta_validacion',
    );
  });
}

/** Datos exclusivamente sintéticos. No es un flujo de matrícula ni una fórmula oficial. */
export async function historyFixture(
  source: DataSource,
  studentId: string,
  actorId: string,
) {
  const [group] = await source.query(
    "SELECT * FROM grupos WHERE codigo='DEMO-EN-G1'",
  );
  const [param] = await source.query(
    'SELECT id FROM parametros_academicos ORDER BY id LIMIT 1',
  );
  const [period] = await source.query(
    "INSERT INTO periodos_academicos(codigo,nombre,fecha_inicio,fecha_fin,matricula_inicio,matricula_fin,estado) VALUES($1,'Periodo segundo sintético','2027-01-01','2027-03-31','2026-12-01','2026-12-31','ABIERTO') RETURNING id",
    [`SYN-${studentId}`],
  );
  const [secondGroup] = await source.query(
    "INSERT INTO grupos(periodo_id,nivel_id,turno_id,seccion_id,codigo,estado) VALUES($1,$2,$3,$4,$5,'ACTIVO') RETURNING *",
    [
      period.id,
      group.nivel_id,
      group.turno_id,
      group.seccion_id,
      `SYN-${studentId}`,
    ],
  );
  const attempts = [];
  for (const [index, g] of [group, secondGroup].entries()) {
    const [voucher] = await source.query(
      "INSERT INTO vouchers(estudiante_id,numero,fecha_pago,importe,estado,validado_por,validado_at) VALUES($1,$2,$3,100.50,'VALIDADO',$4,now()) RETURNING id",
      [
        studentId,
        `SYN-V-${studentId}-${index}`,
        index === 0 ? '2026-09-25' : '2026-12-25',
        actorId,
      ],
    );
    const [attempt] = await source.query(
      'INSERT INTO matriculas(codigo,estudiante_id,grupo_id,nivel_id,voucher_id,parametro_id,numero_intento,fecha_matricula,estado,registrado_por) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
      [
        `SYN-M-${studentId}-${index}`,
        studentId,
        g.id,
        g.nivel_id,
        voucher.id,
        param.id,
        index + 1,
        index === 0 ? '2026-09-25' : '2026-12-25',
        index === 0 ? 'CERRADA' : 'ACTIVA',
        actorId,
      ],
    );
    const [session] = await source.query(
      "INSERT INTO sesiones_clase(grupo_id,fecha,estado,creado_por) VALUES($1,$2,'REALIZADA',$3) ON CONFLICT(grupo_id,fecha) DO UPDATE SET estado=EXCLUDED.estado RETURNING id",
      [g.id, index === 0 ? '2026-10-01' : '2027-01-01', actorId],
    );
    await source.query(
      'INSERT INTO asistencias(grupo_id,sesion_id,matricula_id,codigo,registrado_por) VALUES($1,$2,$3,$4,$5)',
      [g.id, session.id, attempt.id, index === 0 ? 'F' : 'P', actorId],
    );
    if (index === 0)
      for (let day = 2; day <= 10; day++) {
        const [presentSession] = await source.query(
          "INSERT INTO sesiones_clase(grupo_id,fecha,estado,creado_por) VALUES($1,$2,'REALIZADA',$3) ON CONFLICT(grupo_id,fecha) DO UPDATE SET estado=EXCLUDED.estado RETURNING id",
          [g.id, `2026-10-${String(day).padStart(2, '0')}`, actorId],
        );
        await source.query(
          "INSERT INTO asistencias(grupo_id,sesion_id,matricula_id,codigo,registrado_por) VALUES($1,$2,$3,'P',$4)",
          [g.id, presentSession.id, attempt.id, actorId],
        );
      }
    const [evaluation] = await source.query(
      'INSERT INTO evaluaciones(grupo_id,nombre,peso_pct,orden) VALUES($1,$2,100,1) RETURNING id',
      [g.id, `Evaluación sintética ${studentId}`],
    );
    for (const order of [1, 2]) {
      const [indicator] = await source.query(
        'INSERT INTO indicadores_evaluacion(evaluacion_id,grupo_id,codigo,descripcion,peso_pct,orden) VALUES($1,$2,$3,$4,50,$5) RETURNING id',
        [
          evaluation.id,
          g.id,
          `SYN-${order}`,
          `Indicador sintético ${order}`,
          order,
        ],
      );
      if (index === 0 || order === 1)
        await insertHistoricalGrade(source, {
          matriculaId: attempt.id,
          indicadorId: indicator.id,
          grupoId: g.id,
          nota: index === 0 ? '12.40' : '0.00',
          registradoPor: actorId,
        });
    }
    if (index === 0)
      await source.query(
        "INSERT INTO resultados_academicos(matricula_id,promedio,nota_oficial,tardanzas_total,faltas_equivalentes,inasistencia_pct,condicion) VALUES($1,12.40,12,0,1,10,'DESAPROBADO')",
        [attempt.id],
      );
    attempts.push(attempt);
  }
  return { attempts, group, secondGroup, period };
}
