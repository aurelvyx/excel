import { useMemo, useState } from "react";
import { Lock, ArrowLeft, Plus } from "lucide-react";
import { useAuth } from "../auth/session";
import { navigate } from "../../shared/navigation";
import { useApiQuery } from "../../shared/useApiQuery";
import { Button } from "../../shared/ui/Button";
import { DataTable } from "../../shared/ui/DataTable";
import { Feedback } from "../../shared/ui/Feedback";
import { ListPanel } from "../../shared/ui/ListPanel";
import { PageHeading } from "../../shared/ui/PageHeading";
import { Pagination } from "../../shared/ui/Pagination";
import { StatusBadge } from "../../shared/ui/StatusBadge";
import { SessionForm } from "./SessionForm";
import { GroupContext } from "./GroupContext";
import { safeAttendanceReturnTo, withAttendanceReturn } from "./navigation";
import "../academic/academic.css";
import {
  sessionDate,
  sessionStates,
  sessionTime,
  type SessionsPageData,
} from "./model";

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Setiembre", "Octubre", "Noviembre", "Diciembre",
];
const WEEKDAY_NAMES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function SessionsPage({
  id,
  query,
}: {
  id: string;
  query: URLSearchParams;
}) {
  const { session } = useAuth();
  const admin = session.user.roles.includes("ADMIN");
  const reader = session.user.roles.some((role) =>
    ["ADMIN", "SECRETARIA", "COORDINADOR"].includes(role),
  );
  const returnTo = safeAttendanceReturnTo(query.get("retorno"), id);
  const back =
    returnTo ??
    (reader
      ? `${admin ? "/configuracion" : "/consulta"}/grupos`
      : "/docencia/clases");
  const path = `/asistencia/grupos/${id}`;
  const endpoint = `asistencia/grupos/${id}/sesiones`;
  const after = query.get("after") ?? "";
  const search = new URLSearchParams({ limit: "100" });
  if (after) search.set("after", after);
  const {
    data: loaded,
    loading,
    error,
    reload,
  } = useApiQuery<SessionsPageData>(`${endpoint}?${search}`);
  // No presentar el grupo anterior mientras la nueva consulta se resuelve.
  const data = !error && loaded?.grupo.id === id ? loaded : undefined;
  const group = data?.grupo;
  const [creatingDate, setCreatingDate] = useState<string | null>(null);
  const [success, notify] = useState("");
  const [viewMode, setViewMode] = useState<"calendar" | "cards" | "table">("calendar");

  // Orden cronológico estricto de las sesiones por fecha
  const sortedItems = useMemo(() => {
    return [...(data?.items ?? [])].sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [data?.items]);

  // Mapeo rápido de sesiones por fecha 'YYYY-MM-DD'
  const sessionsByDate = useMemo(() => {
    const map: Record<string, typeof sortedItems> = {};
    for (const item of sortedItems) {
      const dateKey = item.fecha.slice(0, 10);
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(item);
    }
    return map;
  }, [sortedItems]);

  // Meses disponibles con sesiones
  const availableMonths = useMemo(() => {
    const monthsMap = new Map<string, { year: number; month: number; count: number }>();
    for (const item of sortedItems) {
      const dateKey = item.fecha.slice(0, 7);
      const [y, m] = dateKey.split("-").map(Number);
      if (!monthsMap.has(dateKey)) {
        monthsMap.set(dateKey, { year: y, month: m - 1, count: 0 });
      }
      monthsMap.get(dateKey)!.count++;
    }
    return Array.from(monthsMap.entries()).map(([key, val]) => ({
      key,
      year: val.year,
      month: val.month,
      label: `${MONTH_NAMES[val.month]} ${val.year}`,
      count: val.count,
    }));
  }, [sortedItems]);

  // Mes seleccionado / inicial
  const initialMonth = useMemo(() => {
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    if (availableMonths.some((m) => m.key === todayKey)) {
      return { year: today.getFullYear(), month: today.getMonth() };
    }
    if (availableMonths.length > 0) {
      return { year: availableMonths[0].year, month: availableMonths[0].month };
    }
    if (group?.fecha_inicio) {
      const [y, m] = group.fecha_inicio.slice(0, 7).split("-").map(Number);
      if (y && m) return { year: y, month: m - 1 };
    }
    return { year: today.getFullYear(), month: today.getMonth() };
  }, [availableMonths, group?.fecha_inicio]);

  const [activeMonth, setActiveMonth] = useState<{ year: number; month: number } | null>(null);
  const currentMonth = activeMonth ?? initialMonth;

  const handlePrevMonth = () => {
    setActiveMonth((prev) => {
      const cur = prev ?? initialMonth;
      if (cur.month === 0) return { year: cur.year - 1, month: 11 };
      return { year: cur.year, month: cur.month - 1 };
    });
  };

  const handleNextMonth = () => {
    setActiveMonth((prev) => {
      const cur = prev ?? initialMonth;
      if (cur.month === 11) return { year: cur.year + 1, month: 0 };
      return { year: cur.year, month: cur.month + 1 };
    });
  };

  // Cuadrícula de 7 columnas para el mes actual
  const calendarCells = useMemo(() => {
    const year = currentMonth.year;
    const month = currentMonth.month;
    const firstDay = new Date(year, month, 1);
    const startCol = (firstDay.getDay() + 6) % 7; // Lunes = 0
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const todayStr = new Date().toISOString().slice(0, 10);

    const cells: {
      dateStr: string;
      dayNumber: number;
      isCurrentMonth: boolean;
      isToday: boolean;
    }[] = [];

    // Relleno de mes anterior
    for (let i = startCol - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const prevDate = new Date(year, month - 1, dayNum);
      const dateStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      cells.push({
        dateStr,
        dayNumber: dayNum,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
      });
    }

    // Días del mes actual
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({
        dateStr,
        dayNumber: d,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
      });
    }

    // Relleno de mes posterior hasta completar semana
    const remaining = (7 - (cells.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const nextDate = new Date(year, month + 1, d);
      const dateStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({
        dateStr,
        dayNumber: d,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
      });
    }

    return cells;
  }, [currentMonth]);

  // Sesiones del mes actual
  const currentMonthKey = `${currentMonth.year}-${String(currentMonth.month + 1).padStart(2, "0")}`;
  const currentMonthSessions = useMemo(() => {
    return sortedItems.filter((s) => s.fecha.startsWith(currentMonthKey));
  }, [sortedItems, currentMonthKey]);

  const monthStats = useMemo(() => {
    let realizadas = 0;
    let programadas = 0;
    let canceladas = 0;
    for (const s of currentMonthSessions) {
      if (s.estado === "REALIZADA") realizadas++;
      else if (s.estado === "PROGRAMADA") programadas++;
      else if (s.estado === "CANCELADA") canceladas++;
    }
    return {
      total: currentMonthSessions.length,
      realizadas,
      programadas,
      canceladas,
    };
  }, [currentMonthSessions]);

  if (!reader && group && group.estado === "CERRADO") {
    return (
      <div className="academic-container">
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <a href={`#${back}`} className="academic-btn-action btn-action-secondary" style={{ padding: "0.4rem 0.8rem" }}>
            <ArrowLeft size={14} /> Volver a Mis Clases Asignadas
          </a>
        </div>
        <div
          className="academic-card"
          style={{
            padding: "3rem 2rem",
            textAlign: "center",
            maxWidth: "560px",
            margin: "2rem auto",
            borderTop: "4px solid #64748b",
          }}
        >
          <Lock size={30} color="#64748b" style={{ margin: "0 auto 0.75rem" }} />
          <h2 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#1e293b", margin: "0 0 0.5rem" }}>
            Salón Cerrado ({group.codigo})
          </h2>
          <p style={{ fontSize: "0.875rem", color: "#64748b", lineHeight: 1.5, margin: "0 0 1.25rem" }}>
            Este salón ya fue finalizado por la administración académica. El docente no tiene acceso a salones cerrados a menos que el Administrador libere temporalmente la clase.
          </p>
          <a href="#/docencia/clases" className="academic-btn-action btn-action-primary">
            Regresar a Mis Clases Habilitadas
          </a>
        </div>
      </div>
    );
  }

  return (
    <section>
      <a href={`#${back}`} className="back-link">
        ← {returnTo?.startsWith("/docencia/") ? "Volver a mis grupos" : "Volver a grupos"}
      </a>
      <PageHeading
        eyebrow="Asistencia"
        title="Sesiones de clase"
        description="Haz clic en cualquier día disponible del calendario para crear una asistencia en ese día o programa múltiples fechas."
        action={
          data?.puedeProgramar && (
            <Button
              variant="primary"
              disabled={loading || !!error}
              onClick={() => {
                notify("");
                setCreatingDate("");
              }}
            >
              + Nueva fecha de asistencia
            </Button>
          )
        }
      />
      {group && <GroupContext group={group} />}
      {group && (
        <div className="group-nav-pills">
          <a
            href={`#${path}/matriz`}
            className="group-nav-pill"
          >
            📊 Matriz de asistencia
          </a>
          <a
            href={`#${path}/justificaciones`}
            className="group-nav-pill"
          >
            📝 Justificaciones
          </a>
          <a
            href={`#${path}/cierre`}
            className="group-nav-pill"
          >
            🔒 Cierre de asistencia
          </a>
          <a
            href={`#/evaluacion/grupos/${id}/calificaciones`}
            className="group-nav-pill group-nav-pill-special"
          >
            ⭐ Calificaciones
          </a>
          <a
            href={`#/evaluacion/grupos/${id}/acta`}
            className="group-nav-pill"
          >
            📋 Acta y resultados
          </a>
          <a
            href={`#/salones/${id}`}
            className="group-nav-pill"
            style={{ marginLeft: "auto" }}
          >
            🏫 Salón 360°
          </a>
        </div>
      )}
      {data && !data.puedeProgramar && (
        <p className="readonly">
          Solo lectura ·{" "}
          {group?.asistencia_cerrada
            ? "La asistencia del grupo está cerrada."
            : group?.estado === "CERRADO" || group?.periodo_estado === "CERRADO"
              ? "El grupo o periodo está cerrado."
              : "Tu cuenta puede consultar las sesiones de este grupo."}
        </p>
      )}
      <Feedback tone="success">{success}</Feedback>
      <ListPanel
        loading={loading}
        loadingLabel="Cargando sesiones…"
        error={error}
        onRetry={reload}
        empty={false}
        emptyDescription={
          after
            ? "No hay más sesiones en esta página. Vuelve a la primera página."
            : data?.puedeProgramar
              ? "Programa las primeras fechas de clase de este grupo."
              : "Todavía no hay sesiones programadas para este grupo."
        }
        pagination={
          viewMode === "table" ? (
            <Pagination
              count={data?.items.length ?? 0}
              after={after}
              nextCursor={data?.nextCursor ?? null}
              onChange={(cursor) =>
                navigate(
                  withAttendanceReturn(
                    cursor ? `${path}?after=${cursor}` : path,
                    returnTo,
                  ),
                )
              }
            />
          ) : undefined
        }
      >
        <div className="calendar-container">
          {/* Barra Superior con Selector de Mes y Alternador de Vistas */}
          <div className="calendar-toolbar">
            <div className="calendar-month-nav">
              <button
                type="button"
                className="calendar-nav-btn"
                onClick={handlePrevMonth}
                title="Mes anterior"
              >
                ‹
              </button>
              <span className="calendar-current-title">
                {MONTH_NAMES[currentMonth.month]} {currentMonth.year}
              </span>
              <button
                type="button"
                className="calendar-nav-btn"
                onClick={handleNextMonth}
                title="Mes siguiente"
              >
                ›
              </button>
              <button
                type="button"
                className="roster-btn"
                style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
                onClick={() => {
                  const today = new Date();
                  setActiveMonth({ year: today.getFullYear(), month: today.getMonth() });
                }}
              >
                Hoy
              </button>
            </div>

            {/* Alternador de Vistas: Calendario / Tarjetas / Tabla */}
            <div className="calendar-view-toggle">
              <button
                type="button"
                className={`calendar-toggle-btn ${viewMode === "calendar" ? "active" : ""}`}
                onClick={() => setViewMode("calendar")}
              >
                📅 Calendario
              </button>
              <button
                type="button"
                className={`calendar-toggle-btn ${viewMode === "cards" ? "active" : ""}`}
                onClick={() => setViewMode("cards")}
              >
                🗂️ Tarjetas ({monthStats.total})
              </button>
              <button
                type="button"
                className={`calendar-toggle-btn ${viewMode === "table" ? "active" : ""}`}
                onClick={() => setViewMode("table")}
              >
                📋 Lista
              </button>
            </div>
          </div>

          {/* Píldoras de Meses con Sesiones Programadas */}
          {availableMonths.length > 1 && (
            <div className="calendar-month-pills-bar">
              <span style={{ fontSize: "0.781rem", fontWeight: 600, color: "#64748b" }}>
                Meses con clases:
              </span>
              {availableMonths.map((m) => {
                const isActive = m.year === currentMonth.year && m.month === currentMonth.month;
                return (
                  <button
                    key={m.key}
                    type="button"
                    className={`cal-month-pill ${isActive ? "active" : ""}`}
                    onClick={() => setActiveMonth({ year: m.year, month: m.month })}
                  >
                    <span>{m.label}</span>
                    <span className="cal-month-pill-count">{m.count}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Estadísticas del Mes Seleccionado */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              marginBottom: "1rem",
              fontSize: "0.813rem",
              color: "#475569",
              flexWrap: "wrap",
            }}
          >
            <span>
              <strong>Total del mes:</strong> {monthStats.total} {monthStats.total === 1 ? "sesión" : "sesiones"}
            </span>
            <span>·</span>
            <span style={{ color: "#065f46", fontWeight: 600 }}>
              🟢 Realizadas: {monthStats.realizadas}
            </span>
            <span>·</span>
            <span style={{ color: "#1d4ed8", fontWeight: 600 }}>
              🔵 Programadas: {monthStats.programadas}
            </span>
            {monthStats.canceladas > 0 && (
              <>
                <span>·</span>
                <span style={{ color: "#991b1b", fontWeight: 600 }}>
                  🔴 Canceladas: {monthStats.canceladas}
                </span>
              </>
            )}
            {data?.puedeProgramar && group && (
              <span style={{ marginLeft: "auto", fontSize: "0.75rem", color: "#007a3d", fontWeight: 600 }}>
                💡 Tip: Haz clic en &quot;+ Crear asistencia&quot; en cualquier día del periodo ({group.fecha_inicio} a {group.fecha_fin})
              </span>
            )}
          </div>

          {/* 1. Vista Calendario Mensual (Cuadrícula 7 Días) */}
          {viewMode === "calendar" && (
            <div className="calendar-grid">
              <div className="calendar-weekdays-row">
                {WEEKDAY_NAMES.map((w) => (
                  <div key={w} className="calendar-weekday">
                    {w}
                  </div>
                ))}
              </div>
              <div className="calendar-days-grid">
                {calendarCells.map((cell) => {
                  const sessionsForCell = sessionsByDate[cell.dateStr] ?? [];
                  const hasSessions = sessionsForCell.length > 0;
                  const withinPeriod =
                    !!group &&
                    cell.dateStr >= group.fecha_inicio.slice(0, 10) &&
                    cell.dateStr <= group.fecha_fin.slice(0, 10);
                  const canCreateOnDay = !!data?.puedeProgramar && withinPeriod && !hasSessions;

                  return (
                    <div
                      key={cell.dateStr}
                      className={`calendar-day-cell ${
                        !cell.isCurrentMonth ? "other-month" : ""
                      } ${cell.isToday ? "today" : ""} ${hasSessions ? "has-session" : ""}`}
                    >
                      <div className="calendar-day-header">
                        <span className="calendar-day-number">{cell.dayNumber}</span>
                        {cell.isToday && (
                          <span className="calendar-today-badge">Hoy</span>
                        )}
                      </div>

                      {sessionsForCell.map((s) => {
                        const sessionUrl = `#${withAttendanceReturn(`${path}/sesiones/${s.id}`, returnTo)}`;
                        const isRealizada = s.estado === "REALIZADA";
                        const isProgramada = s.estado === "PROGRAMADA";
                        const isCancelada = s.estado === "CANCELADA";
                        return (
                          <div
                            key={s.id}
                            className={`calendar-session-card ${s.estado.toLowerCase()}`}
                          >
                            <span className={`calendar-session-badge ${s.estado.toLowerCase()}`}>
                              {isRealizada ? "✓ Realizada" : isProgramada ? "● Programada" : "✕ Cancelada"}
                            </span>
                            <div className="calendar-session-time">
                              🕒 {sessionTime(s.hora_inicio, s.hora_fin)}
                            </div>
                            {isProgramada && (
                              <a href={sessionUrl} className="cal-card-btn take">
                                Tomar Asistencia ➔
                              </a>
                            )}
                            {isRealizada && (
                              <a href={sessionUrl} className="cal-card-btn edit">
                                Editar Asistencia ✏️
                              </a>
                            )}
                            {isCancelada && (
                              <span style={{ fontSize: "0.688rem", color: "#94a3b8" }}>
                                Sin asistencia
                              </span>
                            )}
                          </div>
                        );
                      })}

                      {canCreateOnDay && (
                        <button
                          type="button"
                          onClick={() => {
                            notify("");
                            setCreatingDate(cell.dateStr);
                          }}
                          style={{
                            marginTop: "auto",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "0.25rem",
                            width: "100%",
                            padding: "0.35rem 0.4rem",
                            borderRadius: "0.375rem",
                            border: "1px dashed #cbd5e1",
                            backgroundColor: "#f8fafc",
                            color: "#007a3d",
                            fontSize: "0.6875rem",
                            fontWeight: 700,
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = "#007a3d";
                            e.currentTarget.style.backgroundColor = "#f0fdf4";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = "#cbd5e1";
                            e.currentTarget.style.backgroundColor = "#f8fafc";
                          }}
                          title={`Crear sesión de asistencia para el ${cell.dateStr}`}
                        >
                          <Plus size={12} /> Crear asistencia
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. Vista Cuadrícula / Tarjetas (Agenda de Clases) */}
          {viewMode === "cards" && (
            <div>
              {currentMonthSessions.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2.5rem 1rem", color: "#64748b" }}>
                  <p style={{ margin: "0 0 0.75rem", fontSize: "0.938rem" }}>
                    No hay sesiones de clase registradas en {MONTH_NAMES[currentMonth.month]} {currentMonth.year}.
                  </p>
                  {data?.puedeProgramar && (
                    <Button
                      variant="primary"
                      onClick={() => {
                        notify("");
                        setCreatingDate("");
                      }}
                    >
                      + Programar fecha de asistencia
                    </Button>
                  )}
                </div>
              ) : (
                <div className="session-cards-grid">
                  {currentMonthSessions.map((s) => {
                    const sessionUrl = `#${withAttendanceReturn(`${path}/sesiones/${s.id}`, returnTo)}`;
                    const [y, m, d] = s.fecha.split("-");
                    const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
                    const dayName = WEEKDAY_NAMES[(dateObj.getDay() + 6) % 7];
                    const monthShort = MONTH_NAMES[Number(m) - 1].slice(0, 3).toUpperCase();
                    const isToday = new Date().toISOString().slice(0, 10) === s.fecha.slice(0, 10);
                    const isRealizada = s.estado === "REALIZADA";
                    const isProgramada = s.estado === "PROGRAMADA";
                    return (
                      <div key={s.id} className={`session-schedule-card ${s.estado.toLowerCase()}`}>
                        <div className="session-card-header">
                          <div className="session-date-display">
                            <div className="session-date-badge-box">
                              <span className="day-num">{d}</span>
                              <span className="month-name">{monthShort}</span>
                            </div>
                            <div className="session-date-text">
                              <h4>{dayName} {d} de {MONTH_NAMES[Number(m) - 1]}</h4>
                              <p>🕒 {sessionTime(s.hora_inicio, s.hora_fin)}</p>
                            </div>
                          </div>
                          {isToday && (
                            <span className="calendar-today-badge">Hoy</span>
                          )}
                        </div>
                        <div className="session-card-footer">
                          <span
                            style={{
                              fontSize: "0.75rem",
                              fontWeight: 700,
                              color: isRealizada ? "#065f46" : isProgramada ? "#1d4ed8" : "#991b1b",
                            }}
                          >
                            {isRealizada ? "✓ Realizada" : isProgramada ? "● Programada" : "✕ Cancelada"}
                          </span>
                          {isProgramada ? (
                            <a href={sessionUrl} className="cal-card-btn take" style={{ margin: 0 }}>
                              Tomar Asistencia ➔
                            </a>
                          ) : (
                            <a href={sessionUrl} className="cal-card-btn edit" style={{ margin: 0 }}>
                              Editar Asistencia ✏️
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 3. Vista Lista / Tabla Tradicional (Ordenada Cronológicamente) */}
          {viewMode === "table" && (
            <DataTable
              caption="Sesiones del grupo"
              rows={sortedItems}
              rowKey={(row) => row.id}
              columns={[
                {
                  key: "fecha",
                  header: "Fecha de clase",
                  cell: (row) => {
                    const isToday =
                      new Date().toISOString().slice(0, 10) ===
                      row.fecha.slice(0, 10);
                    return (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ fontWeight: 600 }}>{sessionDate(row.fecha)}</span>
                        {isToday && (
                          <span
                            style={{
                              background: "#ecfdf5",
                              color: "#065f46",
                              border: "1px solid #a7f3d0",
                              fontSize: "0.688rem",
                              fontWeight: 700,
                              padding: "0.15rem 0.45rem",
                              borderRadius: "9999px",
                            }}
                          >
                            Hoy
                          </span>
                        )}
                      </div>
                    );
                  },
                },
                {
                  key: "horario",
                  header: "Horario",
                  cell: (row) => (
                    <span style={{ color: "#475569", fontSize: "0.875rem" }}>
                      {sessionTime(row.hora_inicio, row.hora_fin)}
                    </span>
                  ),
                },
                {
                  key: "estado",
                  header: "Estado",
                  cell: (row) => {
                    const isRealizada = row.estado === "REALIZADA";
                    const isCancelada = row.estado === "CANCELADA";
                    if (isRealizada) {
                      return (
                        <span
                          style={{
                            display: "inline-block",
                            padding: "0.2rem 0.5rem",
                            borderRadius: "9999px",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                            background: "#ecfdf5",
                            color: "#065f46",
                            border: "1px solid #a7f3d0",
                          }}
                        >
                          Realizada
                        </span>
                      );
                    }
                    return (
                      <StatusBadge inactive={isCancelada}>
                        {sessionStates[row.estado]}
                      </StatusBadge>
                    );
                  },
                },
                {
                  key: "acciones",
                  header: "Acciones",
                  cell: (row) => {
                    const sessionUrl = `#${withAttendanceReturn(`${path}/sesiones/${row.id}`, returnTo)}`;
                    if (row.estado === "CANCELADA") {
                      return (
                        <span style={{ color: "#94a3b8", fontSize: "0.813rem" }}>
                          Cancelada
                        </span>
                      );
                    }
                    if (row.estado === "REALIZADA") {
                      return (
                        <a href={sessionUrl} className="session-action-btn view">
                          Editar Asistencia ✏️
                        </a>
                      );
                    }
                    return (
                      <a href={sessionUrl} className="session-action-btn take">
                        Tomar Asistencia ➔
                      </a>
                    );
                  },
                },
              ]}
            />
          )}
        </div>
      </ListPanel>
      {creatingDate !== null && group && data?.puedeProgramar && (
        <SessionForm
          group={group}
          endpoint={endpoint}
          initialDate={creatingDate || undefined}
          existingDates={sortedItems.map((s) => s.fecha.slice(0, 10))}
          onClose={() => setCreatingDate(null)}
          onSaved={(count) => {
            setCreatingDate(null);
            notify(
              count === 1
                ? "Se programó 1 sesión de asistencia."
                : `Se programaron ${count} sesiones de asistencia.`,
            );
            if (after) navigate(path);
            else reload();
          }}
          onTakeAttendanceNow={(createdSession) => {
            setCreatingDate(null);
            navigate(
              withAttendanceReturn(
                `${path}/sesiones/${createdSession.id}`,
                returnTo,
              ),
            );
          }}
        />
      )}
    </section>
  );
}
