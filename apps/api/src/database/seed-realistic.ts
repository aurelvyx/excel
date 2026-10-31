import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { DataSource, EntityManager } from 'typeorm';
import { createDataSource } from './configuracion/data-source.js';
import type { Identity } from '../modules/auth/access.js';
import { hashPassword } from '../modules/auth/security.js';
import { AuditService } from '../modules/control/audit.service.js';
import { AttendanceCalculationService } from '../modules/asistencia/attendance-calculation.service.js';
import { AttendanceClosureService } from '../modules/asistencia/attendance-closure.service.js';
import { AttendanceService } from '../modules/asistencia/attendance.service.js';
import { EvaluationRepository } from '../modules/evaluacion/evaluation.repository.js';
import { GradesRepository } from '../modules/evaluacion/grades.repository.js';
import { GradeCalculationService } from '../modules/evaluacion/grade-calculation.service.js';
import { ResultCalculationService } from '../modules/evaluacion/result-calculation.service.js';
import { ActRepository } from '../modules/evaluacion/act.repository.js';
import { ActService } from '../modules/evaluacion/act.service.js';

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

const DATA_TABLES = [
  'exportaciones',
  'resultados_academicos',
  'cierres_academicos',
  'calificaciones',
  'indicadores_evaluacion',
  'evaluaciones',
  'configuraciones_evaluacion_grupo',
  'planes_evaluacion',
  'justificaciones',
  'asistencias',
  'sesiones_clase',
  'matriculas',
  'vouchers',
  'grupo_docentes',
  'grupos',
  'secciones',
  'turnos',
  'periodos_academicos',
  'unidades_didacticas',
  'niveles',
  'idiomas',
  'parametros_academicos',
  'auditoria_eventos',
  'sesiones_usuario',
  'usuario_roles',
  'usuarios',
  'docentes',
  'estudiantes',
  'personas',
] as const;

const FIRST_NAMES_M = [
  'Alejandro', 'Sebastián', 'Mateo', 'Nicolás', 'Santiago', 'Rodrigo', 'Joaquín', 'Diego',
  'Gabriel', 'Álvaro', 'Gonzalo', 'Fabricio', 'Leonardo', 'Cristian', 'Mauricio', 'Renato',
  'Adrián', 'Marcelo', 'Esteban', 'Hernán', 'Gustavo', 'Ramiro', 'Óscar', 'Víctor',
  'Raúl', 'César', 'Julio', 'Édgar', 'Percy', 'Wilber', 'Ronald', 'Jhonatan',
  'Franco', 'Alonso', 'Bruno', 'Luciano', 'Emilio', 'Arturo', 'Sergio', 'Daniel',
];

const FIRST_NAMES_F = [
  'Valeria', 'Camila', 'Luciana', 'Mariana', 'Ximena', 'Andrea', 'Natalia', 'Gabriela',
  'Fernanda', 'Daniela', 'Ariana', 'Alessandra', 'Carolina', 'Paola', 'Milagros', 'Fiorella',
  'Claudia', 'Patricia', 'Rocío', 'Fabiola', 'Verónica', 'Mónica', 'Beatriz', 'Cecilia',
  'Yuliana', 'Marisol', 'Gladys', 'Karina', 'Vanessa', 'Diana', 'Sofía', 'Elena',
  'Lorena', 'Tatiana', 'Jimena', 'アントネッラ'.replace(/.*/, 'Antonella'), 'Kiara', 'Nadia', 'Evelyn', 'Noelia',
];

const SURNAMES = [
  'Quispe', 'Huamán', 'Condori', 'Mamani', 'Flores', 'Vargas', 'Rojas', 'Gutiérrez',
  'Mendoza', 'Salazar', 'Delgado', 'Paredes', 'Aguilar', 'Medina', 'Castillo', 'Morales',
  'Ortega', 'Chávez', 'Ramos', 'Soto', 'Villavicencio', 'Tupayachi', 'Yábar', 'Latorre',
  'Samanez', 'Béjar', 'Alarcón', 'Bustamante', 'Montesinos', 'Gallegos', 'Zegarra', 'Cáceres',
  'Peñaranda', 'Pacheco', 'Palomino', 'Espinoza', 'Cárdenas', 'Valdivia', 'Zúñiga', 'Gamarra',
  'Hinojosa', 'Farfán', 'Lovón', 'Ochoa', 'Tapia', 'Velásquez', 'Miranda', 'Carrasco',
  'Altamirano', 'Zamalloa', 'Hermosa', ' Dueñas'.trim(), 'loaiza'.replace(/^l/, 'L'), 'Uscamayta', 'Ttito', 'Paucar',
];

const CUSCO_STREETS = [
  'Av. de la Cultura 1420, Wanchaq',
  'Urb. Magisterio Primera Etapa Calle José Gabriel Cosio 214, Cusco',
  'Av. Collasuyo 890, Urb. Miravalle, Cusco',
  'Urb. Larapa Grande D-4, San Jerónimo',
  'Urb. Ttio Pasaje Uribe N-12, Wanchaq',
  'Av. Garcilaso 518, Cercado del Cusco',
  'Plaza Túpac Amaru 305, Wanchaq',
  'Urb. Marcavalle J-18, Wanchaq',
  'Av. El Sol 740, Cercado del Cusco',
  'Urb. Santa Mónica Calle Ricardo Palma E-9, Wanchaq',
  'Urb. Ingeniería II Etapa C-7, San Sebastián',
  'Av. Los Incas 1105, Wanchaq',
  'Urb. Mariscal Gamarra 1ra Etapa 14-B, Cusco',
  'Urb. Cachimayo F-11, San Sebastián',
  'Av. La Cultura 2310, Urb. Naciones Unidas, San Sebastián',
  'Urb. Bancopata G-8, Santiago',
  'Urb. Huancaro Calle Malecón Industrial A-15, Santiago',
  'Urb. Kennedy Norte B-22, Wanchaq',
  'Av. Pardo Paseo de los Héroes 612, Cusco',
  'Urb. Manuel Prado Av. Machu Picchu H-5, Cusco',
];

function addDays(baseIso: string, delta: number): string {
  const [y, m, d] = baseIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + delta));
  return dt.toISOString().slice(0, 10);
}

type TeacherSpec = {
  code: string;
  username: string;
  dni: string;
  nombres: string;
  paterno: string;
  materno: string;
  sexo: 'M' | 'F';
  nacimiento: string;
  telefono: string;
  correo: string;
  especialidad: string;
  activo: boolean;
};

const TEACHERS_SPEC: TeacherSpec[] = [
  {
    code: 'DOC-2024-001',
    username: 'doc_carlos',
    dni: '41852301',
    nombres: 'Carlos Alberto',
    paterno: 'Mendoza',
    materno: 'Alarcón',
    sexo: 'M',
    nacimiento: '1984-03-14',
    telefono: '984215410',
    correo: 'cmendoza@excelcusco.edu.pe',
    especialidad: 'Lic. en Lengua Extranjera: Inglés Comunicativo (Cambridge C1 Advanced)',
    activo: true,
  },
  {
    code: 'DOC-2024-002',
    username: 'doc_elena',
    dni: '42963147',
    nombres: 'María Elena',
    paterno: 'Bustamante',
    materno: 'Salas',
    sexo: 'F',
    nacimiento: '1986-07-22',
    telefono: '984331890',
    correo: 'ebustamante@excelcusco.edu.pe',
    especialidad: 'Mgt. en Lingüística Aplicada y Metodología TESOL - Inglés Avanzado',
    activo: true,
  },
  {
    code: 'DOC-2024-003',
    username: 'doc_roberto',
    dni: '43125896',
    nombres: 'Roberto Carlos',
    paterno: 'Oliveira',
    materno: 'Pinedo',
    sexo: 'M',
    nacimiento: '1983-11-08',
    telefono: '984512033',
    correo: 'roliveira@excelcusco.edu.pe',
    especialidad: 'Lic. en Lengua Portuguesa y Cultura Brasileña (Certificación CELPE-Bras)',
    activo: true,
  },
  {
    code: 'DOC-2024-004',
    username: 'doc_valeria',
    dni: '45781239',
    nombres: 'Valeria Sofía',
    paterno: 'Montesinos',
    materno: 'Gallegos',
    sexo: 'F',
    nacimiento: '1990-02-19',
    telefono: '984674125',
    correo: 'vmontesinos@excelcusco.edu.pe',
    especialidad: 'Especialista en Didáctica del Inglés y Preparación Internacional TOEFL iBT',
    activo: true,
  },
  {
    code: 'DOC-2025-005',
    username: 'doc_jorge',
    dni: '40896521',
    nombres: 'Jorge Luis',
    paterno: 'Quispe',
    materno: 'Condori',
    sexo: 'M',
    nacimiento: '1981-09-30',
    telefono: '984789654',
    correo: 'jquispe@excelcusco.edu.pe',
    especialidad: 'Lic. en Educación Intercultural Bilingüe - Quechua Cusco-Collao',
    activo: true,
  },
  {
    code: 'DOC-2025-006',
    username: 'doc_patricia',
    dni: '44521087',
    nombres: 'Patricia Milagros',
    paterno: 'Latorre',
    materno: 'Béjar',
    sexo: 'F',
    nacimiento: '1988-05-11',
    telefono: '984852147',
    correo: 'platorre@excelcusco.edu.pe',
    especialidad: 'Lic. en Lengua Francesa y Didáctica FLE (Certificación DELF B2)',
    activo: true,
  },
  {
    code: 'DOC-2025-007',
    username: 'doc_miguel',
    dni: '46231984',
    nombres: 'Miguel Ángel',
    paterno: 'Peñaranda',
    materno: 'Yábar',
    sexo: 'M',
    nacimiento: '1989-12-03',
    telefono: '984913572',
    correo: 'mpenaranda@excelcusco.edu.pe',
    especialidad: 'Traductor e Intérprete Profesional Portugués-Inglés',
    activo: true,
  },
  {
    code: 'DOC-2025-008',
    username: 'doc_claudia',
    dni: '47895123',
    nombres: 'Claudia Ximena',
    paterno: 'Samanez',
    materno: 'Pacheco',
    sexo: 'F',
    nacimiento: '1992-08-25',
    telefono: '984159753',
    correo: 'csamanez@excelcusco.edu.pe',
    especialidad: 'Especialista en Fonética y Conversación en Inglés Británico y Americano',
    activo: true,
  },
  {
    code: 'DOC-2024-009',
    username: 'doc_fernando',
    dni: '41025874',
    nombres: 'Fernando Javier',
    paterno: 'Guzmán',
    materno: 'Morveli',
    sexo: 'M',
    nacimiento: '1980-04-17',
    telefono: '984357951',
    correo: 'fguzman@excelcusco.edu.pe',
    especialidad: 'Docente de Inglés Técnico y de Negocios (En licencia)',
    activo: false,
  },
];

type LevelSpec = {
  idiomaCode: 'ING' | 'POR' | 'QUE' | 'FRA';
  code: string;
  nombre: string;
  orden: number;
  duracionMeses: number;
  prereqCode: string | null;
  unidades: {
    codigo: string;
    nombre: string;
    creditos: string;
    ht: number;
    hp: number;
  }[];
};

const LEVELS_SPEC: LevelSpec[] = [
  {
    idiomaCode: 'ING',
    code: 'ING-B1',
    nombre: 'Inglés Básico I (A1.1)',
    orden: 1,
    duracionMeses: 3,
    prereqCode: null,
    unidades: [
      { codigo: 'UD1-IB1', nombre: 'Comprensión y Expresión Oral cotidiana I', creditos: '4.5', ht: 20, hp: 40 },
      { codigo: 'UD2-IB1', nombre: 'Comprensión Lectora y Vocabulario Base I', creditos: '4.5', ht: 24, hp: 36 },
      { codigo: 'UD3-IB1', nombre: 'Estructuras Gramaticales en Contexto I', creditos: '4.5', ht: 24, hp: 36 },
      { codigo: 'UD4-IB1', nombre: 'Redacción Inicial y Proyecto Comunicativo I', creditos: '4.5', ht: 20, hp: 40 },
    ],
  },
  {
    idiomaCode: 'ING',
    code: 'ING-B2',
    nombre: 'Inglés Básico II (A1.2 - A2.1)',
    orden: 2,
    duracionMeses: 3,
    prereqCode: 'ING-B1',
    unidades: [
      { codigo: 'UD1-IB2', nombre: 'Interacción Oral en Situaciones Sociales II', creditos: '4.5', ht: 20, hp: 40 },
      { codigo: 'UD2-IB2', nombre: 'Lectura Comprensiva de Textos Funcionales II', creditos: '4.5', ht: 24, hp: 36 },
      { codigo: 'UD3-IB2', nombre: 'Gramática Comunicativa Pasado y Futuro II', creditos: '4.5', ht: 24, hp: 36 },
      { codigo: 'UD4-IB2', nombre: 'Producción Escrita y Presentación Guiada II', creditos: '4.5', ht: 20, hp: 40 },
    ],
  },
  {
    idiomaCode: 'ING',
    code: 'ING-I1',
    nombre: 'Inglés Intermedio I (B1.1)',
    orden: 3,
    duracionMeses: 4,
    prereqCode: 'ING-B2',
    unidades: [
      { codigo: 'UD1-II1', nombre: 'Fluidez y Debate Oral Intermedio I', creditos: '5.0', ht: 24, hp: 48 },
      { codigo: 'UD2-II1', nombre: 'Análisis de Textos Académicos y Artículos I', creditos: '5.0', ht: 28, hp: 44 },
      { codigo: 'UD3-II1', nombre: 'Sintaxis Intermedia y Tiempos Compuestos I', creditos: '5.0', ht: 28, hp: 44 },
      { codigo: 'UD4-II1', nombre: 'Composición de Ensayos Cortos y Reportes I', creditos: '5.0', ht: 24, hp: 48 },
    ],
  },
  {
    idiomaCode: 'ING',
    code: 'ING-I2',
    nombre: 'Inglés Intermedio II (B1.2)',
    orden: 4,
    duracionMeses: 4,
    prereqCode: 'ING-I1',
    unidades: [
      { codigo: 'UD1-II2', nombre: 'Comunicación Profesional y Turismo Receptivo', creditos: '5.0', ht: 24, hp: 48 },
      { codigo: 'UD2-II2', nombre: 'Comprensión Crítica de Medios Internacionales', creditos: '5.0', ht: 28, hp: 44 },
      { codigo: 'UD3-II2', nombre: 'Estructuras Condicionales y Voz Pasiva', creditos: '5.0', ht: 28, hp: 44 },
      { codigo: 'UD4-II2', nombre: 'Redacción Argumentativa y Proyecto B1', creditos: '5.0', ht: 24, hp: 48 },
    ],
  },
  {
    idiomaCode: 'ING',
    code: 'ING-AV',
    nombre: 'Inglés Avanzado y Certificación (B2 - C1)',
    orden: 5,
    duracionMeses: 4,
    prereqCode: 'ING-I2',
    unidades: [
      { codigo: 'UD1-IAV', nombre: 'Oratoria Académica y Negociación en Inglés', creditos: '5.5', ht: 28, hp: 52 },
      { codigo: 'UD2-IAV', nombre: 'Lectura Especializada e Investigación C1', creditos: '5.5', ht: 32, hp: 48 },
      { codigo: 'UD3-IAV', nombre: 'Gramática Avanzada e Idiomaticidad', creditos: '5.5', ht: 32, hp: 48 },
      { codigo: 'UD4-IAV', nombre: 'Redacción Académica y Simulación Cambridge/TOEFL', creditos: '5.5', ht: 28, hp: 52 },
    ],
  },
  {
    idiomaCode: 'POR',
    code: 'POR-B1',
    nombre: 'Portugués Básico I (A1)',
    orden: 1,
    duracionMeses: 3,
    prereqCode: null,
    unidades: [
      { codigo: 'UD1-PB1', nombre: 'Fonética Brasileña y Expresión Oral Inicial', creditos: '4.5', ht: 20, hp: 40 },
      { codigo: 'UD2-PB1', nombre: 'Comprensión de Textos Cotidianos en Portugués', creditos: '4.5', ht: 24, hp: 36 },
      { codigo: 'UD3-PB1', nombre: 'Morfosintaxis Básica y Falsos Amigos', creditos: '4.5', ht: 24, hp: 36 },
      { codigo: 'UD4-PB1', nombre: 'Producción Escrita y Cultura Lusófona I', creditos: '4.5', ht: 20, hp: 40 },
    ],
  },
  {
    idiomaCode: 'POR',
    code: 'POR-B2',
    nombre: 'Portugués Básico II (A2)',
    orden: 2,
    duracionMeses: 3,
    prereqCode: 'POR-B1',
    unidades: [
      { codigo: 'UD1-PB2', nombre: 'Conversación Fluida y Atención al Viajero', creditos: '4.5', ht: 20, hp: 40 },
      { codigo: 'UD2-PB2', nombre: 'Lectura de Crónicas y Prensa Brasileña', creditos: '4.5', ht: 24, hp: 36 },
      { codigo: 'UD3-PB2', nombre: 'Tiempos del Subjuntivo y Conectores en Portugués', creditos: '4.5', ht: 24, hp: 36 },
      { codigo: 'UD4-PB2', nombre: 'Correspondencia Formal y Proyecto Cultural II', creditos: '4.5', ht: 20, hp: 40 },
    ],
  },
  {
    idiomaCode: 'POR',
    code: 'POR-IN',
    nombre: 'Portugués Intermedio y CELPE-Bras (B1)',
    orden: 3,
    duracionMeses: 4,
    prereqCode: 'POR-B2',
    unidades: [
      { codigo: 'UD1-PIN', nombre: 'Argumentación Oral y Entrevista CELPE-Bras', creditos: '5.0', ht: 24, hp: 48 },
      { codigo: 'UD2-PIN', nombre: 'Comprensión Audiovisual y Textual Integrada', creditos: '5.0', ht: 28, hp: 44 },
      { codigo: 'UD3-PIN', nombre: 'Gramática Normativa y Variación Lingüística', creditos: '5.0', ht: 28, hp: 44 },
      { codigo: 'UD4-PIN', nombre: 'Géneros Discursivos y Tareas Escritas CELPE-Bras', creditos: '5.0', ht: 24, hp: 48 },
    ],
  },
  {
    idiomaCode: 'QUE',
    code: 'QUE-B1',
    nombre: 'Quechua Cusco-Collao Básico I',
    orden: 1,
    duracionMeses: 3,
    prereqCode: null,
    unidades: [
      { codigo: 'UD1-QB1', nombre: 'Rimasun: Diálogo Oral y Saludos Andinos', creditos: '4.5', ht: 20, hp: 40 },
      { codigo: 'UD2-QB1', nombre: 'Ñawinchasun: Lectura y Cosmovisión Quechua', creditos: '4.5', ht: 24, hp: 36 },
      { codigo: 'UD3-QB1', nombre: 'Sufijación Nominal y Verbal Pentavocálica', creditos: '4.5', ht: 24, hp: 36 },
      { codigo: 'UD4-QB1', nombre: 'Qillqasun: Escritura Básica y Atención Ciudadana', creditos: '4.5', ht: 20, hp: 40 },
    ],
  },
  {
    idiomaCode: 'FRA',
    code: 'FRA-B1',
    nombre: 'Francés Comunicativo Básico I (A1)',
    orden: 1,
    duracionMeses: 3,
    prereqCode: null,
    unidades: [
      { codigo: 'UD1-FB1', nombre: 'Phonétique Française et Interaction Orale I', creditos: '4.5', ht: 20, hp: 40 },
      { codigo: 'UD2-FB1', nombre: 'Compréhension des Écrits et Lexique A1', creditos: '4.5', ht: 24, hp: 36 },
      { codigo: 'UD3-FB1', nombre: 'Grammaire Structurée et Conjugaison Présent/Passé', creditos: '4.5', ht: 24, hp: 36 },
      { codigo: 'UD4-FB1', nombre: 'Production Écrite et Projet Francophone DELF A1', creditos: '4.5', ht: 20, hp: 40 },
    ],
  },
];

export type RealisticSeedResult = {
  tablasPobladas: number;
  docentes: number;
  estudiantes: number;
  grupos: number;
  vouchers: number;
  matriculas: number;
  sesiones: number;
  asistencias: number;
  justificaciones: number;
  planesEvaluacion: number;
  calificaciones: number;
  cierresAcademicos: number;
  resultadosAcademicos: number;
  exportaciones: number;
  auditoriaEventos: number;
};

export async function seedRealistic(
  source: DataSource,
): Promise<RealisticSeedResult> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('La carga masiva de demostración está deshabilitada en producción');
  }

  const [clockRow] = (await source.query(
    "SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date::text AS today",
  )) as { today: string }[];
  const today = clockRow!.today;

  // Preserve existing admin password_hash and active session tokens so the user stays logged in
  const existingAdminRows = (await source.query(
    `SELECT u.nombre_usuario, u.password_hash, u.requiere_cambio_clave
     FROM usuarios u WHERE u.nombre_usuario = 'admin' LIMIT 1`,
  )) as { nombre_usuario: string; password_hash: string; requiere_cambio_clave: boolean }[];

  const existingAdminSessions = (await source.query(
    `SELECT s.token_hash, s.creado_at::text, s.expira_at::text, s.revocado_at::text
     FROM sesiones_usuario s
     JOIN usuarios u ON u.id = s.usuario_id
     WHERE u.nombre_usuario = 'admin' AND s.revocado_at IS NULL AND s.expira_at > CURRENT_TIMESTAMP`,
  )) as {
    token_hash: string;
    creado_at: string;
    expira_at: string;
    revocado_at: string | null;
  }[];

  const defaultAdminHash =
    existingAdminRows[0]?.password_hash ?? (await hashPassword('Admin123!'));
  const teacherHash = await hashPassword('Docente123!');
  const secretaryHash = await hashPassword('Secretaria123!');
  const coordHash = await hashPassword('Coord123!');

  // 1. Clean wipe of all 29 data tables while keeping roles & migrations intact
  await source.transaction(async (manager) => {
    for (const table of DATA_TABLES) {
      await manager.query(`ALTER TABLE ${table} DISABLE TRIGGER USER`);
    }
    await manager.query(
      `TRUNCATE TABLE ${DATA_TABLES.join(', ')} RESTART IDENTITY CASCADE`,
    );
    for (const table of DATA_TABLES) {
      await manager.query(`ALTER TABLE ${table} ENABLE TRIGGER USER`);
    }
  });

  // 2. Insert base dataset inside a main transaction
  const ids = await source.transaction(async (manager: EntityManager) => {
    // Ensure 4 official roles
    await manager.query(`
      INSERT INTO roles (codigo, nombre, descripcion, activo) VALUES
        ('ADMIN', 'Administrador', 'Configuración y control administrativo', TRUE),
        ('SECRETARIA', 'Secretaría', 'Registro y gestión de matrícula', TRUE),
        ('DOCENTE', 'Docente', 'Registro académico de grupos asignados', TRUE),
        ('COORDINADOR', 'Coordinación o dirección', 'Consulta y revisión académica', TRUE)
      ON CONFLICT (codigo) DO UPDATE SET activo = TRUE
    `);
    const roleRows = (await manager.query(
      'SELECT id, codigo FROM roles',
    )) as { id: number; codigo: string }[];
    const roleMap = new Map(roleRows.map((r) => [r.codigo, r.id]));

    // Insert Staff Personas & Users
    const [adminPersona] = (await manager.query(
      `INSERT INTO personas (tipo_documento, numero_documento, nombres, apellido_paterno, apellido_materno, fecha_nacimiento, sexo, telefono, correo, direccion, activo)
       VALUES ('DNI', '41258963', 'Alejandro Martín', 'Vargas', 'Quispe', '1979-06-15', 'M', '984100200', 'direccion@excelcusco.edu.pe', 'Av. de la Cultura 1420, Wanchaq', TRUE)
       RETURNING id`,
    )) as { id: string }[];

    const [adminUser] = (await manager.query(
      `INSERT INTO usuarios (persona_id, nombre_usuario, password_hash, requiere_cambio_clave, ultimo_acceso_at, activo)
       VALUES ($1, 'admin', $2, FALSE, CURRENT_TIMESTAMP - INTERVAL '10 minutes', TRUE)
       RETURNING id`,
      [adminPersona!.id, defaultAdminHash],
    )) as { id: string }[];
    const adminId = adminUser!.id;

    await manager.query(
      `INSERT INTO usuario_roles (usuario_id, rol_id, asignado_por) VALUES ($1, $2, $1)`,
      [adminId, roleMap.get('ADMIN')],
    );

    // Restore admin's existing browser sessions so they don't get logged out
    for (const sess of existingAdminSessions) {
      await manager.query(
        `INSERT INTO sesiones_usuario (usuario_id, token_hash, creado_at, expira_at, revocado_at)
         VALUES ($1, $2, $3::timestamptz, $4::timestamptz, $5::timestamptz)
         ON CONFLICT (token_hash) DO NOTHING`,
        [adminId, sess.token_hash, sess.creado_at, sess.expira_at, sess.revocado_at],
      );
    }

    const [adminSeederSession] = (await manager.query(
      `INSERT INTO sesiones_usuario (usuario_id, token_hash, creado_at, expira_at, revocado_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP - INTERVAL '5 minutes', CURRENT_TIMESTAMP + INTERVAL '7 days', NULL)
       RETURNING id`,
      [adminId, sha256(`admin-active-seeder-session-${Date.now()}`)],
    )) as { id: string }[];
    const adminSessionId = adminSeederSession!.id;

    // Secretarias, Coordinador & Soporte
    const staffSpecs = [
      {
        dni: '44852190',
        nombres: 'Lucía Fernanda',
        paterno: 'Rojas',
        materno: 'Huamán',
        sexo: 'F',
        nac: '1991-04-12',
        tel: '984220310',
        correo: 'lrojas@excelcusco.edu.pe',
        username: 'sec_lucia',
        hash: secretaryHash,
        roles: ['SECRETARIA'],
      },
      {
        dni: '45912340',
        nombres: 'Carmen Rosa',
        paterno: 'Delgado',
        materno: 'Tupayachi',
        sexo: 'F',
        nac: '1993-09-21',
        tel: '984220315',
        correo: 'cdelgado@excelcusco.edu.pe',
        username: 'sec_carmen',
        hash: secretaryHash,
        roles: ['SECRETARIA'],
      },
      {
        dni: '40512987',
        nombres: 'Marco Antonio',
        paterno: 'Zegarra',
        materno: 'Medina',
        sexo: 'M',
        nac: '1982-01-28',
        tel: '984110500',
        correo: 'mzegarra@excelcusco.edu.pe',
        username: 'coord_marco',
        hash: coordHash,
        roles: ['COORDINADOR'],
      },
      {
        dni: '46812395',
        nombres: 'Diego Armando',
        paterno: 'Cáceres',
        materno: 'Flores',
        sexo: 'M',
        nac: '1994-11-05',
        tel: '984110999',
        correo: 'ti@excelcusco.edu.pe',
        username: 'soporte_ti',
        hash: defaultAdminHash,
        roles: ['ADMIN', 'COORDINADOR'],
      },
    ];

    const staffUserIds: Record<string, string> = { admin: adminId };
    for (const st of staffSpecs) {
      const [p] = (await manager.query(
        `INSERT INTO personas (tipo_documento, numero_documento, nombres, apellido_paterno, apellido_materno, fecha_nacimiento, sexo, telefono, correo, direccion, activo)
         VALUES ('DNI', $1, $2, $3, $4, $5, $6, $7, $8, 'Av. El Sol 740, Cercado del Cusco', TRUE)
         RETURNING id`,
        [st.dni, st.nombres, st.paterno, st.materno, st.nac, st.sexo, st.tel, st.correo],
      )) as { id: string }[];
      const [u] = (await manager.query(
        `INSERT INTO usuarios (persona_id, nombre_usuario, password_hash, requiere_cambio_clave, ultimo_acceso_at, activo)
         VALUES ($1, $2, $3, FALSE, CURRENT_TIMESTAMP - INTERVAL '2 hours', TRUE)
         RETURNING id`,
        [p!.id, st.username, st.hash],
      )) as { id: string }[];
      staffUserIds[st.username] = u!.id;
      for (const rCode of st.roles) {
        await manager.query(
          `INSERT INTO usuario_roles (usuario_id, rol_id, asignado_por) VALUES ($1, $2, $3)`,
          [u!.id, roleMap.get(rCode), adminId],
        );
      }
    }

    // Insert 9 Teachers (8 active + 1 inactive)
    const teacherByCode = new Map<string, { docenteId: string; usuarioId: string }>();
    for (let i = 0; i < TEACHERS_SPEC.length; i++) {
      const t = TEACHERS_SPEC[i]!;
      const [p] = (await manager.query(
        `INSERT INTO personas (tipo_documento, numero_documento, nombres, apellido_paterno, apellido_materno, fecha_nacimiento, sexo, telefono, correo, direccion, activo)
         VALUES ('DNI', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id`,
        [
          t.dni,
          t.nombres,
          t.paterno,
          t.materno,
          t.nacimiento,
          t.sexo,
          t.telefono,
          t.correo,
          CUSCO_STREETS[i % CUSCO_STREETS.length],
          t.activo,
        ],
      )) as { id: string }[];

      const [d] = (await manager.query(
        `INSERT INTO docentes (persona_id, codigo_docente, especialidad, activo)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [p!.id, t.code, t.especialidad, t.activo],
      )) as { id: string }[];

      const [u] = (await manager.query(
        `INSERT INTO usuarios (persona_id, nombre_usuario, password_hash, requiere_cambio_clave, ultimo_acceso_at, activo)
         VALUES ($1, $2, $3, FALSE, CURRENT_TIMESTAMP - ($4::int || ' hours')::interval, $5)
         RETURNING id`,
        [p!.id, t.username, teacherHash, (i + 1) * 3, t.activo],
      )) as { id: string }[];

      await manager.query(
        `INSERT INTO usuario_roles (usuario_id, rol_id, asignado_por) VALUES ($1, $2, $3)`,
        [u!.id, roleMap.get('DOCENTE'), adminId],
      );
      if (i === 1) {
        // Mgt. María Elena also has COORDINADOR role
        await manager.query(
          `INSERT INTO usuario_roles (usuario_id, rol_id, asignado_por) VALUES ($1, $2, $3)`,
          [u!.id, roleMap.get('COORDINADOR'), adminId],
        );
      }
      teacherByCode.set(t.code, { docenteId: d!.id, usuarioId: u!.id });
    }

    // Insert 45 Auth Sessions in sesiones_usuario across staff and teachers
    const allUserIds = [
      adminId,
      staffUserIds.sec_lucia!,
      staffUserIds.sec_carmen!,
      staffUserIds.coord_marco!,
      ...Array.from(teacherByCode.values()).map((t) => t.usuarioId),
    ];
    for (let sIdx = 0; sIdx < 45; sIdx++) {
      const uid = allUserIds[sIdx % allUserIds.length]!;
      const tokenHash = sha256(`realistic-session-token-${sIdx}-${uid}`);
      const daysAgo = (sIdx % 25) + 1;
      const isRevoked = sIdx % 3 === 0;
      await manager.query(
        `INSERT INTO sesiones_usuario (usuario_id, token_hash, creado_at, expira_at, revocado_at)
         VALUES (
           $1,
           $2,
           CURRENT_TIMESTAMP - ($3::int || ' days')::interval,
           CURRENT_TIMESTAMP - ($3::int || ' days')::interval + INTERVAL '12 hours',
           CASE WHEN $4::boolean THEN CURRENT_TIMESTAMP - ($3::int || ' days')::interval + INTERVAL '4 hours' ELSE NULL END
         )
         ON CONFLICT (token_hash) DO NOTHING`,
        [uid, tokenHash, daysAgo, isRevoked],
      );
    }

    // Insert 300 Students (personas + estudiantes)
    const studentIds: string[] = [];
    for (let idx = 0; idx < 300; idx++) {
      const isFemale = idx % 2 === 0;
      const firstPool = isFemale ? FIRST_NAMES_F : FIRST_NAMES_M;
      const f1 = firstPool[idx % firstPool.length]!;
      const f2 = firstPool[(idx * 7 + 3) % firstPool.length]!;
      const nombres = f1 === f2 ? f1 : `${f1} ${f2}`;
      const paterno = SURNAMES[(idx * 3) % SURNAMES.length]!;
      const materno = SURNAMES[(idx * 5 + 11) % SURNAMES.length]!;
      const isForeign = idx % 45 === 44;
      const tipoDoc = isForeign ? 'CE' : 'DNI';
      const numDoc = isForeign
        ? `00184${String(1000 + idx)}`
        : String(70150000 + idx * 137);
      const birthYear = 1990 + (idx % 17);
      const birthMonth = String((idx % 12) + 1).padStart(2, '0');
      const birthDay = String((idx % 28) + 1).padStart(2, '0');
      const fechaNac = `${birthYear}-${birthMonth}-${birthDay}`;
      const telefono = `9${String(84100000 + idx * 239).slice(0, 8)}`;
      const cleanName = f1
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      const cleanPat = paterno
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      const domain =
        idx % 4 === 0
          ? 'unsaac.edu.pe'
          : idx % 5 === 0
            ? 'uandina.edu.pe'
            : 'gmail.com';
      const correo = `${cleanName}.${cleanPat}${idx + 1}@${domain}`;
      const direccion = CUSCO_STREETS[idx % CUSCO_STREETS.length]!;
      const activo = idx < 292; // 292 active, 8 inactive historical students
      const yearPrefix = idx < 120 ? '2025' : '2026';
      const codigoEst = `EST-${yearPrefix}-${String(idx + 1).padStart(4, '0')}`;
      const fechaReg = idx < 120 ? addDays(today, -190 + (idx % 30)) : addDays(today, -65 + (idx % 40));

      const [p] = (await manager.query(
        `INSERT INTO personas (tipo_documento, numero_documento, nombres, apellido_paterno, apellido_materno, fecha_nacimiento, sexo, telefono, correo, direccion, activo)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [
          tipoDoc,
          numDoc,
          nombres,
          paterno,
          materno,
          fechaNac,
          isFemale ? 'F' : 'M',
          telefono,
          correo,
          direccion,
          activo,
        ],
      )) as { id: string }[];

      const [est] = (await manager.query(
        `INSERT INTO estudiantes (persona_id, codigo_estudiante, fecha_registro, activo)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [p!.id, codigoEst, fechaReg, activo],
      )) as { id: string }[];
      studentIds.push(est!.id);
    }

    // Insert parametros_academicos (Version 1 & Version 2)
    const [paramV1] = (await manager.query(
      `INSERT INTO parametros_academicos (version, nota_minima, inasistencia_max_pct, tardanzas_por_falta, vigente_desde, vigente_hasta, creado_por)
       VALUES (1, 13.00, 30.00, 3, '2025-01-01T00:00:00-05:00', '2025-12-31T23:59:59-05:00', $1)
       RETURNING id`,
      [adminId],
    )) as { id: string }[];

    const [paramV2] = (await manager.query(
      `INSERT INTO parametros_academicos (version, nota_minima, inasistencia_max_pct, tardanzas_por_falta, vigente_desde, vigente_hasta, creado_por)
       VALUES (2, 13.00, 30.00, 3, '2026-01-01T00:00:00-05:00', NULL, $1)
       RETURNING id`,
      [adminId],
    )) as { id: string }[];

    // Insert idiomas (4 languages)
    const idiomasSpec = [
      { codigo: 'ING', nombre: 'Inglés Comunicativo' },
      { codigo: 'POR', nombre: 'Portugués Brasileño' },
      { codigo: 'QUE', nombre: 'Quechua Cusco-Collao' },
      { codigo: 'FRA', nombre: 'Francés Comunicativo' },
    ];
    const idiomaByCode = new Map<string, number>();
    for (const idm of idiomasSpec) {
      const [row] = (await manager.query(
        `INSERT INTO idiomas (codigo, nombre, activo) VALUES ($1, $2, TRUE) RETURNING id`,
        [idm.codigo, idm.nombre],
      )) as { id: number }[];
      idiomaByCode.set(idm.codigo, row!.id);
    }

    // Insert niveles (10 levels in order so prerequisite trigger passes) & 40 unidades_didacticas
    const nivelByCode = new Map<
      string,
      { id: string; idiomaId: number; unidades: string[]; planAprobadoId: string }
    >();

    for (const lvl of LEVELS_SPEC) {
      const idiomaId = idiomaByCode.get(lvl.idiomaCode)!;
      const prereqId = lvl.prereqCode ? nivelByCode.get(lvl.prereqCode)!.id : null;
      const [nRow] = (await manager.query(
        `INSERT INTO niveles (idioma_id, prerrequisito_id, codigo, nombre, orden, duracion_meses, activo)
         VALUES ($1, $2, $3, $4, $5, $6, TRUE)
         RETURNING id`,
        [idiomaId, prereqId, lvl.code, lvl.nombre, lvl.orden, lvl.duracionMeses],
      )) as { id: string }[];
      const nivelId = nRow!.id;

      const unidadIds: string[] = [];
      for (let uIdx = 0; uIdx < lvl.unidades.length; uIdx++) {
        const u = lvl.unidades[uIdx]!;
        const [uRow] = (await manager.query(
          `INSERT INTO unidades_didacticas (nivel_id, codigo, nombre, creditos, horas_teoricas, horas_practicas, orden, activo)
           VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
           RETURNING id`,
          [nivelId, u.codigo, u.nombre, u.creditos, u.ht, u.hp, uIdx + 1],
        )) as { id: string }[];
        unidadIds.push(uRow!.id);
      }

      // Create Approved Evaluation Plan (Version 1) for this level:
      // 4 UD components (20% each) + 1 EFSRT component (unidadId: null, 20%) = 100%, 3 indicators per component = 15 indicators
      const estructuraV1 = {
        evaluaciones: [
          ...lvl.unidades.map((u, idx) => ({
            nombre: `UD${idx + 1}: ${u.nombre}`,
            unidadId: unidadIds[idx]!,
            pesoPct: '20.00',
            orden: idx + 1,
            indicadores: [
              {
                codigo: `U${idx + 1}-I1`,
                descripcion: `Desempeño práctico y participación activa en ${u.nombre}`,
                pesoPct: '30.00',
                orden: 1,
              },
              {
                codigo: `U${idx + 1}-I2`,
                descripcion: `Evaluación continua y control de progreso de la Unidad ${idx + 1}`,
                pesoPct: '30.00',
                orden: 2,
              },
              {
                codigo: `U${idx + 1}-I3`,
                descripcion: `Evaluación consolidada de logro modular de la Unidad ${idx + 1}`,
                pesoPct: '40.00',
                orden: 3,
              },
            ],
          })),
          {
            nombre: 'EFSRT: Experiencias Formativas en Situaciones Reales de Trabajo',
            unidadId: null,
            pesoPct: '20.00',
            orden: 5,
            indicadores: [
              {
                codigo: 'EFSRT-1',
                descripcion: 'Simulación comunicativa aplicada en entorno laboral / servicio',
                pesoPct: '40.00',
                orden: 1,
              },
              {
                codigo: 'EFSRT-2',
                descripcion: 'Presentación de portafolio o proyecto integrador del módulo',
                pesoPct: '30.00',
                orden: 2,
              },
              {
                codigo: 'EFSRT-3',
                descripcion: 'Sustentación oral frente a jurado o docente evaluador',
                pesoPct: '30.00',
                orden: 3,
              },
            ],
          },
        ],
      };

      const [planV1] = (await manager.query(
        `INSERT INTO planes_evaluacion (nivel_id, version, nombre, formula, estructura, estado, revision, creado_por)
         VALUES ($1, 1, $2, 'PONDERADA_JERARQUICA_V1', $3::jsonb, 'BORRADOR', 1, $4)
         RETURNING id`,
        [
          nivelId,
          `Plan Curricular Modular Oficial 2025-2026 — ${lvl.code}`,
          JSON.stringify(estructuraV1),
          adminId,
        ],
      )) as { id: string }[];

      await manager.query(
        `UPDATE planes_evaluacion
         SET estado = 'APROBADO',
             revision = 2,
             actualizado_at = CURRENT_TIMESTAMP,
             aprobado_por = $2,
             aprobado_at = CURRENT_TIMESTAMP,
             referencia_aprobacion = $3
         WHERE id = $1`,
        [
          planV1!.id,
          adminId,
          `Resolución Directoral N° 014-2025-CETPRO-EXCEL-CUSCO (${lvl.code})`,
        ],
      );

      // For 4 levels, also create a Version 2 BORRADOR plan so the user can test editing/approving drafts in Matriz Curricular
      if (['ING-B1', 'ING-I1', 'POR-B1', 'QUE-B1'].includes(lvl.code)) {
        await manager.query(
          `INSERT INTO planes_evaluacion (nivel_id, version, nombre, formula, estructura, estado, revision, creado_por)
           VALUES ($1, 2, $2, 'PONDERADA_JERARQUICA_V1', $3::jsonb, 'BORRADOR', 1, $4)`,
          [
            nivelId,
            `Propuesta Actualización Curricular 2026-II — ${lvl.code} (En revisión)`,
            JSON.stringify(estructuraV1),
            staffUserIds.coord_marco,
          ],
        );
      }

      nivelByCode.set(lvl.code, {
        id: nivelId,
        idiomaId,
        unidades: unidadIds,
        planAprobadoId: planV1!.id,
      });
    }

    // Insert periodos_academicos (3 periods)
    // Note: Period 2025-II starts as ABIERTO during seeding so we can insert sessions, grades, and close acts through DB triggers, then we mark it CERRADO at the end!
    const p2025Start = addDays(today, -175);
    const p2025End = addDays(today, -85);
    const p2026IStart = addDays(today, -65);
    const p2026IEnd = addDays(today, 45);
    const p2026IIStart = addDays(today, 55);
    const p2026IIEnd = addDays(today, 145);

    const [per2025II] = (await manager.query(
      `INSERT INTO periodos_academicos (codigo, nombre, fecha_inicio, fecha_fin, matricula_inicio, matricula_fin, estado)
       VALUES ('2025-II', 'Ciclo Académico Regular 2025-II', $1, $2, $3, $4, 'ABIERTO')
       RETURNING id`,
      [p2025Start, p2025End, addDays(p2025Start, -15), addDays(p2025Start, 15)],
    )) as { id: string }[];

    const [per2026I] = (await manager.query(
      `INSERT INTO periodos_academicos (codigo, nombre, fecha_inicio, fecha_fin, matricula_inicio, matricula_fin, estado)
       VALUES ('2026-I', 'Ciclo Académico Regular 2026-I (En Curso)', $1, $2, $3, $4, 'ABIERTO')
       RETURNING id`,
      [p2026IStart, p2026IEnd, addDays(p2026IStart, -15), addDays(today, 25)],
    )) as { id: string }[];

    const [per2026II] = (await manager.query(
      `INSERT INTO periodos_academicos (codigo, nombre, fecha_inicio, fecha_fin, matricula_inicio, matricula_fin, estado)
       VALUES ('2026-II', 'Ciclo Académico Regular 2026-II (Próximo)', $1, $2, $3, $4, 'PLANIFICADO')
       RETURNING id`,
      [p2026IIStart, p2026IIEnd, addDays(today, 15), addDays(p2026IIStart, 10)],
    )) as { id: string }[];

    // Insert turnos (5 shifts)
    const turnosSpec = [
      { key: 'M1', nombre: 'Mañana A (07:00 - 09:00)', hi: '07:00:00', hf: '09:00:00' },
      { key: 'M2', nombre: 'Mañana B (09:00 - 11:00)', hi: '09:00:00', hf: '11:00:00' },
      { key: 'T1', nombre: 'Tarde (16:00 - 18:00)', hi: '16:00:00', hf: '18:00:00' },
      { key: 'N1', nombre: 'Noche (18:30 - 20:30)', hi: '18:30:00', hf: '20:30:00' },
      { key: 'SAB', nombre: 'Sabatino Intensivo (08:00 - 13:00)', hi: '08:00:00', hf: '13:00:00' },
    ];
    const turnoByKey = new Map<string, { id: number; hi: string; hf: string }>();
    for (const tr of turnosSpec) {
      const [row] = (await manager.query(
        `INSERT INTO turnos (nombre, hora_inicio, hora_fin, activo) VALUES ($1, $2, $3, TRUE) RETURNING id`,
        [tr.nombre, tr.hi, tr.hf],
      )) as { id: number }[];
      turnoByKey.set(tr.key, { id: row!.id, hi: tr.hi, hf: tr.hf });
    }

    // Insert secciones (4 sections)
    const seccionesSpec = [
      { codigo: 'SEC-A', nombre: 'Sección A - Regular' },
      { codigo: 'SEC-B', nombre: 'Sección B - Regular' },
      { codigo: 'SEC-C', nombre: 'Sección C - Vespertino' },
      { codigo: 'INT-U', nombre: 'Sección Única Intensiva' },
    ];
    const seccionByCode = new Map<string, number>();
    for (const sc of seccionesSpec) {
      const [row] = (await manager.query(
        `INSERT INTO secciones (codigo, nombre, activo) VALUES ($1, $2, TRUE) RETURNING id`,
        [sc.codigo, sc.nombre],
      )) as { id: number }[];
      seccionByCode.set(sc.codigo, row!.id);
    }

    // Define 18 Groups across the 3 periods
    type GroupScenario =
      | 'HIST_CLOSED'        // 2025-II: Attendance closed + Act closed + Group & Period transitioned to CERRADO
      | 'CURR_ACT_CLOSED'    // 2026-I: Attendance closed + Act closed
      | 'CURR_READY_ACT'     // 2026-I: Attendance closed + 100% grades ready -> 1-click "Emitir Acta Oficial"
      | 'CURR_READY_ATT'     // 2026-I: 100% sessions & marks ready + 100% grades -> 1-click "Cerrar Asistencia"
      | 'CURR_IN_PROGRESS'   // 2026-I: Active daily operation (realized + scheduled sessions, pending justifications, partial grades, pending enrollments)
      | 'NEXT_PLANNED';      // 2026-II: Planned groups

    type GroupSeedSpec = {
      codigo: string;
      periodoId: string;
      parametroId: string;
      baseDate: string;
      nivelCode: string;
      turnoKey: string;
      seccionCode: string;
      capacidad: number;
      titularCode: string;
      apoyoCode?: string;
      scenario: GroupScenario;
      activeStudentsStart: number;
      activeStudentsCount: number;
      pendingStudentsStart?: number;
      pendingStudentsCount?: number;
    };

    const groupsSpec: GroupSeedSpec[] = [
      // --- 5 Groups in 2025-II (Historical Closed) ---
      {
        codigo: 'G-2025II-ING-B1-A',
        periodoId: per2025II!.id,
        parametroId: paramV1!.id,
        baseDate: addDays(p2025Start, 5),
        nivelCode: 'ING-B1',
        turnoKey: 'M1',
        seccionCode: 'SEC-A',
        capacidad: 25,
        titularCode: 'DOC-2024-001',
        scenario: 'HIST_CLOSED',
        activeStudentsStart: 0,
        activeStudentsCount: 20,
      },
      {
        codigo: 'G-2025II-ING-B2-A',
        periodoId: per2025II!.id,
        parametroId: paramV1!.id,
        baseDate: addDays(p2025Start, 6),
        nivelCode: 'ING-B2',
        turnoKey: 'M2',
        seccionCode: 'SEC-A',
        capacidad: 25,
        titularCode: 'DOC-2024-002',
        scenario: 'HIST_CLOSED',
        activeStudentsStart: 20,
        activeStudentsCount: 20,
      },
      {
        codigo: 'G-2025II-POR-B1-A',
        periodoId: per2025II!.id,
        parametroId: paramV1!.id,
        baseDate: addDays(p2025Start, 5),
        nivelCode: 'POR-B1',
        turnoKey: 'T1',
        seccionCode: 'SEC-A',
        capacidad: 25,
        titularCode: 'DOC-2024-003',
        scenario: 'HIST_CLOSED',
        activeStudentsStart: 40,
        activeStudentsCount: 20,
      },
      {
        codigo: 'G-2025II-QUE-B1-A',
        periodoId: per2025II!.id,
        parametroId: paramV1!.id,
        baseDate: addDays(p2025Start, 7),
        nivelCode: 'QUE-B1',
        turnoKey: 'N1',
        seccionCode: 'SEC-C',
        capacidad: 25,
        titularCode: 'DOC-2025-005',
        scenario: 'HIST_CLOSED',
        activeStudentsStart: 60,
        activeStudentsCount: 20,
      },
      {
        codigo: 'G-2025II-FRA-B1-A',
        periodoId: per2025II!.id,
        parametroId: paramV1!.id,
        baseDate: addDays(p2025Start, 6),
        nivelCode: 'FRA-B1',
        turnoKey: 'M2',
        seccionCode: 'SEC-B',
        capacidad: 25,
        titularCode: 'DOC-2025-006',
        scenario: 'HIST_CLOSED',
        activeStudentsStart: 80,
        activeStudentsCount: 20,
      },

      // --- 10 Groups in 2026-I (Current Active Period) ---
      // Scenario A: 2 Groups already with Attendance Closed + Act Closed in 2026-I
      {
        codigo: 'G-2026I-ING-B1-INT',
        periodoId: per2026I!.id,
        parametroId: paramV2!.id,
        baseDate: addDays(p2026IStart, 3),
        nivelCode: 'ING-B1',
        turnoKey: 'M1',
        seccionCode: 'INT-U',
        capacidad: 25,
        titularCode: 'DOC-2024-001',
        apoyoCode: 'DOC-2025-008',
        scenario: 'CURR_ACT_CLOSED',
        activeStudentsStart: 100,
        activeStudentsCount: 22,
      },
      {
        codigo: 'G-2026I-POR-B1-INT',
        periodoId: per2026I!.id,
        parametroId: paramV2!.id,
        baseDate: addDays(p2026IStart, 4),
        nivelCode: 'POR-B1',
        turnoKey: 'T1',
        seccionCode: 'INT-U',
        capacidad: 25,
        titularCode: 'DOC-2024-003',
        scenario: 'CURR_ACT_CLOSED',
        activeStudentsStart: 122,
        activeStudentsCount: 20,
      },
      // Scenario B: 2 Groups with Attendance Closed + 100% Grades Ready -> 1-click "Cerrar Acta"
      {
        codigo: 'G-2026I-ING-B2-A',
        periodoId: per2026I!.id,
        parametroId: paramV2!.id,
        baseDate: addDays(p2026IStart, 5),
        nivelCode: 'ING-B2',
        turnoKey: 'M2',
        seccionCode: 'SEC-A',
        capacidad: 25,
        titularCode: 'DOC-2024-002',
        scenario: 'CURR_READY_ACT',
        activeStudentsStart: 0, // Students 0..17 promoted from G-2025II-ING-B1-A + 4 more!
        activeStudentsCount: 22,
      },
      {
        codigo: 'G-2026I-POR-B2-A',
        periodoId: per2026I!.id,
        parametroId: paramV2!.id,
        baseDate: addDays(p2026IStart, 5),
        nivelCode: 'POR-B2',
        turnoKey: 'N1',
        seccionCode: 'SEC-A',
        capacidad: 25,
        titularCode: 'DOC-2025-007',
        scenario: 'CURR_READY_ACT',
        activeStudentsStart: 40, // Students 40..59 promoted from G-2025II-POR-B1-A!
        activeStudentsCount: 20,
      },
      // Scenario C: 2 Groups with 100% Realized Sessions & Marks + 100% Grades -> 1-click "Cerrar Asistencia"
      {
        codigo: 'G-2026I-ING-I1-A',
        periodoId: per2026I!.id,
        parametroId: paramV2!.id,
        baseDate: addDays(p2026IStart, 6),
        nivelCode: 'ING-I1',
        turnoKey: 'T1',
        seccionCode: 'SEC-A',
        capacidad: 25,
        titularCode: 'DOC-2024-004',
        apoyoCode: 'DOC-2024-001',
        scenario: 'CURR_READY_ATT',
        activeStudentsStart: 20, // Students 20..39 promoted from G-2025II-ING-B2-A!
        activeStudentsCount: 20,
      },
      {
        codigo: 'G-2026I-QUE-B1-A',
        periodoId: per2026I!.id,
        parametroId: paramV2!.id,
        baseDate: addDays(p2026IStart, 6),
        nivelCode: 'QUE-B1',
        turnoKey: 'N1',
        seccionCode: 'SEC-B',
        capacidad: 25,
        titularCode: 'DOC-2025-005',
        scenario: 'CURR_READY_ATT',
        activeStudentsStart: 142,
        activeStudentsCount: 20,
      },
      // Scenario D: 4 Groups in Progress (Daily operation: sessions realized + scheduled, pending justifications, partial grades, pending enrollments, available capacity)
      {
        codigo: 'G-2026I-ING-I2-A',
        periodoId: per2026I!.id,
        parametroId: paramV2!.id,
        baseDate: addDays(p2026IStart, 10),
        nivelCode: 'ING-I2',
        turnoKey: 'M1',
        seccionCode: 'SEC-A',
        capacidad: 30,
        titularCode: 'DOC-2025-008',
        apoyoCode: 'DOC-2024-004',
        scenario: 'CURR_IN_PROGRESS',
        activeStudentsStart: 162,
        activeStudentsCount: 20,
        pendingStudentsStart: 242,
        pendingStudentsCount: 7,
      },
      {
        codigo: 'G-2026I-ING-AV-A',
        periodoId: per2026I!.id,
        parametroId: paramV2!.id,
        baseDate: addDays(p2026IStart, 10),
        nivelCode: 'ING-AV',
        turnoKey: 'N1',
        seccionCode: 'SEC-C',
        capacidad: 28,
        titularCode: 'DOC-2024-002',
        scenario: 'CURR_IN_PROGRESS',
        activeStudentsStart: 182,
        activeStudentsCount: 18,
        pendingStudentsStart: 249,
        pendingStudentsCount: 7,
      },
      {
        codigo: 'G-2026I-POR-IN-A',
        periodoId: per2026I!.id,
        parametroId: paramV2!.id,
        baseDate: addDays(p2026IStart, 11),
        nivelCode: 'POR-IN',
        turnoKey: 'SAB',
        seccionCode: 'INT-U',
        capacidad: 28,
        titularCode: 'DOC-2024-003',
        apoyoCode: 'DOC-2025-007',
        scenario: 'CURR_IN_PROGRESS',
        activeStudentsStart: 200,
        activeStudentsCount: 20,
        pendingStudentsStart: 256,
        pendingStudentsCount: 8,
      },
      {
        codigo: 'G-2026I-FRA-B1-A',
        periodoId: per2026I!.id,
        parametroId: paramV2!.id,
        baseDate: addDays(p2026IStart, 11),
        nivelCode: 'FRA-B1',
        turnoKey: 'T1',
        seccionCode: 'SEC-B',
        capacidad: 28,
        titularCode: 'DOC-2025-006',
        scenario: 'CURR_IN_PROGRESS',
        activeStudentsStart: 220,
        activeStudentsCount: 22,
        pendingStudentsStart: 264,
        pendingStudentsCount: 8,
      },

      // --- 3 Groups in 2026-II (Planned Next Period) ---
      {
        codigo: 'G-2026II-ING-B1-A',
        periodoId: per2026II!.id,
        parametroId: paramV2!.id,
        baseDate: addDays(p2026IIStart, 3),
        nivelCode: 'ING-B1',
        turnoKey: 'M1',
        seccionCode: 'SEC-A',
        capacidad: 30,
        titularCode: 'DOC-2024-001',
        scenario: 'NEXT_PLANNED',
        activeStudentsStart: 0,
        activeStudentsCount: 0,
      },
      {
        codigo: 'G-2026II-POR-B1-A',
        periodoId: per2026II!.id,
        parametroId: paramV2!.id,
        baseDate: addDays(p2026IIStart, 3),
        nivelCode: 'POR-B1',
        turnoKey: 'T1',
        seccionCode: 'SEC-A',
        capacidad: 30,
        titularCode: 'DOC-2025-007',
        scenario: 'NEXT_PLANNED',
        activeStudentsStart: 0,
        activeStudentsCount: 0,
      },
      {
        codigo: 'G-2026II-QUE-B1-A',
        periodoId: per2026II!.id,
        parametroId: paramV2!.id,
        baseDate: addDays(p2026IIStart, 4),
        nivelCode: 'QUE-B1',
        turnoKey: 'N1',
        seccionCode: 'SEC-C',
        capacidad: 25,
        titularCode: 'DOC-2025-005',
        scenario: 'NEXT_PLANNED',
        activeStudentsStart: 0,
        activeStudentsCount: 0,
      },
    ];

    const groupsToCloseAttendance: {
      groupId: string;
      scenario: GroupScenario;
      idiomaCode: string;
      nivelId: string;
      periodoId: string;
    }[] = [];
    const historicalGroupIds: string[] = [];

    let voucherSeq = 1001;
    const attemptsByStudentLevel = new Map<string, number>();
    const nextAttemptFor = (estId: string, nivelId: string) => {
      const key = `${estId}:${nivelId}`;
      const next = (attemptsByStudentLevel.get(key) ?? 0) + 1;
      attemptsByStudentLevel.set(key, next);
      return next;
    };

    for (let gIdx = 0; gIdx < groupsSpec.length; gIdx++) {
      const gs = groupsSpec[gIdx]!;
      const nivel = nivelByCode.get(gs.nivelCode)!;
      const turno = turnoByKey.get(gs.turnoKey)!;
      const seccionId = seccionByCode.get(gs.seccionCode)!;
      const initialEstado = gs.scenario === 'NEXT_PLANNED' ? 'PLANIFICADO' : 'ACTIVO';

      const [gRow] = (await manager.query(
        `INSERT INTO grupos (periodo_id, nivel_id, turno_id, seccion_id, codigo, capacidad, estado)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          gs.periodoId,
          nivel.id,
          turno.id,
          seccionId,
          gs.codigo,
          gs.capacidad,
          initialEstado,
        ],
      )) as { id: string }[];
      const groupId = gRow!.id;

      if (gs.scenario === 'HIST_CLOSED') {
        historicalGroupIds.push(groupId);
      }

      // Assign titular & support teachers in grupo_docentes
      const titular = teacherByCode.get(gs.titularCode)!;
      await manager.query(
        `INSERT INTO grupo_docentes (grupo_id, docente_id, es_titular, fecha_asignacion, activo)
         VALUES ($1, $2, TRUE, $3, TRUE)`,
        [groupId, titular.docenteId, addDays(gs.baseDate, -10)],
      );
      if (gs.apoyoCode) {
        const apoyo = teacherByCode.get(gs.apoyoCode)!;
        await manager.query(
          `INSERT INTO grupo_docentes (grupo_id, docente_id, es_titular, fecha_asignacion, activo)
           VALUES ($1, $2, FALSE, $3, TRUE)`,
          [groupId, apoyo.docenteId, addDays(gs.baseDate, -8)],
        );
      }

      if (gs.scenario === 'NEXT_PLANNED') {
        continue;
      }

      // Apply Evaluation Plan to the group (configuraciones_evaluacion_grupo + evaluaciones + indicadores_evaluacion)
      const [cfgRow] = (await manager.query(
        `INSERT INTO configuraciones_evaluacion_grupo (grupo_id, nivel_id, plan_id, aplicado_por)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [groupId, nivel.id, nivel.planAprobadoId, adminId],
      )) as { id: string }[];
      const configId = cfgRow!.id;

      await manager.query(
        "SELECT set_config('excel.evaluation_configuration', $1, true)",
        [configId],
      );

      const [planRow] = (await manager.query(
        `SELECT estructura FROM planes_evaluacion WHERE id = $1`,
        [nivel.planAprobadoId],
      )) as {
        estructura: {
          evaluaciones: {
            nombre: string;
            unidadId: string | null;
            pesoPct: string;
            orden: number;
            indicadores: {
              codigo: string;
              descripcion: string;
              pesoPct: string;
              orden: number;
            }[];
          }[];
        };
      }[];

      const indicatorIds: string[] = [];
      for (const ev of planRow!.estructura.evaluaciones) {
        const [evRow] = (await manager.query(
          `INSERT INTO evaluaciones (grupo_id, configuracion_id, unidad_id, nombre, peso_pct, orden, activo)
           VALUES ($1, $2, $3, $4, $5, $6, TRUE)
           RETURNING id`,
          [groupId, configId, ev.unidadId, ev.nombre, ev.pesoPct, ev.orden],
        )) as { id: string }[];
        for (const ind of ev.indicadores) {
          const [indRow] = (await manager.query(
            `INSERT INTO indicadores_evaluacion (evaluacion_id, grupo_id, codigo, descripcion, peso_pct, orden, activo)
             VALUES ($1, $2, $3, $4, $5, $6, TRUE)
             RETURNING id`,
            [evRow!.id, groupId, ind.codigo, ind.descripcion, ind.pesoPct, ind.orden],
          )) as { id: string }[];
          indicatorIds.push(indRow!.id);
        }
      }

      // Enroll active students (with VALIDADO vouchers)
      const activeEnrollmentIds: string[] = [];
      const importe = gs.nivelCode.includes('AV')
        ? '220.00'
        : gs.nivelCode.includes('I')
          ? '180.00'
          : '150.00';

      for (let i = 0; i < gs.activeStudentsCount; i++) {
        const studentIdx = gs.activeStudentsStart + i;
        const estId = studentIds[studentIdx]!;
        const vNum = `B001-${String(voucherSeq++).padStart(6, '0')}`;
        const payDate = addDays(gs.baseDate, -5 + (i % 4));
        const secId = i % 2 === 0 ? staffUserIds.sec_lucia! : staffUserIds.sec_carmen!;

        const [vRow] = (await manager.query(
          `INSERT INTO vouchers (estudiante_id, numero, fecha_pago, importe, estado, observacion, validado_por, validado_at)
           VALUES ($1, $2, $3, $4, 'VALIDADO', 'Depósito verificado en recaudación institucional', $5, ($3::date + INTERVAL '10 hours')::timestamptz)
           RETURNING id`,
          [estId, vNum, payDate, importe, secId],
        )) as { id: string }[];

        const matCode = `MAT-${gs.codigo}-${String(i + 1).padStart(3, '0')}`;
        const attemptNum = nextAttemptFor(estId, nivel.id);
        const [mRow] = (await manager.query(
          `INSERT INTO matriculas (codigo, estudiante_id, grupo_id, nivel_id, voucher_id, parametro_id, numero_intento, fecha_matricula, estado, registrado_por, clave_solicitud)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVA', $9, $10)
           RETURNING id`,
          [
            matCode,
            estId,
            groupId,
            nivel.id,
            vRow!.id,
            gs.parametroId,
            attemptNum,
            payDate,
            secId,
            randomUUID(),
          ],
        )) as { id: string }[];
        activeEnrollmentIds.push(mRow!.id);
      }

      // Also add 1 ANULADA enrollment per group (total 15 ANULADA enrollments) using spare students 272..286
      const canceledStudentId = studentIds[272 + (gIdx % 15)]!;
      const canceledAttempt = nextAttemptFor(canceledStudentId, nivel.id);
      await manager.query(
        `INSERT INTO matriculas (codigo, estudiante_id, grupo_id, nivel_id, voucher_id, parametro_id, numero_intento, fecha_matricula, estado, motivo_anulacion, registrado_por, clave_solicitud)
         VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, 'ANULADA', 'Solicitud de cambio de horario por cruce de estudios universitarios', $8, $9)`,
        [
          `MAT-${gs.codigo}-ANU-01`,
          canceledStudentId,
          groupId,
          nivel.id,
          gs.parametroId,
          canceledAttempt,
          addDays(gs.baseDate, -3),
          staffUserIds.sec_lucia!,
          randomUUID(),
        ],
      );

      // For CURR_IN_PROGRESS groups, also insert PENDIENTE enrollments (waiting for voucher activation)
      if (
        gs.scenario === 'CURR_IN_PROGRESS' &&
        gs.pendingStudentsStart !== undefined &&
        gs.pendingStudentsCount
      ) {
        for (let pIdx = 0; pIdx < gs.pendingStudentsCount; pIdx++) {
          const estId = studentIds[gs.pendingStudentsStart + pIdx]!;
          const pendingAttempt = nextAttemptFor(estId, nivel.id);
          await manager.query(
            `INSERT INTO matriculas (codigo, estudiante_id, grupo_id, nivel_id, voucher_id, parametro_id, numero_intento, fecha_matricula, estado, registrado_por, clave_solicitud)
             VALUES ($1, $2, $3, $4, NULL, $5, $6, $7, 'PENDIENTE', $8, $9)`,
            [
              `MAT-${gs.codigo}-PEN-${String(pIdx + 1).padStart(2, '0')}`,
              estId,
              groupId,
              nivel.id,
              gs.parametroId,
              pendingAttempt,
              addDays(today, -3 + (pIdx % 3)),
              staffUserIds.sec_carmen!,
              randomUUID(),
            ],
          );
        }
      }

      // Also add second-attempt (numero_intento = 2) enrollments in G-2026I-ING-B1-INT for the 2 students (idx 18, 19) who failed/withdrew in G-2025II-ING-B1-A!
      if (gs.codigo === 'G-2026I-ING-B1-INT') {
        for (const retryStudentIdx of [18, 19]) {
          const estId = studentIds[retryStudentIdx]!;
          const vNum = `B001-${String(voucherSeq++).padStart(6, '0')}`;
          const payDate = addDays(gs.baseDate, -2);
          const retryAttempt = nextAttemptFor(estId, nivel.id);
          const [vRow] = (await manager.query(
            `INSERT INTO vouchers (estudiante_id, numero, fecha_pago, importe, estado, observacion, validado_por, validado_at)
             VALUES ($1, $2, $3, '150.00', 'VALIDADO', 'Matrícula de repitencia autorizada (2do intento)', $4, ($3::date + INTERVAL '9 hours')::timestamptz)
             RETURNING id`,
            [estId, vNum, payDate, staffUserIds.sec_lucia!],
          )) as { id: string }[];
          const [mRow] = (await manager.query(
            `INSERT INTO matriculas (codigo, estudiante_id, grupo_id, nivel_id, voucher_id, parametro_id, numero_intento, fecha_matricula, estado, registrado_por, clave_solicitud)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVA', $9, $10)
             RETURNING id`,
            [
              `MAT-${gs.codigo}-INT2-${retryStudentIdx}`,
              estId,
              groupId,
              nivel.id,
              vRow!.id,
              gs.parametroId,
              retryAttempt,
              payDate,
              staffUserIds.sec_lucia!,
              randomUUID(),
            ],
          )) as { id: string }[];
          activeEnrollmentIds.push(mRow!.id);
        }
      }

      // Create Class Sessions (sesiones_clase)
      // Closed / Ready groups: 12 REALIZADA + 1 CANCELADA sessions (all <= today)
      // In-Progress groups: 9 REALIZADA (<= today) + 4 PROGRAMADA (> today) + 1 CANCELADA
      const realizedSessionIds: { id: string; fecha: string }[] = [];
      if (gs.scenario === 'CURR_IN_PROGRESS') {
        for (let s = 0; s < 9; s++) {
          const fecha = addDays(today, -36 + s * 4);
          const [sRow] = (await manager.query(
            `INSERT INTO sesiones_clase (grupo_id, fecha, hora_inicio, hora_fin, estado, creado_por)
             VALUES ($1, $2, $3, $4, 'REALIZADA', $5)
             RETURNING id`,
            [groupId, fecha, turno.hi, turno.hf, titular.usuarioId],
          )) as { id: string }[];
          realizedSessionIds.push({ id: sRow!.id, fecha });
        }
        // 1 CANCELADA session in the past
        await manager.query(
          `INSERT INTO sesiones_clase (grupo_id, fecha, hora_inicio, hora_fin, estado, creado_por)
           VALUES ($1, $2, $3, $4, 'CANCELADA', $5)`,
          [groupId, addDays(today, -5), turno.hi, turno.hf, adminId],
        );
        // 4 PROGRAMADA future sessions
        for (let f = 1; f <= 4; f++) {
          await manager.query(
            `INSERT INTO sesiones_clase (grupo_id, fecha, hora_inicio, hora_fin, estado, creado_por)
             VALUES ($1, $2, $3, $4, 'PROGRAMADA', $5)`,
            [groupId, addDays(today, f * 4), turno.hi, turno.hf, titular.usuarioId],
          );
        }
      } else {
        for (let s = 0; s < 12; s++) {
          const fecha = addDays(gs.baseDate, s * 4);
          const [sRow] = (await manager.query(
            `INSERT INTO sesiones_clase (grupo_id, fecha, hora_inicio, hora_fin, estado, creado_por)
             VALUES ($1, $2, $3, $4, 'REALIZADA', $5)
             RETURNING id`,
            [groupId, fecha, turno.hi, turno.hf, titular.usuarioId],
          )) as { id: string }[];
          realizedSessionIds.push({ id: sRow!.id, fecha });
        }
        await manager.query(
          `INSERT INTO sesiones_clase (grupo_id, fecha, hora_inicio, hora_fin, estado, creado_por)
           VALUES ($1, $2, $3, $4, 'CANCELADA', $5)`,
          [groupId, addDays(gs.baseDate, 49), turno.hi, turno.hf, adminId],
        );
      }

      // Insert Attendance Marks (asistencias) & Justifications (justificaciones)
      for (let mIdx = 0; mIdx < activeEnrollmentIds.length; mIdx++) {
        const matId = activeEnrollmentIds[mIdx]!;
        const isDpiStudent = mIdx === activeEnrollmentIds.length - 1; // Last student in group exceeds 30% absences (DPI)

        for (let sIdx = 0; sIdx < realizedSessionIds.length; sIdx++) {
          const ses = realizedSessionIds[sIdx]!;
          let codigo: 'P' | 'F' | 'T' | 'J' = 'P';
          let obs: string | null = null;

          if (isDpiStudent && sIdx < 5) {
            codigo = 'F';
            obs = 'Inasistencia reiterada sin justificación';
          } else if (mIdx < 6 && sIdx === (mIdx % realizedSessionIds.length)) {
            codigo = 'J';
            obs = 'Solicitud de justificación documentada';
          } else if ((mIdx + sIdx) % 11 === 0) {
            codigo = 'T';
            obs = 'Ingreso con 12 minutos de retraso';
          } else if (!isDpiStudent && (mIdx + sIdx) % 19 === 0 && sIdx > 5) {
            codigo = 'F';
          }

          const [aRow] = (await manager.query(
            `INSERT INTO asistencias (grupo_id, sesion_id, matricula_id, codigo, observacion, registrado_por, version)
             VALUES ($1, $2, $3, $4, $5, $6, 1)
             RETURNING id`,
            [groupId, ses.id, matId, codigo, obs, titular.usuarioId],
          )) as { id: string }[];

          // If mark is 'J', create a justification record and transition it through its lifecycle
          if (codigo === 'J') {
            const motivos = [
              'Certificado médico de atención de urgencia en EsSalud Cusco',
              'Constancia de comisión laboral emitida por entidad empleadora',
              'Citación judicial / trámite documentario impostergable en RENIEC',
              'Evaluación parcial presencial programada en la UNSAAC',
              'Descanso médico odontológico acreditado con receta y boleta',
              'Viaje familiar de emergencia por motivos de salud comprobados',
            ];
            const motivo = motivos[mIdx % motivos.length]!;
            const fechaPres = addDays(ses.fecha, 1) <= today ? addDays(ses.fecha, 1) : ses.fecha;

            const [jRow] = (await manager.query(
              `INSERT INTO justificaciones (asistencia_id, codigo_asistencia, motivo, fecha_presentacion, estado, registrado_por, version)
               VALUES ($1, 'J', $2, $3, 'PENDIENTE', $4, 1)
               RETURNING id`,
              [aRow!.id, motivo, fechaPres, staffUserIds.sec_lucia!],
            )) as { id: string }[];

            // For closed/ready groups, resolve all justifications so 0 are left pending;
            // For CURR_IN_PROGRESS groups, leave mIdx === 0 and mIdx === 1 as PENDIENTE so the user can resolve them live!
            if (gs.scenario === 'CURR_IN_PROGRESS' && mIdx < 2) {
              continue;
            }

            if (mIdx % 3 === 2) {
              // Transition PENDIENTE -> RECHAZADA (version 2)
              await manager.query(
                `UPDATE justificaciones
                 SET estado = 'RECHAZADA',
                     version = 2,
                     observacion_resolucion = 'Documento presentado fuera de plazo o sin sello legible de la entidad.',
                     resuelto_por = $2,
                     resuelto_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [jRow!.id, adminId],
              );
            } else {
              // Transition PENDIENTE -> APROBADA (version 2)
              await manager.query(
                `UPDATE justificaciones
                 SET estado = 'APROBADA',
                     version = 2,
                     observacion_resolucion = 'Sustento documentario verificado conforme al reglamento académico.',
                     resuelto_por = $2,
                     resuelto_at = CURRENT_TIMESTAMP
                 WHERE id = $1`,
                [jRow!.id, adminId],
              );

              if (mIdx % 2 === 0) {
                // Transition APROBADA -> RECUPERADA (version 3)
                await manager.query(
                  `UPDATE justificaciones
                   SET estado = 'RECUPERADA',
                       version = 3,
                       observacion_recuperacion = 'Recuperó satisfactoriamente la práctica y evaluación en tutoría.',
                       recuperacion_confirmada_por = $2,
                       recuperacion_at = CURRENT_TIMESTAMP
                   WHERE id = $1`,
                  [jRow!.id, titular.usuarioId],
                );
              } else if (gs.scenario !== 'CURR_IN_PROGRESS') {
                // Transition APROBADA -> NO_RECUPERADA (version 3) in closed/ready groups so justificadasPendientes = 0
                await manager.query(
                  `UPDATE justificaciones
                   SET estado = 'NO_RECUPERADA',
                       version = 3,
                       observacion_recuperacion = 'El estudiante no asistió a la sesión de recuperación programada.',
                       recuperacion_confirmada_por = $2,
                       recuperacion_at = CURRENT_TIMESTAMP
                   WHERE id = $1`,
                  [jRow!.id, titular.usuarioId],
                );
              }
            }
          }
        }
      }

      // Insert Grades (calificaciones)
      // Closed / Ready groups get 100% of indicators (15/15);
      // In-Progress groups get 12/15 indicators (UD1..UD4 complete, EFSRT pending so teachers can grade live!)
      const indicatorsToGrade =
        gs.scenario === 'CURR_IN_PROGRESS'
          ? indicatorIds.slice(0, 12)
          : indicatorIds;

      for (let mIdx = 0; mIdx < activeEnrollmentIds.length; mIdx++) {
        const matId = activeEnrollmentIds[mIdx]!;
        const isFailingStudent = mIdx === activeEnrollmentIds.length - 2; // Second-to-last student fails by grade (10..12)
        const isTopStudent = mIdx < 4;

        for (let iIdx = 0; iIdx < indicatorsToGrade.length; iIdx++) {
          const indId = indicatorsToGrade[iIdx]!;
          let baseScore: number;
          if (isFailingStudent) {
            baseScore = 9 + ((mIdx + iIdx) % 4); // 9..12 -> DESAPROBADO (<13)
          } else if (isTopStudent) {
            baseScore = 17 + ((mIdx + iIdx) % 4); // 17..20 -> Excelente
          } else {
            baseScore = 13 + ((mIdx * 3 + iIdx) % 6); // 13..18 -> APROBADO
          }
          const decimal = (mIdx + iIdx) % 3 === 0 ? '.50' : '.00';
          const nota = baseScore === 20 ? '20.00' : `${baseScore}${decimal}`;

          await manager.query(
            `INSERT INTO calificaciones (matricula_id, indicador_id, grupo_id, nota, registrado_por, version)
             VALUES ($1, $2, $3, $4, $5, 1)`,
            [matId, indId, groupId, nota, titular.usuarioId],
          );
        }
      }

      if (
        gs.scenario === 'HIST_CLOSED' ||
        gs.scenario === 'CURR_ACT_CLOSED' ||
        gs.scenario === 'CURR_READY_ACT'
      ) {
        groupsToCloseAttendance.push({
          groupId,
          scenario: gs.scenario,
          idiomaCode: gs.nivelCode.slice(0, 3),
          nivelId: nivel.id,
          periodoId: gs.periodoId,
        });
      }
    }

    // Insert additional standalone Vouchers (Disponibles sin Vincular, Por Revisar PENDIENTE, RECHAZADO, and Duplicados Autorizados)
    // 1. 25 VALIDADO unlinked vouchers (for "Disponibles sin Vincular" tab & 1-click enrollment)
    for (let i = 0; i < 25; i++) {
      const estId = studentIds[242 + i]!;
      const vNum = `OP-BCP-2026-${String(8800 + i)}`;
      const payDate = addDays(today, -6 + (i % 5));
      await manager.query(
        `INSERT INTO vouchers (estudiante_id, numero, fecha_pago, importe, estado, observacion, validado_por, validado_at)
         VALUES ($1, $2, $3, $4, 'VALIDADO', 'Voucher validado disponible para vincular a matrícula nueva o pendiente', $5, CURRENT_TIMESTAMP - INTERVAL '1 day')`,
        [
          estId,
          vNum,
          payDate,
          i % 2 === 0 ? '180.00' : '150.00',
          staffUserIds.sec_lucia!,
        ],
      );
    }

    // 2. 5 VALIDADO vouchers with authorized duplicate numbers (duplicado_autorizado_por & duplicado_motivo)
    for (let i = 0; i < 5; i++) {
      const estId = studentIds[267 + i]!;
      await manager.query(
        `INSERT INTO vouchers (estudiante_id, numero, fecha_pago, importe, estado, observacion, validado_por, validado_at, duplicado_autorizado_por, duplicado_motivo)
         VALUES ($1, $2, $3, '180.00', 'VALIDADO', 'Pago corporativo / familiar verificado en extracto bancario', $4, CURRENT_TIMESTAMP - INTERVAL '2 days', $5, 'Depósito mancomunado de hermanos/convenio institucional autorizado por Dirección')`,
        [
          estId,
          `B001-00100${i + 1}`,
          addDays(today, -8),
          staffUserIds.sec_carmen!,
          adminId,
        ],
      );
    }

    // 3. 35 PENDIENTE vouchers (for "Por Revisar" inbox tab)
    const pendingObs = [
      'Transferencia interbancaria BBVA pendiente de conciliación con tesorería',
      'Depósito en agente KasNet — verificar abono en cuenta recaudadora',
      'Comprobante Yape / Plin institucional registrado en ventanilla',
      'Boleta manual emitida en turno noche pendiente de arqueo de caja',
    ];
    for (let i = 0; i < 35; i++) {
      const estId = studentIds[(150 + i * 3) % 290]!;
      const vNum = `CAJA-2026-P${String(401 + i)}`;
      const payDate = addDays(today, -(i % 7));
      const importe = i % 3 === 0 ? '220.00' : i % 2 === 0 ? '180.00' : '150.00';
      await manager.query(
        `INSERT INTO vouchers (estudiante_id, numero, fecha_pago, importe, estado, observacion)
         VALUES ($1, $2, $3, $4, 'PENDIENTE', $5)`,
        [estId, vNum, payDate, importe, pendingObs[i % pendingObs.length]],
      );
    }

    // 4. 20 RECHAZADO vouchers (for "Rechazados" tab)
    const rejectReasons = [
      'El número de operación no figura en el extracto bancario del BCP de la fecha indicada.',
      'Importe incompleto (S/ 50.00); no cubre el derecho mínimo de matrícula del nivel.',
      'Imagen / comprobante físico con enmendaduras en la fecha y monto de operación.',
      'Comprobante corresponde a otro concepto (certificado de estudios) y no a matrícula.',
    ];
    for (let i = 0; i < 20; i++) {
      const estId = studentIds[(180 + i * 4) % 290]!;
      const vNum = `OBS-2026-R${String(901 + i)}`;
      const payDate = addDays(today, -12 + (i % 8));
      await manager.query(
        `INSERT INTO vouchers (estudiante_id, numero, fecha_pago, importe, estado, observacion, validado_por, validado_at)
         VALUES ($1, $2, $3, '150.00', 'RECHAZADO', $4, $5, CURRENT_TIMESTAMP - INTERVAL '3 days')`,
        [
          estId,
          vNum,
          payDate,
          rejectReasons[i % rejectReasons.length],
          staffUserIds.sec_carmen!,
        ],
      );
    }

    return {
      adminId,
      adminSessionId,
      staffUserIds,
      per2025IIId: per2025II!.id,
      historicalGroupIds,
      groupsToCloseAttendance,
    };
  });

  // 3. Execute official Attendance Closures & Act Closures through the real NestJS services
  // so every SHA-256 revision, JSONB snapshot, and PostgreSQL trigger validation runs 100% natively!
  const auditService = new AuditService(source);
  const attendanceCalc = new AttendanceCalculationService();
  const attendanceClosureService = new AttendanceClosureService(
    source,
    auditService,
    attendanceCalc,
  );
  const gradeCalc = new GradeCalculationService();
  const resultCalc = new ResultCalculationService(attendanceCalc, gradeCalc);
  const evalRepo = new EvaluationRepository();
  const gradesRepo = new GradesRepository();
  const actRepo = new ActRepository();
  const attendanceService = new AttendanceService(
    source,
    auditService,
    attendanceCalc,
  );
  const actService = new ActService(
    source,
    actRepo,
    evalRepo,
    gradesRepo,
    resultCalc,
    attendanceService,
    auditService,
  );

  const adminActor: Identity = {
    id: ids.adminId,
    nombre_usuario: 'admin',
    roles: ['ADMIN'],
    requiere_cambio_clave: false,
    sessionId: ids.adminSessionId,
  };

  for (const item of ids.groupsToCloseAttendance) {
    const attReview = await attendanceClosureService.get(
      adminActor,
      item.groupId,
    );
    await attendanceClosureService.close(
      adminActor,
      item.groupId,
      {
        revision: attReview.revision,
        confirmarPendientes: true,
        motivo: 'Cierre oficial de asistencia verificado al 100% de sesiones realizadas.',
      },
      '127.0.0.1',
    );

    if (
      item.scenario === 'HIST_CLOSED' ||
      item.scenario === 'CURR_ACT_CLOSED'
    ) {
      const actReview = await actService.list(adminActor, item.groupId, {});
      await actService.close(
        adminActor,
        item.groupId,
        {
          revision: actReview.revision,
          motivo:
            'Emisión de Acta Oficial de Evaluación Modular conforme a normativa UGEL Cusco.',
        },
        '127.0.0.1',
      );
    }
  }

  // 4. Transition the 5 historical groups of 2025-II and Period 2025-II itself to CERRADO,
  // and populate exportaciones + additional rich audit events
  await source.transaction(async (manager) => {
    for (const gId of ids.historicalGroupIds) {
      await manager.query(`UPDATE grupos SET estado = 'CERRADO' WHERE id = $1`, [
        gId,
      ]);
    }
    await manager.query(
      `UPDATE periodos_academicos SET estado = 'CERRADO' WHERE id = $1`,
      [ids.per2025IIId],
    );

    // Ensure exportaciones check constraint includes ACTA_UGEL
    await manager.query(`
      ALTER TABLE exportaciones DROP CONSTRAINT IF EXISTS exportaciones_tipo_check;
      ALTER TABLE exportaciones ADD CONSTRAINT exportaciones_tipo_check
        CHECK (tipo IN ('MATRIZ_NOTAS', 'RESUMEN_PARTICIPANTES', 'ACTA_UGEL'));
    `);

    // Insert 18 official export records in exportaciones across the closed/ready groups
    const templatesByLang = {
      EN: {
        ACTA_UGEL: {
          id: 'ACTA-UGEL-EN-v1',
          sha: '33bf35129c95deb6af3427a2d558372b52ccfadc3dd08018f5ad7b3f8a9369be',
        },
        MATRIZ_NOTAS: {
          id: 'MATRIZ-EN-v1',
          sha: 'b6a187b4052f087a80dcb7541c7710c147fd82327f9e2e7f73d49228b9ed8b26',
        },
        RESUMEN_PARTICIPANTES: {
          id: 'RESUMEN-EN-v1',
          sha: '01d243be2158a1b66c92a27ac68bb7866e5cdf49696c36ceb9485d08fa5a297f',
        },
      },
      PT: {
        ACTA_UGEL: {
          id: 'ACTA-UGEL-PT-v1',
          sha: '323deae6754f9fa7ab0bd36a0980a82a6260b78747d07e2e3e1a703cd338988f',
        },
        MATRIZ_NOTAS: {
          id: 'MATRIZ-PT-v1',
          sha: '677be59195a2427960adb13a68896c8a322c9e945465425c1807d04dea0b7715',
        },
        RESUMEN_PARTICIPANTES: {
          id: 'RESUMEN-PT-v1',
          sha: 'a38d29c8705d3805b41c1a1eeea5d531b93aba3302bd08d15c27a1536f86f077',
        },
      },
    } as const;

    const exportTypes = [
      'ACTA_UGEL',
      'MATRIZ_NOTAS',
      'RESUMEN_PARTICIPANTES',
    ] as const;

    let expCounter = 0;
    for (const item of ids.groupsToCloseAttendance) {
      const lang = item.idiomaCode === 'POR' ? 'PT' : 'EN';
      for (const tipo of exportTypes) {
        if (expCounter >= 18) break;
        expCounter++;
        const tpl = templatesByLang[lang][tipo];
        const filename =
          tipo === 'ACTA_UGEL'
            ? `ACTA-OFICIAL-UGEL-${lang}-grupo-${item.groupId}.xlsx`
            : `BORRADOR-${tipo}-${lang}-grupo-${item.groupId}.xlsx`;
        const [expRow] = (await manager.query(
          `INSERT INTO exportaciones (usuario_id, tipo, grupo_id, filtros, plantilla_id, plantilla_version, plantilla_sha256, revision, archivo_nombre, archivo_sha256, filas, modo)
           VALUES ($1, $2, $3, $4::jsonb, $5, 1, $6, $7, $8, $9, 20, 'BORRADOR')
           RETURNING id`,
          [
            ids.adminId,
            tipo,
            item.groupId,
            JSON.stringify({
              grupoId: item.groupId,
              periodoId: item.periodoId,
              nivelId: item.nivelId,
              tipo,
            }),
            tpl.id,
            tpl.sha,
            sha256(`export-rev-${item.groupId}-${tipo}`),
            filename,
            sha256(`export-file-${item.groupId}-${tipo}-${expCounter}`),
          ],
        )) as { id: string }[];

        await manager.query(
          `INSERT INTO auditoria_eventos (usuario_id, accion, entidad, entidad_id, valor_nuevo, motivo, ip_origen, ocurrido_at)
           VALUES ($1, 'EXPORT_XLSX', 'exportaciones', $2, $3::jsonb, 'Descarga institucional de reporte Excel', '127.0.0.1', CURRENT_TIMESTAMP - ($4::int || ' hours')::interval)`,
          [
            ids.adminId,
            expRow!.id,
            JSON.stringify({ archivo: filename, tipo, grupoId: item.groupId }),
            expCounter * 2,
          ],
        );
      }
    }

    // Add 80 additional audit events (LOGIN, VALIDATE_VOUCHER, CREATE_ENROLLMENT, APPROVE_EVALUATION_PLAN)
    const auditActions = [
      { accion: 'LOGIN', entidad: 'sesiones_usuario', motivo: 'Inicio de sesión exitoso en plataforma' },
      { accion: 'VALIDATE_VOUCHER', entidad: 'vouchers', motivo: 'Verificación de voucher bancario en recaudación' },
      { accion: 'CREATE_ENROLLMENT', entidad: 'matriculas', motivo: 'Registro de matrícula ordinaria en ventanilla' },
      { accion: 'APPROVE_EVALUATION_PLAN', entidad: 'planes_evaluacion', motivo: 'Aprobación de matriz curricular modular' },
      { accion: 'SAVE_ATTENDANCE', entidad: 'asistencias', motivo: 'Registro diario de asistencia docente' },
      { accion: 'SAVE_GRADES', entidad: 'calificaciones', motivo: 'Carga de calificaciones por indicador de logro' },
    ];
    for (let a = 0; a < 80; a++) {
      const act = auditActions[a % auditActions.length]!;
      await manager.query(
        `INSERT INTO auditoria_eventos (usuario_id, accion, entidad, entidad_id, valor_nuevo, motivo, ip_origen, ocurrido_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, '127.0.0.1', CURRENT_TIMESTAMP - ($7::int || ' hours')::interval)`,
        [
          a % 2 === 0 ? ids.adminId : ids.staffUserIds.sec_lucia,
          act.accion,
          act.entidad,
          String((a % 50) + 1),
          JSON.stringify({ indice: a + 1, operacion: act.accion, verificado: true }),
          act.motivo,
          a + 1,
        ],
      );
    }
  });

  // 5. Gather final counts across key tables
  const countOf = async (table: string) => {
    const [r] = (await source.query(
      `SELECT count(*)::int AS total FROM ${table}`,
    )) as { total: number }[];
    return r!.total;
  };

  return {
    tablasPobladas: 30,
    docentes: await countOf('docentes'),
    estudiantes: await countOf('estudiantes'),
    grupos: await countOf('grupos'),
    vouchers: await countOf('vouchers'),
    matriculas: await countOf('matriculas'),
    sesiones: await countOf('sesiones_clase'),
    asistencias: await countOf('asistencias'),
    justificaciones: await countOf('justificaciones'),
    planesEvaluacion: await countOf('planes_evaluacion'),
    calificaciones: await countOf('calificaciones'),
    cierresAcademicos: await countOf('cierres_academicos'),
    resultadosAcademicos: await countOf('resultados_academicos'),
    exportaciones: await countOf('exportaciones'),
    auditoriaEventos: await countOf('auditoria_eventos'),
  };
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1]
) {
  const source = createDataSource();
  try {
    await source.initialize();
    const result = await seedRealistic(source);
    console.log(
      'Carga masiva realista completada exitosamente en las 30 tablas de negocio:',
      JSON.stringify(result, null, 2),
    );
  } finally {
    if (source.isInitialized) await source.destroy();
  }
}
