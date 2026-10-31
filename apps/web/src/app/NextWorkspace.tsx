import { useState, useEffect, type ReactNode } from "react";
import { Brand } from "../features/auth/Auth";
import { roleNames } from "../features/configuration/model";
import { Button } from "../shared/ui/Button";
import { allRows } from "../shared/api";
import type { Access } from "./access";
import { catalogUrl } from "./access";
import {
  GraduationCap,
  Users,
  BookOpen,
  ArrowUpRight,
  School,
} from "lucide-react";
import "./NextWorkspace.css";

type Link = { href: string; label: string; prefixes: string[]; icon?: string };
type Group = { label: string; links: Link[] };

function navigation(access: Access): Group[] {
  const groups: Group[] = [];
  const add = (label: string, links: Array<Link | false | undefined | null>) => {
    const visible = links.filter((link): link is Link => !!link);
    if (visible.length) groups.push({ label, links: visible });
  };

  if (access.teacherOnly) {
    add("Mi Trabajo Docente", [
      {
        href: "#/docencia/clases",
        label: "Mis clases asignadas",
        prefixes: [
          "/docencia",
          "/mis-grupos",
          "/asistencia/",
          "/evaluacion/",
          "/salones/",
        ],
      },
    ]);
  } else {
    add("Gestión Académica", [
      access.reader && { href: "#/gestion-academica", label: "Gestión Académica", prefixes: ["/gestion-academica"] },
      access.reader && { href: "#/matriz-curricular", label: "Matriz curricular", prefixes: ["/matriz-curricular"] },
    ]);

    add("Alumnos y Matrícula", [
      access.reader && { href: "#/matriculas", label: "Gestión de matrículas", prefixes: ["/matriculas"] },
      access.enrollments && { href: "#/vouchers", label: "Comprobantes de pago (Vouchers)", prefixes: ["/vouchers"] },
      access.admin && { href: "#/estudiantes", label: "Padrón de estudiantes", prefixes: ["/estudiantes"] },
    ]);

    add("Cierre Académico y Actas", [
      (access.admin || access.reader) && { href: "#/actas", label: "Actas de Cierre por Salón", prefixes: ["/actas", "/evaluacion/grupos"] },
      access.reports && { href: "#/reportes", label: "Reportes y Matrices PDF", prefixes: ["/reportes"] },
    ]);

    if (access.admin || access.reader) {
      add("Configuración y Catálogos", [
        access.admin && { href: `#${catalogUrl(access, "docentes")}`, label: "Plana docente", prefixes: ["/configuracion/docentes"] },
        access.reader && { href: `#${catalogUrl(access, "periodos")}`, label: "Periodos académicos", prefixes: ["/configuracion/periodos", "/consulta/periodos"] },
        access.reader && { href: `#${catalogUrl(access, "turnos")}`, label: "Turnos y horarios", prefixes: ["/configuracion/turnos", "/consulta/turnos"] },
        access.reader && { href: `#${catalogUrl(access, "idiomas")}`, label: "Idiomas y niveles", prefixes: ["/configuracion/idiomas", "/consulta/idiomas", "/configuracion/niveles"] },
        access.admin && { href: `#${catalogUrl(access, "usuarios")}`, label: "Usuarios y roles", prefixes: ["/configuracion/usuarios"] },
      ]);
    }
  }

  return groups;
}

export function NextWorkspace({
  access, path, title, userName, roles, children, onExit, onUseCurrent,
}: {
  access: Access;
  path: string;
  title: string;
  userName: string;
  roles: string[];
  children: ReactNode;
  onExit: () => void;
  onUseCurrent: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const groups = navigation(access).map((group) => ({
    ...group,
    links: group.links.filter((link) => link.label.toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es"))),
  })).filter((group) => group.links.length);

  return (
    <div className="next-workspace">
      <aside className={`next-sidebar ${menuOpen ? "is-open" : ""}`}>
        <div className="next-brand"><Brand /></div>
        <div className="next-nav-heading">Menú Principal</div>
        <label className="next-nav-search">
          <span aria-hidden="true">⌕</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar sección…" aria-label="Buscar sección" />
          <kbd>/</kbd>
        </label>
        <nav aria-label="Navegación principal" onClick={() => setMenuOpen(false)}>
          <a className={`next-home-link ${path === "/" ? "is-current" : ""}`} href="#/">
            <span className="next-nav-icon">⌂</span> Inicio
          </a>
          {groups.map((group) => (
            <section className="next-nav-group" key={group.label}>
              <h2>{group.label}</h2>
              {group.links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className={link.prefixes.some((prefix) => path.startsWith(prefix)) ? "is-current" : ""}
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

      {menuOpen && <button className="next-scrim" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)} />}

      <div className="next-main-shell">
        <header className="next-topbar">
          <Button className="next-menu-toggle" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen}>
            ☰
          </Button>
          <div className="next-breadcrumb">
            <span>Excel</span>
            <b>/</b>
            <strong>{path === "/" ? "Panel Principal" : title}</strong>
          </div>
          <div className="next-top-actions">
            <div className="next-account">
              <span className="next-avatar">{userName.trim().slice(0, 1).toUpperCase()}</span>
              <span>
                <strong>{userName}</strong>
                <small>{roles.map((role) => roleNames[role] ?? role).join(" · ")}</small>
              </span>
            </div>
            <Button onClick={onUseCurrent} style={{ fontSize: "0.75rem" }}>
              Modo Clásico
            </Button>
            <Button onClick={onExit} style={{ fontSize: "0.75rem" }}>
              Cerrar sesión
            </Button>
          </div>
        </header>

        <main className="next-content" key={path}>
          {path === "/" ? <NextHome access={access} userName={userName} /> : children}
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
  const firstName = userName.trim().split(/\s+/)[0] || userName;
  const [metrics, setMetrics] = useState({
    grupos: 0,
    matriculados: 0,
    programas: 0,
    docentes: 0,
    periodo: "2026-I",
  });

  useEffect(() => {
    async function loadStats() {
      try {
        const [grps, nivs, docs, perds] = await Promise.all([
          allRows("oferta/grupos").catch(() => []),
          allRows("oferta/niveles").catch(() => []),
          allRows("docentes").catch(() => []),
          allRows("oferta/periodos").catch(() => []),
        ]);
        const totalMatriculados = grps.reduce((acc, g) => acc + (Number(g.matriculados) || 0), 0);
        const activoPerd = perds.find((p) => p.estado === "ACTIVO" || p.estado === "PLANIFICADO");
        setMetrics({
          grupos: grps.length,
          matriculados: totalMatriculados,
          programas: nivs.length,
          docentes: docs.length,
          periodo: activoPerd?.codigo ? String(activoPerd.codigo) : "2026-I",
        });
      } catch {
        // Fallback demo values if unauthenticated query
      }
    }
    void loadStats();
  }, []);

  return (
    <section className="next-home">
      <p className="next-eyebrow">
        CENTRO DE IDIOMAS EXCEL <span>·</span> CUSCO
      </p>

      {/* Banner de bienvenida */}
      <div className="next-welcome">
        <div>
          <span className="next-welcome-label">Periodo Académico {metrics.periodo}</span>
          <h1>Hola, {firstName}</h1>
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

      {/* Estadísticas en Vivo (KPI Cards) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "1rem",
          margin: "1.75rem 0",
        }}
      >
        <div className="academic-card" style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div style={{ width: "3rem", height: "3rem", borderRadius: "0.75rem", backgroundColor: "#f0faf4", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <School size={24} color="#007a3d" />
          </div>
          <div>
            <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", margin: 0, textTransform: "uppercase" }}>Salones de Clase</p>
            <h3 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#1e293b", margin: "0.2rem 0 0 0" }}>{metrics.grupos}</h3>
            <span style={{ fontSize: "0.6875rem", color: "#007a3d", fontWeight: 600 }}>En periodo {metrics.periodo}</span>
          </div>
        </div>

        <div className="academic-card" style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div style={{ width: "3rem", height: "3rem", borderRadius: "0.75rem", backgroundColor: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <GraduationCap size={24} color="#2563eb" />
          </div>
          <div>
            <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", margin: 0, textTransform: "uppercase" }}>Estudiantes Activos</p>
            <h3 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#1e293b", margin: "0.2rem 0 0 0" }}>{metrics.matriculados}</h3>
            <span style={{ fontSize: "0.6875rem", color: "#2563eb", fontWeight: 600 }}>Matrículas registradas</span>
          </div>
        </div>

        <div className="academic-card" style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div style={{ width: "3rem", height: "3rem", borderRadius: "0.75rem", backgroundColor: "#fdf4ff", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <BookOpen size={24} color="#a855f7" />
          </div>
          <div>
            <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", margin: 0, textTransform: "uppercase" }}>Programas Ofertados</p>
            <h3 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#1e293b", margin: "0.2rem 0 0 0" }}>{metrics.programas}</h3>
            <span style={{ fontSize: "0.6875rem", color: "#a855f7", fontWeight: 600 }}>Niveles académicos</span>
          </div>
        </div>

        <div className="academic-card" style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div style={{ width: "3rem", height: "3rem", borderRadius: "0.75rem", backgroundColor: "#fff7ed", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Users size={24} color="#ea580c" />
          </div>
          <div>
            <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "#64748b", margin: 0, textTransform: "uppercase" }}>Plana Docente</p>
            <h3 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#1e293b", margin: "0.2rem 0 0 0" }}>{metrics.docentes}</h3>
            <span style={{ fontSize: "0.6875rem", color: "#ea580c", fontWeight: 600 }}>Profesores habilitados</span>
          </div>
        </div>
      </div>

      {/* Accesos Rápidos Principales */}
      <div className="next-section-heading">
        <div>
          <span>MÓDULOS DEL SISTEMA</span>
          <h2>Acceso directo</h2>
        </div>
        <p>Selecciona una sección para comenzar.</p>
      </div>

      <div className="next-quick-grid">
        <a href="#/gestion-academica" className="next-quick-card">
          <span className="next-quick-index">01</span>
          <span className="next-quick-arrow" aria-hidden="true"><ArrowUpRight size={18} /></span>
          <strong>Gestión Académica</strong>
          <small>Salones, programas y UDs <span aria-hidden="true">→</span></small>
        </a>

        <a href="#/matriz-curricular" className="next-quick-card">
          <span className="next-quick-index">02</span>
          <span className="next-quick-arrow" aria-hidden="true"><ArrowUpRight size={18} /></span>
          <strong>Matriz Curricular</strong>
          <small>Competencias y criterios <span aria-hidden="true">→</span></small>
        </a>

        <a href="#/matriculas" className="next-quick-card">
          <span className="next-quick-index">03</span>
          <span className="next-quick-arrow" aria-hidden="true"><ArrowUpRight size={18} /></span>
          <strong>Gestión de Matrículas</strong>
          <small>Nóminas e inscripciones <span aria-hidden="true">→</span></small>
        </a>

        <a href="#/actas" className="next-quick-card">
          <span className="next-quick-index">04</span>
          <span className="next-quick-arrow" aria-hidden="true"><ArrowUpRight size={18} /></span>
          <strong>Cierre Oficial de Actas</strong>
          <small>Auditoría y sellado de salón <span aria-hidden="true">→</span></small>
        </a>
      </div>

      <p className="next-home-note">
        <span aria-hidden="true">✦</span> Los accesos y acciones se adaptan automáticamente a tus permisos y roles asignados.
      </p>
    </section>
  );
}
