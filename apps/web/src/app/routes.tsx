import type { ReactNode } from "react";
import type { Access } from "./access";
import { PasswordForm } from "../features/auth/Auth";
import { ResourcePage } from "../features/configuration/ResourcePage";
import { resources } from "../features/configuration/model";
import { VouchersPage } from "../features/vouchers/VouchersPage";
import { EnrollmentsPage } from "../features/enrollments/EnrollmentsPage";
import { EnrollmentsHome } from "../features/enrollments/EnrollmentsHome";
import { GroupRoster } from "../features/enrollments/GroupRoster";
import { SessionsPage } from "../features/attendance/SessionsPage";
import { AttendancePage } from "../features/attendance/AttendancePage";
import { AttendanceOverviewPage } from "../features/attendance/AttendanceOverviewPage";
import { JustificationsPage } from "../features/attendance/JustificationsPage";
import { AttendanceClosurePage } from "../features/attendance/AttendanceClosurePage";
import { EvaluationLevelsPage } from "../features/evaluation/EvaluationLevelsPage";
import { EvaluationPlanPage } from "../features/evaluation/EvaluationPlanPage";
import { GroupEvaluationPage } from "../features/evaluation/GroupEvaluationPage";
import { GradesPage } from "../features/evaluation/GradesPage";
import { ActPage } from "../features/evaluation/ActPage";
import { ReportsPage } from "../features/reports/ReportsPage";
import { ReportsGroupsPage } from "../features/reports/ReportsGroupsPage";
import { StudentsPage } from "../features/students/StudentsPage";
import { AcademicManagementPage } from "../features/academic/AcademicManagementPage";
import { CurriculumMatrixPage } from "../features/academic/CurriculumMatrixPage";
import { GroupWorkspacePage } from "../features/academic/GroupWorkspacePage";
import { ActsGroupsPage } from "../features/evaluation/ActsGroupsPage";
import { TeacherClassesPage } from "../features/academic/TeacherClassesPage";

export interface RouteContext {
  path: string;
  query: URLSearchParams;
  access: Access;
  roles: string[];
}

interface AppRoute {
  /** Coincide con la ruta completa; los grupos capturan los parámetros. */
  pattern: RegExp;
  /** Título para la migas de pan. */
  title: string;
  allowed: (access: Access) => boolean;
  render: (params: string[], ctx: RouteContext) => ReactNode;
}

const ID = "[1-9][0-9]{0,17}";
const re = (source: string) => new RegExp(`^${source}$`);
const anyone = () => true;

/**
 * Tabla única de rutas. Cada entrada declara quién entra y qué se muestra.
 * El orden no importa: ningún patrón se solapa con otro.
 */
const routes: AppRoute[] = [
  {
    pattern: re("/cuenta"),
    title: "Mi cuenta",
    allowed: anyone,
    render: () => (
      <div className="panel account-panel">
        <PasswordForm />
      </div>
    ),
  },
  // Matrículas: periodos → grupo → nómina; el asistente de matrícula no cambia.
  {
    pattern: re("/vouchers"),
    title: "Vouchers",
    allowed: (a) => a.enrollments,
    render: (_, { query }) => <VouchersPage query={query} />,
  },
  {
    pattern: re("/matriculas"),
    title: "Matrículas",
    allowed: (a) => a.reader,
    // Compatibilidad: /matriculas?estudianteId=… o ?grupoId=… abre el asistente.
    render: (_, { query, access }) =>
      (query.get("estudianteId") || query.get("grupoId")) && access.enrollments ? (
        <EnrollmentsPage
          key={`:${query.get("estudianteId") ?? ""}:${query.get("grupoId") ?? ""}`}
          studentId={query.get("estudianteId") ?? undefined}
        />
      ) : (
        <EnrollmentsHome query={query} canEnroll={access.enrollments} />
      ),
  },
  {
    pattern: re(`/matriculas/grupo/(${ID})`),
    title: "Grupo de matrículas",
    allowed: (a) => a.reader,
    render: ([id], { path, query, access }) => (
      <GroupRoster
        key={`${path}?${query.get("q") ?? ""}`}
        groupId={id!}
        query={query}
        canEdit={access.enrollments}
      />
    ),
  },
  {
    pattern: re("/matriculas/nueva"),
    title: "Asistente de matrícula",
    allowed: (a) => a.enrollments,
    render: (_, { query }) => (
      <EnrollmentsPage
        key={`nueva:${query.get("estudianteId") ?? ""}:${query.get("grupoId") ?? ""}`}
        studentId={query.get("estudianteId") ?? undefined}
      />
    ),
  },
  {
    pattern: re(`/matriculas/(${ID})`),
    title: "Matrículas",
    allowed: (a) => a.enrollments,
    render: ([id]) => <EnrollmentsPage key={id} id={id} />,
  },
  {
    pattern: re("/estudiantes"),
    title: "Estudiantes",
    allowed: (a) => a.reader,
    render: (_, { query }) => <StudentsPage query={query} />,
  },
  {
    pattern: re(`/estudiantes/(${ID})`),
    title: "Ficha del estudiante",
    allowed: (a) => a.reader,
    render: ([id], { query }) => <StudentsPage id={id} query={query} />,
  },
  // Entrada docente / administrativa por grupo
  {
    pattern: re("/actas"),
    title: "Actas de Cierre por Salón",
    allowed: (a) => a.admin || a.reader,
    render: () => <ActsGroupsPage />,
  },
  {
    pattern: re("/docencia/clases"),
    title: "Mis Clases Asignadas",
    allowed: (a) => a.teacherOnly,
    render: (_, { query }) => <TeacherClassesPage query={query} />,
  },
  {
    pattern: re("/docencia/asistencias"),
    title: "Mis Clases Asignadas",
    allowed: (a) => a.teacherOnly,
    render: (_, { query }) => <TeacherClassesPage query={query} />,
  },
  {
    pattern: re("/docencia/calificaciones"),
    title: "Mis Clases Asignadas",
    allowed: (a) => a.teacherOnly,
    render: (_, { query }) => <TeacherClassesPage query={query} />,
  },
  {
    pattern: re("/mis-grupos/grupos"),
    title: "Mis Clases Asignadas",
    allowed: (a) => a.teacherOnly,
    render: (_, { query }) => <TeacherClassesPage query={query} />,
  },
  // Asistencia
  {
    pattern: re(`/asistencia/grupos/(${ID})`),
    title: "Sesiones de clase",
    allowed: anyone,
    render: ([id], { path, query }) => (
      <SessionsPage key={path} id={id} query={query} />
    ),
  },
  {
    pattern: re(`/asistencia/grupos/(${ID})/matriz`),
    title: "Matriz de asistencia",
    allowed: anyone,
    render: ([id], { path, query }) => (
      <AttendanceOverviewPage key={path} groupId={id} query={query} />
    ),
  },
  {
    pattern: re(`/asistencia/grupos/(${ID})/sesiones/(${ID})`),
    title: "Registro de asistencia",
    allowed: anyone,
    render: ([groupId, sessionId], { path, query }) => (
      <AttendancePage
        key={path}
        groupId={groupId}
        sessionId={sessionId}
        query={query}
      />
    ),
  },
  {
    pattern: re(`/asistencia/grupos/(${ID})/justificaciones`),
    title: "Justificaciones",
    allowed: anyone,
    render: ([id], { path, query }) => (
      <JustificationsPage key={path} groupId={id} query={query} />
    ),
  },
  {
    pattern: re(`/asistencia/grupos/(${ID})/cierre`),
    title: "Cierre de asistencia",
    allowed: anyone,
    render: ([id], { path }) => <AttendanceClosurePage key={path} groupId={id} />,
  },
  // Evaluación
  {
    pattern: re(`/evaluacion/niveles(?:/(${ID}))?`),
    title: "Criterios de evaluación",
    allowed: anyone,
    render: ([levelId], { path }) => (
      <EvaluationLevelsPage key={path} levelId={levelId} />
    ),
  },
  {
    pattern: re(`/evaluacion/planes/(${ID})`),
    title: "Criterios de evaluación",
    allowed: anyone,
    render: ([id], { path }) => <EvaluationPlanPage key={path} planId={id} />,
  },
  {
    pattern: re(`/evaluacion/grupos/(${ID})`),
    title: "Criterios de evaluación",
    allowed: anyone,
    render: ([id], { path }) => <GroupEvaluationPage key={path} groupId={id} />,
  },
  {
    pattern: re(`/evaluacion/grupos/(${ID})/calificaciones`),
    title: "Calificaciones",
    allowed: anyone,
    render: ([id], { path, query }) => (
      <GradesPage key={path} groupId={id} query={query} />
    ),
  },
  {
    pattern: re(`/evaluacion/grupos/(${ID})/acta`),
    title: "Resultados y acta",
    allowed: anyone,
    render: ([id], { path, query }) => (
      <ActPage key={path} groupId={id} query={query} />
    ),
  },
  // Reportes
  {
    pattern: re("/reportes"),
    title: "Reportes",
    allowed: (a) => a.reports,
    render: (_, { query }) => <ReportsGroupsPage query={query} />,
  },
  {
    pattern: re(`/reportes/grupos/(${ID})`),
    title: "Reportes",
    allowed: (a) => a.reports,
    render: ([id], { path, query }) => (
      <ReportsPage key={path} groupId={id} query={query} />
    ),
  },
  {
    pattern: re("/gestion-academica"),
    title: "Gestión Académica",
    allowed: (a) => a.reader || a.admin,
    render: () => <AcademicManagementPage />,
  },
  {
    pattern: re("/matriz-curricular"),
    title: "Matriz Curricular",
    allowed: (a) => a.reader || a.admin,
    render: () => <CurriculumMatrixPage />,
  },
  {
    pattern: re(`/salones/(${ID})`),
    title: "Espacio del Salón",
    allowed: (a) => a.reader || a.admin || a.teacherOnly,
    render: ([id], { query }) => {
      const tab = query.get("tab");
      const initialTab =
        tab === "nomina" || tab === "calificaciones" ? tab : "asistencia";
      return <GroupWorkspacePage key={id} groupId={id} initialTab={initialTab} />;
    },
  },
];

export interface ResolvedRoute {
  title: string;
  element: ReactNode | null;
}

/** Resuelve la ruta actual; `element` es null si no existe o no está permitida. */
export function resolveRoute(ctx: RouteContext): ResolvedRoute {
  const { path, access } = ctx;
  for (const route of routes) {
    const match = route.pattern.exec(path);
    if (!match) continue;
    return route.allowed(access)
      ? { title: route.title, element: route.render(match.slice(1), ctx) }
      : { title: "Página", element: null };
  }
  // Catálogos de oferta académica: /configuracion/:clave, /consulta/:clave
  // y, para docentes, /mis-grupos/grupos.
  const resource = resources[path.split("/")[2]];
  const inScope =
    path.startsWith(`${access.catalogBase}/`) || path === "/mis-grupos/grupos";
  if (resource && access.catalogs.includes(resource) && inScope) {
    return {
      title: resource.title,
      element: (
        <ResourcePage
          key={`${path}:${ctx.roles.join(",")}`}
          resource={resource}
          path={path}
          query={ctx.query}
        />
      ),
    };
  }
  return { title: "Página", element: null };
}
