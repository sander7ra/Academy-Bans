import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";
import {
  academicBadges,
  activeWarningDates,
  applyWarning,
  awardYellowCard,
  getAcademicState,
  warningResultMessage
} from "./discipline.js";

let profile = null;
const COIN_IMAGE = "./assets/images/coin.png";

export function setStudentsProfile(value) {
  profile = value;
}

function memberSlug(value) {
  return String(value || "integrante").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-");
}

function avatar(student, small = false) {
  const image = document.createElement("img");
  image.className = `avatar${small ? " small" : ""}`;
  image.src = `./assets/images/members/${memberSlug(student.usuario)}-icon.png`;
  image.alt = `Foto de ${student.nombre || "alumno"}`;
  image.onerror = () => {
    image.onerror = null;
    image.src = "./assets/images/members/default-member.svg";
  };
  return image;
}

function assignedHouses() {
  return Array.isArray(profile?.casasACargo)
    ? profile.casasACargo.map(value => String(value).replace(/^Casa\s+/i, ""))
    : [];
}

function studentHouse(student) {
  return String(student.casa || "").replace(/^Casa\s+/i, "");
}

async function loadStudents() {
  const houses = assignedHouses();
  const publicSnapshot = await getDocs(collection(db, "perfilesPublicos"));
  const base = publicSnapshot.docs
    .map(item => ({ id: item.id, ...item.data() }))
    .filter(item => houses.includes(studentHouse(item)) && item.rol !== "profesor");
  const students = await Promise.all(base.map(async student => {
    const [walletSnapshot, state] = await Promise.all([
      getDoc(doc(db, "monederos", student.id)),
      getAcademicState(student.id)
    ]);
    return {
      ...student,
      saldo: walletSnapshot.exists() ? Number(walletSnapshot.data().saldo || 0) : 0,
      deuda: walletSnapshot.exists() ? Number(walletSnapshot.data().deuda || 0) : 0,
      state
    };
  }));
  return students.sort((a, b) => b.saldo - a.saldo || String(a.nombre || "").localeCompare(String(b.nombre || ""), "es"));
}

function badgeText(state) {
  const badges = academicBadges(state);
  return `${badges.star ? " ⭐" : ""}${badges.warnings ? ` ${"🔖".repeat(badges.warnings)}` : ""}`;
}

function rankingRow(student, index) {
  const row = document.createElement("div");
  row.className = "ranking-row";
  const place = document.createElement("span");
  place.className = "ranking-place";
  place.textContent = `#${index + 1}`;
  const name = document.createElement("strong");
  name.textContent = `${student.nombre || student.usuario || "Alumno"}${badgeText(student.state)}`;
  const coins = document.createElement("span");
  coins.className = "ranking-coins";
  const coin = document.createElement("img");
  coin.src = COIN_IMAGE;
  coin.alt = "Monedas";
  coins.append(coin, document.createTextNode(student.saldo.toLocaleString("es-MX")));
  row.append(place, avatar(student, true), name, coins);
  return row;
}

function studentCard(student, position, openDetails) {
  const card = document.createElement("article");
  card.className = "student-card";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  const summary = document.createElement("div");
  summary.className = "student-summary";
  const data = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = `${student.nombre || student.usuario || "Alumno"}${badgeText(student.state)}`;
  const meta = document.createElement("p");
  meta.className = "student-meta";
  meta.textContent = `Casa ${studentHouse(student)} · Grado ${student.grado || "—"} · Puesto #${position}`;
  data.append(title, meta);
  const balance = document.createElement("span");
  balance.className = "ranking-coins student-balance";
  const coin = document.createElement("img");
  coin.src = COIN_IMAGE;
  coin.alt = "";
  balance.append(coin, document.createTextNode(student.saldo.toLocaleString("es-MX")));
  summary.append(avatar(student), data, balance);
  card.append(summary);
  card.addEventListener("click", () => openDetails(student, position));
  card.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDetails(student, position);
    }
  });
  return card;
}

function stat(value, label) {
  const item = document.createElement("div");
  item.className = "student-stat";
  const number = document.createElement("strong");
  number.textContent = value;
  const text = document.createElement("span");
  text.textContent = label;
  item.append(number, text);
  return item;
}

async function renderStudentDetail(container, student, position) {
  container.innerHTML = '<div class="loading-card"><span class="spinner"></span><p>Abriendo expediente…</p></div>';
  try {
    const deliverySnapshot = await getDocs(query(collection(db, "entregas"), where("alumnoId", "==", student.id)));
    const deliveries = deliverySnapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    const graded = deliveries.filter(item => item.estado === "calificada" && Number.isFinite(Number(item.calificacion)));
    const average = graded.length
      ? Math.round(graded.reduce((total, item) => total + Number(item.calificacion), 0) / graded.length)
      : "—";
    const badges = academicBadges(student.state);
    const warnings = activeWarningDates(student.state);
    container.innerHTML = "";

    const detail = document.createElement("article");
    detail.className = "student-detail";
    const head = document.createElement("div");
    head.className = "student-detail-head";
    const summary = document.createElement("div");
    summary.className = "student-summary";
    const names = document.createElement("div");
    const title = document.createElement("h2");
    title.textContent = `${student.nombre || student.usuario || "Alumno"}${badgeText(student.state)}`;
    const meta = document.createElement("p");
    meta.className = "student-meta";
    meta.textContent = `Casa ${studentHouse(student)} · Grado ${student.grado || "—"}`;
    names.append(title, meta);
    summary.append(avatar(student), names);
    const close = document.createElement("button");
    close.type = "button";
    close.className = "community-button ghost";
    close.textContent = "Cerrar expediente";
    close.addEventListener("click", () => { container.innerHTML = ""; });
    head.append(summary, close);

    const stats = document.createElement("div");
    stats.className = "student-stat-grid";
    stats.append(
      stat(String(average), "Promedio"),
      stat(String(deliveries.length), "Entregas"),
      stat(student.saldo.toLocaleString("es-MX"), "Monedas"),
      stat(`#${position}`, "Popularidad")
    );
    const discipline = document.createElement("div");
    discipline.className = "discipline-strip";
    const yellow = document.createElement("span");
    yellow.className = "discipline-chip yellow";
    yellow.textContent = `🏷️ ${badges.yellowCards}/5 tarjetas`;
    discipline.append(yellow);
    if (badges.star) {
      const star = document.createElement("span");
      star.className = "discipline-chip star";
      star.textContent = "⭐ Alumno estrella";
      discipline.append(star);
    }
    const red = document.createElement("span");
    red.className = "discipline-chip";
    red.textContent = `🔖 ${warnings.length}/3 advertencias activas`;
    discipline.append(red);
    if (student.deuda > 0) {
      const debt = document.createElement("span");
      debt.className = "discipline-chip";
      debt.textContent = `Deuda: ${student.deuda} monedas`;
      discipline.append(debt);
    }

    const actions = document.createElement("div");
    actions.className = "moderation-actions";
    const addCard = document.createElement("button");
    addCard.type = "button";
    addCard.className = "community-button secondary";
    addCard.textContent = badges.star ? "Ya es alumno estrella" : "🏷️ Dar tarjeta amarilla";
    addCard.disabled = badges.star;
    addCard.addEventListener("click", async () => {
      if (!confirm(`¿Dar una tarjeta amarilla a ${student.nombre || "este alumno"}?`)) return;
      addCard.disabled = true;
      try {
        const result = await awardYellowCard(student);
        alert(result.becameStar ? "¡El alumno ascendió a alumno estrella!" : `Ahora tiene ${result.cards}/5 tarjetas.`);
        await initStudentsPage();
      } catch (error) {
        alert(error.message || "No se pudo entregar la tarjeta.");
        addCard.disabled = false;
      }
    });
    const warn = document.createElement("button");
    warn.type = "button";
    warn.className = "community-button";
    warn.textContent = "🔖 Aplicar advertencia";
    warn.disabled = warnings.length >= 3;
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
        const result = await applyWarning(student, days);
        alert(warningResultMessage(result));
        await initStudentsPage();
      } catch (error) {
        alert(error.message || "No se pudo aplicar la advertencia.");
        warn.disabled = false;
      }
    });
    actions.append(addCard, warn);

    const deliveryTitle = document.createElement("h3");
    deliveryTitle.className = "student-section-title";
    deliveryTitle.textContent = "Actividades entregadas";
    const list = document.createElement("div");
    list.className = "student-deliveries";
    if (!deliveries.length) {
      list.innerHTML = '<p class="community-empty">Este alumno todavía no ha entregado actividades.</p>';
    } else {
      deliveries.forEach(delivery => {
        const row = document.createElement("div");
        row.className = "student-delivery";
        const name = document.createElement("span");
        name.textContent = delivery.tareaTitulo || "Actividad";
        const grade = document.createElement("strong");
        grade.textContent = delivery.estado === "calificada" ? `${delivery.calificacion}/100` : "Pendiente";
        row.append(name, grade);
        list.append(row);
      });
    }
    detail.append(head, stats, discipline, actions, deliveryTitle, list);
    container.append(detail);
    detail.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    console.error(error);
    container.innerHTML = '<p class="task-error">No se pudo abrir el expediente. Revisa las reglas de Firestore.</p>';
  }
}

export async function initStudentsPage(message = "") {
  const root = document.getElementById("students-app");
  if (!root || !profile || !auth.currentUser) return;
  if (profile.rol !== "profesor") {
    root.innerHTML = '<p class="task-error">Esta sección es exclusiva de profesores.</p>';
    return;
  }
  root.innerHTML = '<div class="loading-card"><span class="spinner"></span><p>Consultando expedientes…</p></div>';
  try {
    const students = await loadStudents();
    root.innerHTML = "";
    if (message) {
      const notice = document.createElement("p");
      notice.className = "economy-notice";
      notice.textContent = message;
      root.append(notice);
    }
    const ranking = document.createElement("section");
    ranking.className = "ranking-panel";
    const kicker = document.createElement("p");
    kicker.className = "kicker";
    kicker.textContent = "Popularidad";
    const title = document.createElement("h2");
    title.textContent = "Ranking de tus casas";
    const list = document.createElement("div");
    list.className = "ranking-list";
    students.forEach((student, index) => list.append(rankingRow(student, index)));
    if (!students.length) list.innerHTML = '<p class="community-empty">No hay alumnos visibles en tus casas.</p>';
    ranking.append(kicker, title, list);

    const heading = document.createElement("h2");
    heading.className = "student-section-title";
    heading.textContent = "Expedientes de alumnos";
    const grid = document.createElement("div");
    grid.className = "student-grid";
    const detail = document.createElement("div");
    students.forEach((student, index) => grid.append(studentCard(student, index + 1, (item, position) => renderStudentDetail(detail, item, position))));
    root.append(ranking, heading, grid, detail);
  } catch (error) {
    console.error(error);
    root.innerHTML = '<p class="task-error">No se pudieron cargar los alumnos. Revisa las reglas y los perfiles públicos.</p>';
  }
}
