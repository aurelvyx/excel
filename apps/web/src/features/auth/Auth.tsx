import { Feedback } from "../../shared/ui/Feedback";
import { Button } from "../../shared/ui/Button";
import { InputField } from "../../shared/ui/Field";
import {
  useEffect,
  useState,
  useRef,
  type ReactNode,
  type FormEvent,
} from "react";
import {
  api,
  ApiError,
  errorText,
  setSession,
  type Session,
} from "../../shared/api";
import { Context, useAuth } from "./session";
export function Auth({ children }: { children: ReactNode }) {
  const authenticated = useRef(false);
  const generation = useRef(0);
  const [session, update] = useState<Session | null>(null);
  const [loading, load] = useState(true);
  const [error, fail] = useState("");
  const [notice, notify] = useState("");
  function accept(value: Session | null) {
    generation.current++;
    applySession(value);
  }
  function applySession(value: Session | null) {
    authenticated.current = !!value;
    setSession(value);
    update(value);
  }
  async function refresh() {
    const expected = generation.current;
    const value = await api<Session>("auth/me");
    if (expected === generation.current) applySession(value);
  }
  async function restore() {
    load(true);
    fail("");
    try {
      await refresh();
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) fail(errorText(e));
    } finally {
      load(false);
    }
  }
  useEffect(() => {
    void restore();
    const expired = () => {
      if (!authenticated.current) return;
      accept(null);
      notify("Tu sesión terminó. Ingresa nuevamente para continuar.");
    };
    window.addEventListener("session-expired", expired);
    return () => window.removeEventListener("session-expired", expired);
    // Recuperar cookie de sesión únicamente al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!session) return;
    const check = () => {
      if (document.visibilityState === "visible")
        void refresh().catch(() => {});
    };
    window.addEventListener("focus", check);
    const timer = window.setInterval(check, 60000);
    return () => {
      window.removeEventListener("focus", check);
      window.clearInterval(timer);
    };
    // El ID evita recrear el intervalo al refrescar CSRF.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);
  const changedPassword = () => {
    accept(null);
    notify("Contraseña actualizada. Ingresa con tu nueva contraseña.");
  };
  if (loading)
    return (
      <div className="center" role="status">
        Comprobando tu sesión…
      </div>
    );
  if (error)
    return (
      <div className="center">
        <p role="alert">{error}</p>
        <Button onClick={() => void restore()}>Reintentar conexión</Button>
      </div>
    );
  if (!session) return <Login onLogin={accept} notice={notice} />;
  return (
    <Context.Provider
      value={{
        session,
        refresh,
        changedPassword,
        logout: async () => {
          await api("auth/logout", { method: "POST", body: {} });
          accept(null);
          notify("Sesión cerrada.");
        },
      }}
    >
      {session.user.requiere_cambio_clave ? (
        <div className="auth-wrap">
          <div className="auth-card">
            <Brand />
            <PasswordForm mandatory />
          </div>
        </div>
      ) : (
        children
      )}
    </Context.Provider>
  );
}
export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">
        E
      </span>
      <span>
        EXCEL<small>Centro de Idiomas · Cusco</small>
      </span>
    </div>
  );
}
function Login({
  onLogin,
  notice,
}: {
  onLogin: (session: Session) => void;
  notice: string;
}) {
  const [error, fail] = useState("");
  const [busy, pending] = useState(false);
  const [show, reveal] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    pending(true);
    fail("");
    try {
      onLogin(
        await api<Session>("auth/login", {
          method: "POST",
          body: {
            nombreUsuario: form.get("usuario"),
            password: form.get("password"),
          },
        }),
      );
    } catch (e) {
      fail(errorText(e));
    } finally {
      pending(false);
    }
  }
  return (
    <div className="login-layout">
      <aside className="login-intro">
        <Brand />
        <div>
          <p className="eyebrow">Gestión académica</p>
          <h1>
            Un espacio para
            <br />
            seguir aprendiendo.
          </h1>
          <p>La organización del centro, en un solo lugar.</p>
        </div>
        <small>Centro de Idiomas Excel · Cusco</small>
      </aside>
      <main className="login-main">
        <section className="auth-card">
          <p className="eyebrow">Bienvenido de nuevo</p>
          <h2>Ingresa a tu cuenta</h2>
          <p className="muted">
            Utiliza el usuario asignado por el administrador.
          </p>
          <Feedback tone="notice">{notice}</Feedback>
          <form onSubmit={submit}>
            <InputField
              label="Usuario"
              id="usuario"
              name="usuario"
              autoComplete="username"
              required
              minLength={3}
              maxLength={60}
              pattern="[a-zA-Z0-9_.\-]+"
              autoFocus
            />
            <InputField
              label="Contraseña"
              id="password"
              name="password"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              required
              maxLength={128}
              endAdornment={
                <Button
                  type="button"
                  variant="quiet"
                  onClick={() => reveal(!show)}
                  aria-pressed={show}
                >
                  {show ? "Ocultar" : "Mostrar"}
                </Button>
              }
            />
            <Feedback tone="error">{error}</Feedback>
            <Button
              type="submit"
              variant="primary"
              className="full"
              busy={busy}
              busyLabel="Ingresando…"
            >
              Ingresar
            </Button>
          </form>
          <p className="help">
            Si no puedes acceder, comunícate con el administrador del centro.
          </p>
        </section>
      </main>
    </div>
  );
}
export function PasswordForm({ mandatory = false }: { mandatory?: boolean }) {
  const { changedPassword, logout } = useAuth();
  const [busy, pending] = useState(false);
  const [error, fail] = useState("");
  const [mismatch, setMismatch] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const match = data.get("new") === data.get("confirm");
    setMismatch(!match);
    if (!match) return;
    pending(true);
    fail("");
    try {
      await api("auth/password", {
        method: "POST",
        body: {
          passwordActual: data.get("current"),
          passwordNueva: data.get("new"),
        },
      });
      changedPassword();
    } catch (e) {
      fail(errorText(e));
    } finally {
      pending(false);
    }
  }
  return (
    <section>
      <h1>
        {mandatory ? "Cambia tu contraseña temporal" : "Cambiar contraseña"}
      </h1>
      <p className="muted">
        Usa entre 12 y 128 caracteres. Al guardar se cerrarán tus sesiones
        abiertas.
      </p>
      <form onSubmit={submit} className="narrow">
        <InputField
          label="Contraseña actual"
          id="current"
          name="current"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
        />
        <InputField
          label="Nueva contraseña"
          id="new"
          name="new"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
          pattern=".*\S.*"
        />
        <InputField
          label="Repetir nueva contraseña"
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={128}
          error={mismatch ? "Las contraseñas no coinciden." : undefined}
        />
        <Feedback tone="error">{error}</Feedback>
        <div className="actions">
          <Button
            type="submit"
            variant="primary"
            busy={busy}
            busyLabel="Guardando…"
          >
            Guardar contraseña
          </Button>
          {mandatory && (
            <Button
              type="button"
              disabled={busy}
              onClick={() => void logout().catch((e) => fail(errorText(e)))}
            >
              Cerrar sesión
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
