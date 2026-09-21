import {
  collection,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  doc,
  where
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";
import { applyWarning, warningResultMessage } from "./discipline.js";

let profile = null;

export function setReportsProfile(value) {
  profile = value;
}

function dateValue(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value.seconds) return new Date(value.seconds * 1000);
  return new Date(value);
}

function formatDate(value) {
  const date = dateValue(value);
  if (!date || Number.isNaN(date.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function assignedHouses() {
  return Array.isArray(profile?.casasACargo)
    ? profile.casasACargo.map(value => String(value).replace(/^Casa\s+/i, ""))
    : [];
}

async function dismissReport(report) {
  await updateDoc(doc(db, "reportesPosts", report.id), {
    estado: "descartado",
    profesorId: auth.currentUser.uid,
    profesorNombre: String(profile.nombre || profile.usuario || "Profesor"),
    resueltaEn: serverTimestamp(),
    resultado: "sin_infraccion"
  });
}

function reportCard(report) {
  const card = document.createElement("article");
  card.className = "report-card";
  const head = document.createElement("div");
  head.className = "report-head";
  const data = document.createElement("div");
  const kicker = document.createElement("p");
  kicker.className = "kicker";
  kicker.textContent = `Casa ${report.autorCasa || "sin asignar"} · Grado ${report.autorGrado || "—"}`;
  const title = document.createElement("h2");
  title.textContent = report.autorNombre || report.autorUsuario || "Alumno";
  const meta = document.createElement("p");
  meta.className = "report-meta";
  meta.textContent = `Reportado por ${report.reportadoPorNombre || "un alumno estrella"} · ${formatDate(report.creadaEn)}`;
  data.append(kicker, title, meta);
  const status = document.createElement("span");
  status.className = `report-status ${report.estado}`;
  status.textContent = report.estado === "pendiente"
    ? "Pendiente"
    : report.estado === "advertencia" ? "Medida aplicada" : "Sin infracción";
  head.append(data, status);
  const content = document.createElement("p");
  content.className = "reported-content";
  content.textContent = report.contenidoPost || "Publicación sin contenido disponible.";
  card.append(head, content);

  if (report.estado === "pendiente") {
    const actions = document.createElement("div");
    actions.className = "report-actions";
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "community-button secondary";
    dismiss.textContent = "No fue nada";
    dismiss.addEventListener("click", async () => {
      if (!confirm("¿Cerrar este reporte sin aplicar una medida?")) return;
      dismiss.disabled = true;
      try {
        await dismissReport(report);
        await initReportsPage("Reporte cerrado sin infracción.");
      } catch {
        dismiss.textContent = "No se pudo cerrar";
        dismiss.disabled = false;
      }
    });
    const warn = document.createElement("button");
    warn.type = "button";
    warn.className = "community-button";
    warn.textContent = "Aplicar advertencia";
    warn.addEventListener("click", async () => {
      const value = prompt("¿Cuántos días debe durar la advertencia? (1 a 365)", "7");
      if (value === null) return;
      const days = Number(value);
      if (!Number.isInteger(days) || days < 1 || days > 365) {
        alert("Escribe una cantidad válida entre 1 y 365 días.");
        return;
      }
      if (!confirm(`¿Aplicar la medida disciplinaria durante ${days} días?`)) return;
      warn.disabled = true;
      try {
        const result = await applyWarning({
          id: report.autorId,
          usuario: report.autorUsuario,
          nombre: report.autorNombre,
          casa: report.autorCasa,
          grado: report.autorGrado
        }, days, report.id);
        await initReportsPage(warningResultMessage(result));
      } catch (error) {
        alert(error.message || "No se pudo aplicar la advertencia.");
        warn.disabled = false;
      }
    });
    actions.append(dismiss, warn);
    card.append(actions);
  } else {
    const resolution = document.createElement("p");
    resolution.className = "report-meta";
    resolution.textContent = `Atendido por ${report.profesorNombre || "Profesor"} · ${formatDate(report.resueltaEn)}`;
    card.append(resolution);
  }
  return card;
}

export async function initReportsPage(message = "") {
  const root = document.getElementById("reports-app");
  if (!root || !profile || !auth.currentUser) return;
  if (profile.rol !== "profesor") {
    root.innerHTML = '<p class="task-error">Esta sección es exclusiva de profesores.</p>';
    return;
  }
  const houses = assignedHouses();
  if (!houses.length) {
    root.innerHTML = '<p class="task-error">Dirección debe asignarte casas antes de consultar reportes.</p>';
    return;
  }
  root.innerHTML = '<div class="loading-card"><span class="spinner"></span><p>Consultando reportes…</p></div>';
  try {
    const snapshot = await getDocs(query(collection(db, "reportesPosts"), where("autorCasa", "in", houses)));
    const reports = snapshot.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => {
      if (a.estado === "pendiente" && b.estado !== "pendiente") return -1;
      if (a.estado !== "pendiente" && b.estado === "pendiente") return 1;
      return (dateValue(b.creadaEn)?.getTime() || 0) - (dateValue(a.creadaEn)?.getTime() || 0);
    });
    root.innerHTML = "";
    if (message) {
      const notice = document.createElement("p");
      notice.className = "economy-notice";
      notice.textContent = message;
      root.append(notice);
    }
    const summary = document.createElement("div");
    summary.className = "requests-summary";
    const count = reports.filter(item => item.estado === "pendiente").length;
    const strong = document.createElement("strong");
    strong.textContent = String(count);
    const text = document.createElement("span");
    text.textContent = "reportes pendientes";
    summary.append(strong, text);
    const list = document.createElement("div");
    list.className = "report-list";
    reports.forEach(report => list.append(reportCard(report)));
    if (!reports.length) list.innerHTML = '<p class="community-empty">No hay publicaciones reportadas en tus casas.</p>';
    root.append(summary, list);
  } catch (error) {
    console.error(error);
    root.innerHTML = '<p class="task-error">No se pudieron cargar los reportes. Revisa las reglas de Firestore.</p>';
  }
}
