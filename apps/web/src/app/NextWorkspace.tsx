import { useState, useEffect, useRef, type ReactNode } from "react";
import { Brand } from "../features/auth/Auth";
import { roleNames } from "../features/configuration/model";
import { Button } from "../shared/ui/Button";
import { allRows } from "../shared/api";
import { Feedback } from "../shared/ui/Feedback";
import type { Access } from "./access";
import { navGroups } from "./navigation-groups";
import {
  GraduationCap,
  Users,
  BookOpen,
  ArrowUpRight,
  School,
} from "lucide-react";
import { StatCard, StatCardGrid } from "../components/shared";
import "./NextWorkspace.css";

export function NextWorkspace({
  access,
  path,
  title,
  userName,
  roles,
  children,
  onExit,
  onUseCurrent,
  busy,
  error,
}: {
  access: Access;
  path: string;
  title: string;
  userName: string;
  roles: string[];
  children: ReactNode;
  onExit: () => void;
  onUseCurrent: () => void;
  busy: boolean;
  error: string;
}) {
  const [menuAt, setMenuAt] = useState<string | null>(null);
  const menuOpen = menuAt === path;
  const [search, setSearch] = useState("");
  const main = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const menuSearch = useRef<HTMLInputElement>(null);
  useEffect(() => main.current?.focus(), [path]);
  useEffect(() => {
    if (menuOpen) menuSearch.current?.focus();
  }, [menuOpen]);
  useEffect(() => {
    function searchShortcut(event: KeyboardEvent) {
      const target = event.target;
      if (
        event.key !== "/" ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        (target instanceof HTMLElement &&
          (target.isContentEditable || target.matches("input,textarea,select")))
      )
        return;
      event.preventDefault();
      setMenuAt(path);
      menuSearch.current?.focus();
    }
    document.addEventListener("keydown", searchShortcut);
    return () => document.removeEventListener("keydown", searchShortcut);
  }, [path]);
  function closeMenu() {
    setMenuAt(null);
    menuButton.current?.focus();
  }
  const groups = navGroups(access, path)
    .map((group) => ({
      ...group,
      items: group.items.filter((link) =>
        link.label
          .toLocaleLowerCase("es")
          .includes(search.toLocaleLowerCase("es")),
      ),
    }))
    .filter((group) => group.items.length);

  return (
    <div className="next-workspace">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          main.current?.focus();
        }}
      >
        Saltar al contenido
      </a>
      <aside
        className={`next-sidebar ${menuOpen ? "is-open" : ""}`}
        onKeyDown={(event) => {
          if (menuOpen && event.key === "Escape") closeMenu();
        }}
      >
        <div className="next-brand">
          <Brand />
        </div>
        <div className="next-nav-heading">Menú Principal</div>
        <label className="next-nav-search">
          <span aria-hidden="true">⌕</span>
          <input
            ref={menuSearch}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar sección…"
            aria-label="Buscar sección"
          />
          <kbd aria-hidden="true">/</kbd>
        </label>
        <nav
          id="next-navigation"
          aria-label="Navegación principal"
          onClick={() => setMenuAt(null)}
        >
          <a
            className={`next-home-link ${path === "/" ? "is-current" : ""}`}
            href="#/"
            aria-current={path === "/" ? "page" : undefined}
          >
            <span className="next-nav-icon" aria-hidden="true">
              ⌂
            </span>{" "}
            Inicio
          </a>
          {groups.map((group) => (
            <section className="next-nav-group" key={group.label}>
              <h2>{group.label}</h2>
              {group.items.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className={link.current(path) ? "is-current" : ""}
                  aria-current={link.current(path) ? "page" : undefined}
                >
                  <span className="next-nav-dot" aria-hidden="true" />
                  {link.label}
                </a>
              ))}
            </section>
          ))}
        </nav>
        <footer className="next-sidebar-footer">
          <span className="next-status-dot" />
          Excel · Cusco
          <small>Sistema de Gestión Académica</small>
        </footer>
      </aside>

      {menuOpen && (
        <button
          type="button"
          className="next-scrim"
          aria-label="Cerrar menú"
          onClick={closeMenu}
        />
      )}

      <div className="next-main-shell">
        <header className="next-topbar">
          <Button
            ref={menuButton}
            className="next-menu-toggle"
            onClick={() => setMenuAt(menuOpen ? null : path)}
            aria-expanded={menuOpen}
            aria-controls="next-navigation"
            aria-label="Menú"
          >
            ☰
          </Button>
          <div className="next-breadcrumb">
            <span>Excel</span>
            <b>/</b>
            <strong>{path === "/" ? "Panel Principal" : title}</strong>
          </div>
          <div className="next-top-actions">
            <a href="#/cuenta" className="next-account" aria-label="Mi cuenta">
              <span className="next-avatar">
                {userName.trim().slice(0, 1).toUpperCase()}
              </span>
              <span>
                <strong>{userName}</strong>
                <small>
                  {roles.map((role) => roleNames[role] ?? role).join(" · ")}
                </small>
              </span>
            </a>
            <Button onClick={onUseCurrent} style={{ fontSize: "0.75rem" }}>
              Modo Clásico
            </Button>
            <Button
              disabled={busy}
              onClick={onExit}
              style={{ fontSize: "0.75rem" }}
            >
              {busy ? "Saliendo…" : "Cerrar sesión"}
            </Button>
          </div>
        </header>

        <main
          id="main-content"
          className="next-content"
          tabIndex={-1}
          ref={main}
        >
          <Feedback>{error}</Feedback>
          {path === "/" ? (
            <NextHome access={access} userName={userName} />
          ) : (
            children
          )}
        </main>

        <footer className="next-footer">
          <span>Centro de Idiomas Excel · Cusco, Perú</span>
          <span>Plataforma Académica</span>
        </footer>
      </div>
    </div>
  );
}

function NextHome({ access, userName }: { access: Access; userName: string }) {
  const [metrics, setMetrics] = useState({
    grupos: null as number | null,
    matriculados: null as number | null,
    programas: null as number | null,
    docentes: null as number | null,
    periodo: null as string | null,
  });

  useEffect(() => {
    const request = new AbortController();
    const read = (path: string) =>
      allRows(path, request.signal).catch(() => null);
    async function loadStats() {
      const [grps, nivs, docs, perds] = await Promise.all([
        read("oferta/grupos"),
        access.reader ? read("oferta/niveles") : null,
        access.admin ? read("docentes") : null,
        access.reader ? read("oferta/periodos") : null,
      ]);
      if (request.signal.aborted) return;
      const abiertos = perds?.filter((periodo) => periodo.estado === "ABIERTO");
      setMetrics({
        grupos: grps?.length ?? null,
        matriculados: grps?.every((group) =>
          Number.isFinite(Number(group.matriculados)),
        )
          ? grps.reduce((acc, group) => acc + Number(group.matriculados), 0)
          : null,
        programas: nivs?.length ?? null,
        docentes:
          docs?.filter((docente) => docente.activo !== false).length ?? null,
        periodo:
          abiertos?.length === 1 ? String(abiertos[0]?.codigo ?? "") : null,
      });
    }
    void loadStats();
    return () => request.abort();
  }, [access.admin, access.reader]);

  return (
    <section className="next-home">
      <p className="next-eyebrow">
        CENTRO DE IDIOMAS EXCEL <span>·</span> CUSCO
      </p>

      {/* Banner de bienvenida */}
      <div className="next-welcome">
        <div>
          <span className="next-welcome-label">
            {metrics.periodo
              ? `Periodo académico ${metrics.periodo}`
              : "Gestión académica"}
          </span>
          <h1>Hola, {userName}</h1>
          <p>
            {access.teacherOnly
              ? "Tus salones de clase, registros de asistencia y notas centralizadas en un solo lugar."
              : "Bienvenido al panel centralizado. Toda la oferta educativa, salones y matrículas organizadas ordenadamente."}
          </p>
        </div>
        <div className="next-welcome-mark" aria-hidden="true">
          <span>E</span>
          <i>EXCEL</i>
        </div>
      </div>

      {/* Estadísticas en Vivo (KPI Cards Sobrias) */}
      <div style={{ margin: "1.5rem 0" }}>
        <StatCardGrid label="Estadísticas del periodo">
          <StatCard
            label="Salones de Clase"
            value={metrics.grupos ?? "—"}
            sublabel={
              metrics.periodo
                ? `En periodo ${metrics.periodo}`
                : "Grupos disponibles para tu cuenta"
            }
            icon={<School size={19} strokeWidth={1.75} />}
            tone="emerald"
          />
          <StatCard
            label="Matrículas por grupo"
            value={metrics.matriculados ?? "—"}
            sublabel="Matrículas registradas"
            icon={<GraduationCap size={19} strokeWidth={1.75} />}
            tone="blue"
          />
          {access.reader && (
            <StatCard
              label="Niveles ofertados"
              value={metrics.programas ?? "—"}
              sublabel="Niveles académicos"
              icon={<BookOpen size={19} strokeWidth={1.75} />}
              tone="slate"
            />
          )}
          {access.admin && (
            <StatCard
              label="Plana Docente"
              value={metrics.docentes ?? "—"}
              sublabel="Profesores habilitados"
              icon={<Users size={19} strokeWidth={1.75} />}
              tone="amber"
            />
          )}
        </StatCardGrid>
      </div>

      {/* Accesos Rápidos Principales */}
      <div className="next-section-heading">
        <div>
          <span>MÓDULOS DEL SISTEMA</span>
          <h2>Acceso directo</h2>
        </div>
        <p>Selecciona una sección para comenzar.</p>
      </div>

      {access.teacherOnly ? (
        <div className="next-quick-grid">
          <a href="#/mis-grupos/grupos" className="next-quick-card">
            <span className="next-quick-index">01</span>
            <strong>Ver mis grupos</strong>
            <small>Consulta las sesiones y evaluaciones asignadas.</small>
          </a>
          <a href="#/docencia/clases" className="next-quick-card">
            <span className="next-quick-index">02</span>
            <strong>Portal docente</strong>
            <small>Accede a la asistencia y notas por salón.</small>
          </a>
        </div>
      ) : (
        <div className="next-quick-grid">
          <a href="#/gestion-academica" className="next-quick-card">
            <span className="next-quick-index">01</span>
            <span className="next-quick-arrow" aria-hidden="true">
              <ArrowUpRight size={18} />
            </span>
            <strong>Gestión Académica</strong>
            <small>
              Salones, programas y UDs <span aria-hidden="true">→</span>
            </small>
          </a>

          <a href="#/matriz-curricular" className="next-quick-card">
            <span className="next-quick-index">02</span>
            <span className="next-quick-arrow" aria-hidden="true">
              <ArrowUpRight size={18} />
            </span>
            <strong>Matriz Curricular</strong>
            <small>
              Competencias y criterios <span aria-hidden="true">→</span>
            </small>
          </a>

          <a href="#/matriculas/padron" className="next-quick-card">
            <span className="next-quick-index">03</span>
            <span className="next-quick-arrow" aria-hidden="true">
              <ArrowUpRight size={18} />
            </span>
            <strong>Gestión de Matrículas</strong>
            <small>
              Nóminas e inscripciones <span aria-hidden="true">→</span>
            </small>
          </a>

          <a href="#/actas" className="next-quick-card">
            <span className="next-quick-index">04</span>
            <span className="next-quick-arrow" aria-hidden="true">
              <ArrowUpRight size={18} />
            </span>
            <strong>Resultados y actas</strong>
            <small>
              Revisión académica por salón <span aria-hidden="true">→</span>
            </small>
          </a>

          {access.auditLogs && (
            <a href="#/auditoria" className="next-quick-card">
              <span className="next-quick-index">05</span>
              <span className="next-quick-arrow" aria-hidden="true">
                <ArrowUpRight size={18} />
              </span>
              <strong>Historial de Modificaciones</strong>
              <small>
                Control de cambios y reversión <span aria-hidden="true">→</span>
              </small>
            </a>
          )}
        </div>
      )}

      <p className="next-home-note">
        <span aria-hidden="true">✦</span> Los accesos y acciones se adaptan
        automáticamente a tus permisos y roles asignados.
      </p>
    </section>
  );
}
