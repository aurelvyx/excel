import { useEffect, useRef, useState } from "react";
import { Auth, Brand, PasswordForm } from "./features/auth/Auth";
import { useAuth } from "./features/auth/session";
import { ResourcePage } from "./features/configuration/ResourcePage";
import { resources, roleNames } from "./features/configuration/model";
import { useRoute } from "./shared/navigation";
import { errorText } from "./shared/api";

export default function App() {
  return (
    <Auth>
      <Workspace />
    </Auth>
  );
}
function Workspace() {
  const { session, logout } = useAuth();
  const { path, query } = useRoute();
  const admin = session.user.roles.includes("ADMIN");
  const reader = session.user.roles.some((role) =>
    ["ADMIN", "SECRETARIA", "COORDINADOR"].includes(role),
  );
  const [menuAt, toggle] = useState<string | null>(null);
  const menu = menuAt === path;
  const [error, fail] = useState("");
  const [busy, pending] = useState(false);
  const main = useRef<HTMLElement>(null);
  const base = admin ? "/configuracion" : "/consulta";
  const available = Object.values(resources).filter(
    (resource) =>
      admin ||
      (reader && !["docentes", "usuarios"].includes(resource.key)) ||
      (!reader && resource.key === "grupos"),
  );
  const selected = path.split("/")[2];
  const resource = resources[selected];
  const allowed =
    resource &&
    available.includes(resource) &&
    (path.startsWith(`${base}/`) || path === "/mis-grupos/grupos");
  useEffect(() => {
    main.current?.focus();
  }, [path]);
  async function exit() {
    pending(true);
    fail("");
    try {
      await logout();
    } catch (e) {
      fail(errorText(e));
    } finally {
      pending(false);
    }
  }
  const url = (key: string) =>
    reader ? `${base}/${key}` : "/mis-grupos/grupos";
  return (
    <div className="workspace">
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
      <aside className={`sidebar ${menu ? "expanded" : ""}`}>
        <Brand />
        <nav aria-label="Navegación principal" onClick={() => toggle(null)}>
          <a href="#/" aria-current={path === "/" ? "page" : undefined}>
            <span aria-hidden="true">⌂</span> Inicio
          </a>
          <p className="nav-label">
            {admin
              ? "Configuración"
              : reader
                ? "Consulta académica"
                : "Docencia"}
          </p>
          {available.map((item) => (
            <a
              key={item.key}
              href={`#${url(item.key)}`}
              aria-current={selected === item.key ? "page" : undefined}
            >
              {!reader ? "Mis grupos" : item.title}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="status-dot" />
          Gestión académica<small>Centro de Idiomas Excel</small>
        </div>
      </aside>
      <div className="workspace-body">
        <header className="topbar">
          <button
            className="menu-toggle"
            aria-expanded={menu}
            onClick={() => toggle(menu ? null : path)}
          >
            Menú
          </button>
          <span className="breadcrumb">
            Excel <span>/</span>{" "}
            {path === "/"
              ? "Inicio"
              : path === "/cuenta"
                ? "Mi cuenta"
                : (resource?.title ?? "Página")}
          </span>
          <div className="account">
            <a href="#/cuenta" className="account-name">
              {session.user.nombre_usuario}
              <small>
                {session.user.roles.map((role) => roleNames[role]).join(" · ")}
              </small>
            </a>
            <button disabled={busy} onClick={() => void exit()}>
              {busy ? "Saliendo…" : "Cerrar sesión"}
            </button>
          </div>
        </header>
        <main
          id="main-content"
          ref={main}
          tabIndex={-1}
          className="main-content"
        >
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {path === "/" ? (
            <>
              <header className="page-heading">
                <div>
                  <p className="eyebrow">Centro de Idiomas Excel</p>
                  <h1>Hola, {session.user.nombre_usuario}</h1>
                  <p className="muted">
                    {admin
                      ? "Prepara la oferta y organiza los accesos del centro."
                      : reader
                        ? "Consulta la oferta académica disponible para tu trabajo."
                        : "Encuentra tus grupos y consulta su información."}
                  </p>
                </div>
                <span className="date-label">
                  {new Intl.DateTimeFormat("es-PE", {
                    dateStyle: "long",
                  }).format(new Date())}
                </span>
              </header>
              <section className="welcome-panel">
                <div>
                  <span className="eyebrow">
                    {admin
                      ? "Organización del centro"
                      : reader
                        ? "Información académica"
                        : "Tu espacio docente"}
                  </span>
                  <h2>
                    {admin
                      ? "Todo comienza con una buena organización."
                      : reader
                        ? "La oferta del centro, a tu alcance."
                        : "Cada grupo, un nuevo aprendizaje."}
                  </h2>
                  <p>
                    {admin
                      ? "Configura los periodos, organiza los grupos y asigna a sus docentes."
                      : reader
                        ? "Revisa periodos, niveles y grupos desde las consultas autorizadas."
                        : "Consulta únicamente los grupos asignados a tu cuenta."}
                  </p>
                  <a className="primary button" href={`#${url("grupos")}`}>
                    {reader ? "Consultar grupos" : "Ver mis grupos"}{" "}
                    <span aria-hidden="true">→</span>
                  </a>
                </div>
                <div className="welcome-art" aria-hidden="true">
                  <span>EX</span>
                  <span>CEL</span>
                </div>
              </section>
              <h2 className="section-title">Accesos de tu cuenta</h2>
              <div className="quick-grid">
                {(admin
                  ? ["periodos", "docentes", "usuarios"]
                  : reader
                    ? ["idiomas", "niveles", "periodos"]
                    : ["grupos"]
                ).map((key, index) => (
                  <a className="quick-card" href={`#${url(key)}`} key={key}>
                    <span className="card-number">0{index + 1}</span>
                    <h3>{!reader ? "Mis grupos" : resources[key].title}</h3>
                    <p>
                      {!reader
                        ? "Revisa los grupos que tienes asignados."
                        : resources[key].description}
                    </p>
                    <span className="card-arrow" aria-hidden="true">
                      ↗
                    </span>
                  </a>
                ))}
              </div>
            </>
          ) : path === "/cuenta" ? (
            <div className="panel account-panel">
              <PasswordForm />
            </div>
          ) : allowed ? (
            <ResourcePage
              key={`${path}:${session.user.roles.join(",")}`}
              resource={resource}
              path={path}
              query={query}
            />
          ) : (
            <section className="empty">
              <h1>Página no disponible</h1>
              <p>Esta dirección no existe o no está habilitada para tu rol.</p>
              <a className="button primary" href="#/">
                Volver al inicio
              </a>
            </section>
          )}
        </main>
        <footer className="app-footer">
          Excel · Gestión académica <span>Cusco, Perú</span>
        </footer>
      </div>
    </div>
  );
}
