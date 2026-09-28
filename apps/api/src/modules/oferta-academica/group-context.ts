// Proyección de lectura, restringida por el mismo alcance del grupo. No amplía permisos de catálogo.
export const groupContext = `(SELECT jsonb_build_object('periodo',p.nombre,'idioma',i.nombre,
  'nivel',i.nombre || ' / ' || n.nombre,'turno',tu.nombre,'seccion',s.nombre)
  FROM periodos_academicos p, niveles n, idiomas i, turnos tu, secciones s
  WHERE p.id=t.periodo_id AND n.id=t.nivel_id AND i.id=n.idioma_id
    AND tu.id=t.turno_id AND s.id=t.seccion_id) AS contexto`;
