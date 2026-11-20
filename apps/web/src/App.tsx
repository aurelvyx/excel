import { Button } from "./shared/ui/Button";
import { useEffect, useRef, useState } from "react";
import { Auth, Brand } from "./features/auth/Auth";
import { useAuth } from "./features/auth/session";
import { roleNames } from "./features/configuration/model";
import { useRoute } from "./shared/navigation";
import { errorText } from "./shared/api";
import { requestPageExit } from "./shared/useUnsavedChanges";
import { accessFor } from "./app/access";
import { resolveRoute } from "./app/routes";
import { Sidebar } from "./app/Sidebar";
import { Home } from "./app/Home";
import { NextWorkspace } from "./app/NextWorkspace";

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
  const [nextUi, setNextUi] = useState(
    () => window.sessionStorage.getItem("excel-next-ui") !== "0" && query.get("ui") !== "antiguo",
  );
  const roles = session.user.roles;
  const access = accessFor(roles);
  const [menuAt, toggle] = useState<string | null>(null);
  const menu = menuAt === path;
  const [error, fail] = useState("");
  const [busy, pending] = useState(false);
  const main = useRef<HTMLElement>(null);
  const route =
    path === "/" ? null : resolveRoute({ path, query, access, roles });
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
  function switchToNext() {
    requestPageExit(() => {
      window.sessionStorage.setItem("excel-next-ui", "1");
      setNextUi(true);
    });
  }
  function switchToCurrent() {
    requestPageExit(() => {
      window.sessionStorage.setItem("excel-next-ui", "0");
      setNextUi(false);
    });
  }
  if (nextUi) {
    return (
      <NextWorkspace
        access={access}
        path={path}
        title={route?.title ?? "Inicio"}
        userName={session.user.nombre_usuario}
        roles={roles}
        onExit={() => requestPageExit(() => void exit())}
        onUseCurrent={switchToCurrent}
        busy={busy}
        error={error}
      >
        {route?.element ?? <NotAvailable />}
      </NextWorkspace>
    );
  }
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
      <Sidebar
        access={access}
        path={path}
        expanded={menu}
        onNavigate={() => toggle(null)}
      />
      <div className="workspace-body">
        <header className="topbar">
          <Button
            className="menu-toggle"
            aria-expanded={menu}
            onClick={() => toggle(menu ? null : path)}
          >
            Menú
          </Button>
          <div className="mobile-brand">
            <Brand />
          </div>
          <span className="breadcrumb">
            Excel <span>/</span> {path === "/" ? "Inicio" : route!.title}
          </span>
          <Button className="next-ui-switch" onClick={switchToNext}>
            Probar nueva interfaz
          </Button>
          <div className="account">
            <a href="#/cuenta" className="account-name">
              {session.user.nombre_usuario}
              <small>{roles.map((role) => roleNames[role]).join(" · ")}</small>
            </a>
            <Button
              disabled={busy}
              onClick={() => requestPageExit(() => void exit())}
            >
              {busy ? "Saliendo…" : "Cerrar sesión"}
            </Button>
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
            <Home access={access} userName={session.user.nombre_usuario} />
          ) : (
            (route!.element ?? <NotAvailable />)
          )}
        </main>
        <footer className="app-footer">
          Excel · Gestión académica <span>Cusco, Perú</span>
        </footer>
      </div>
    </div>
  );
}

function NotAvailable() {
  return (
    <section className="empty">
      <h1>Página no disponible</h1>
      <p>Esta dirección no existe o no está habilitada para tu rol.</p>
      <a className="button primary" href="#/">
        Volver al inicio
      </a>
    </section>
  );
}
