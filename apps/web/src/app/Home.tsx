import { resources } from "../features/configuration/model";
import { catalogUrl, type Access } from "./access";

const teacherCards = [
  ["asistencias", "Asistencias", "Elige uno de tus grupos y abre las sesiones para pasar lista."],
  ["calificaciones", "Calificaciones", "Registra notas en la matriz propia de cada grupo."],
];

const copy = (access: Access) =>
  access.admin
    ? {
        subtitle: "Prepara los ciclos, organiza las clases y gestiona la oferta del centro.",
        eyebrow: "Flujo de trabajo académico",
        title: "Organización académica y gestión de clases.",
        text: "Prepara el periodo, crea los grupos con sus docentes y administra la oferta de idiomas.",
        cards: ["periodos", "grupos", "idiomas"],
      }
    : access.reader
      ? {
          subtitle: "Consulta la oferta académica y las clases disponibles para tu trabajo.",
          eyebrow: "Información académica",
          title: "La oferta y las clases del centro, a tu alcance.",
          text: "Revisa los grupos de cada ciclo, niveles e idiomas desde las consultas autorizadas.",
          cards: ["grupos", "periodos", "idiomas"],
        }
      : {
          subtitle: "Encuentra tus grupos y consulta su información.",
          eyebrow: "Tu espacio docente",
          title: "Cada grupo, un nuevo aprendizaje.",
          text: "Consulta únicamente los grupos asignados a tu cuenta.",
          cards: ["grupos"],
        };

export function Home({ access, userName }: { access: Access; userName: string }) {
  const c = copy(access);
  const cards: { href: string; title: string; text: string }[] =
    access.teacherOnly
      ? teacherCards.map(([key, title, text]) => ({
          href: `#/docencia/${key}`,
          title,
          text,
        }))
      : c.cards.map((key) => ({
          href: `#${catalogUrl(access, key)}`,
          title: access.reader ? resources[key].title : "Mis grupos",
          text: access.reader
            ? resources[key].description
            : "Revisa los grupos que tienes asignados.",
        }));
  return (
    <>
      <header className="page-heading">
        <div>
          <p className="eyebrow">Centro de Idiomas Excel</p>
          <h1>Hola, {userName}</h1>
          <p className="muted">{c.subtitle}</p>
        </div>
        <span className="date-label">
          {new Intl.DateTimeFormat("es-PE", { dateStyle: "long" }).format(
            new Date(),
          )}
        </span>
      </header>
      <section className="welcome-panel">
        <div>
          <span className="eyebrow">{c.eyebrow}</span>
          <h2>{c.title}</h2>
          <p>{c.text}</p>
          <a className="primary button" href={`#${catalogUrl(access, "grupos")}`}>
            {access.reader ? "Consultar grupos" : "Ver mis grupos"}{" "}
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
        {cards.map((card, index) => (
          <a className="quick-card" href={card.href} key={card.href}>
            <span className="card-number">0{index + 1}</span>
            <h3>{card.title}</h3>
            <p>{card.text}</p>
            <span className="card-arrow" aria-hidden="true">
              ↗
            </span>
          </a>
        ))}
      </div>
    </>
  );
}
