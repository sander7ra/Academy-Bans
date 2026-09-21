import { collection, addDoc, setDoc, doc, getDocs, query, where, updateDoc, serverTimestamp, Timestamp, runTransaction } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

const CLOUD_NAME = "djbnw9tl";
const UPLOAD_PRESET = "tareas_team";
let profile = null;
const VALID_HOUSES = ["Concordia", "Divitiae", "Fatum", "Virtus"];

export function setTaskProfile(value) { profile = value; }

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

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

function taskSort(a, b) {
  return (dateValue(b.creadaEn)?.getTime() || 0) - (dateValue(a.creadaEn)?.getTime() || 0);
}

function normalizeGrade(value) {
  const grade = String(value || "").trim().toLowerCase().replace(/^grado\s+/, "");
  if (["todos", "todos los grados", "todos los rangos", "todas", "all"].includes(grade)) return "Todos";
  if (["a", "b", "s"].includes(grade)) return grade.toUpperCase();
  return String(value || "").trim();
}

function messageBox(text) {
  return el("div", "task-error", text);
}

function emptyBox(text) {
  return el("div", "empty-tasks", text);
}

function taskHeader(task) {
  const head = el("div", "task-card-head");
  const title = el("div");
  title.append(el("h3", "", task.titulo || "Tarea sin título"));
  const meta = el("div", "task-meta");
  const grade = normalizeGrade(task.grado);
  meta.append(el("span", "task-chip", grade === "Todos" ? "Todos los grados" : `Grado ${grade}`));
  (Array.isArray(task.casasDestino) ? task.casasDestino : []).forEach(house => meta.append(el("span", "task-chip house", house)));
  meta.append(el("span", `task-chip${task.estado === "cerrada" ? " closed" : ""}`, task.estado === "cerrada" ? "Cerrada" : "Activa"));
  title.append(meta);
  head.append(title, el("span", "task-chip", formatDate(task.fechaLimite)));
  return head;
}

function taskDescription(task) {
  return el("p", "", task.instrucciones || "Sin instrucciones.");
}

async function createTask(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = form.querySelector(".form-status");
  const button = form.querySelector("button[type=submit]");
  const data = new FormData(form);
  const assignedHouses = Array.isArray(profile.casasACargo) ? profile.casasACargo.filter(house => VALID_HOUSES.includes(house)) : [];
  const targetHouses = data.getAll("casas").map(String).filter(house => assignedHouses.includes(house));
  const dueDate = new Date(data.get("fechaLimite"));
  if (!targetHouses.length) {
    status.textContent = "Selecciona al menos una de tus casas asignadas.";
    return;
  }
  if (Number.isNaN(dueDate.getTime()) || dueDate <= new Date()) {
    status.textContent = "Selecciona una fecha futura.";
    return;
  }
  button.disabled = true;
  status.textContent = "Publicando tarea…";
  try {
    await addDoc(collection(db, "tareas"), {
      titulo: String(data.get("titulo")).trim(),
      instrucciones: String(data.get("instrucciones")).trim(),
      grado: normalizeGrade(data.get("grado")),
      casasDestino: targetHouses,
      fechaLimite: Timestamp.fromDate(dueDate),
      estado: "activa",
      profesorId: auth.currentUser.uid,
      profesorNombre: String(profile.nombre || profile.usuario || "Profesor"),
      creadaEn: serverTimestamp()
    });
    form.reset();
    form.hidden = true;
    status.textContent = "";
    await renderTeacherPanel();
  } catch (error) {
    console.error(error);
    status.textContent = "No se pudo publicar. Revisa las reglas de Firestore.";
  } finally { button.disabled = false; }
}

function teacherTaskCard(task, submissions) {
  const card = el("article", "task-card");
  card.append(taskHeader(task), taskDescription(task));
  const count = submissions.length;
  const graded = submissions.filter(item => item.estado === "calificada").length;
  card.append(el("p", "", `${count} entrega${count === 1 ? "" : "s"} · ${graded} calificada${graded === 1 ? "" : "s"}`));
  const actions = el("div", "task-actions");
  const toggle = el("button", "tasks-button secondary", count ? "Ver entregas" : "Sin entregas");
  toggle.type = "button";
  toggle.disabled = count === 0;
  const list = el("div", "submission-list");
  list.hidden = true;
  toggle.addEventListener("click", () => {
    list.hidden = !list.hidden;
    toggle.textContent = list.hidden ? "Ver entregas" : "Ocultar entregas";
  });
  actions.append(toggle);
  if (task.estado === "activa") {
    const close = el("button", "tasks-button secondary", "Cerrar tarea");
    close.type = "button";
    close.addEventListener("click", async () => {
      close.disabled = true;
      try { await updateDoc(doc(db, "tareas", task.id), { estado: "cerrada" }); await renderTeacherPanel(); }
      catch { close.disabled = false; close.textContent = "No se pudo cerrar"; }
    });
    actions.append(close);
  }
  card.append(actions);
  submissions.forEach(submission => list.append(teacherSubmission(submission)));
  card.append(list);
  return card;
}

function teacherSubmission(submission) {
  const item = el("article", "submission");
  let evidence;
  if (submission.metodo === "whatsapp") {
    evidence = el("div", "whatsapp-evidence", "WhatsApp");
    evidence.title = "El alumno indicó que entregó la actividad por WhatsApp";
  } else {
    const link = el("a");
    link.href = submission.fotoUrl;
    link.target = "_blank";
    link.rel = "noopener";
    const image = el("img");
    image.src = submission.fotoUrl;
    image.alt = `Entrega de ${submission.alumnoNombre || "alumno"}`;
    link.append(image);
    evidence = link;
  }
  const body = el("div");
  body.append(el("h4", "", submission.alumnoNombre || "Alumno"));
  body.append(el("p", "", `${submission.metodo === "whatsapp" ? "Entregada por WhatsApp" : "Foto subida"} · ${formatDate(submission.fechaEntrega)}${submission.entregadaTarde ? " · Tarde" : ""}`));
  if (submission.estado === "calificada") {
    body.append(el("div", "score", `${submission.calificacion}/100`));
    if (Number.isInteger(submission.monedasOtorgadas)) body.append(el("p", "coins-earned", `${submission.monedasOtorgadas} monedas generadas`));
    if (Number(submission.monedasADueda || 0) > 0) body.append(el("p", "coins-earned", `${submission.monedasADueda} aplicadas a su deuda · ${Number(submission.monedasAlMonedero || 0)} al monedero`));
    if (submission.comentario) body.append(el("p", "", submission.comentario));
  } else {
    const form = el("form", "grade-form");
    const scoreLabel = el("label", "", "Calificación");
    const score = el("input");
    score.type = "number"; score.name = "calificacion"; score.min = "1"; score.max = "100"; score.required = true;
    scoreLabel.append(score);
    const commentLabel = el("label", "", "Comentario");
    const comment = el("textarea");
    comment.name = "comentario"; comment.maxLength = 500; comment.placeholder = "Comentario opcional";
    commentLabel.append(comment);
    const button = el("button", "tasks-button", "Calificar");
    button.type = "submit";
    form.append(scoreLabel, commentLabel, button);
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const grade = Number(score.value);
      if (!Number.isInteger(grade) || grade < 1 || grade > 100) return;
      button.disabled = true; button.textContent = "Guardando…";
      try {
        const baseReward = grade === 100 ? 25 : grade >= 90 ? 20 : grade >= 80 ? 15 : grade >= 70 ? 10 : 5;
        const reward = baseReward + (submission.entregadaTarde ? 0 : 5);
        await runTransaction(db, async transaction => {
          const deliveryRef = doc(db, "entregas", submission.id);
          const studentWalletRef = doc(db, "monederos", submission.alumnoId);
          const currentDelivery = await transaction.get(deliveryRef);
          const wallet = await transaction.get(studentWalletRef);
          if (!currentDelivery.exists() || currentDelivery.data().estado !== "pendiente") throw new Error("Esta entrega ya fue calificada.");
          if (!wallet.exists()) throw new Error("El alumno debe abrir la versión nueva de la app antes de recibir monedas.");
          if (!Number.isInteger(wallet.data().deuda)) throw new Error("El alumno debe abrir la versión nueva de la app antes de recibir monedas.");
          const debt = Number(wallet.data().deuda || 0);
          const paidToDebt = Math.min(debt, reward);
          const toWallet = reward - paidToDebt;
          transaction.update(deliveryRef, {
            calificacion: grade,
            comentario: comment.value.trim(),
            estado: "calificada",
            calificadaEn: serverTimestamp(),
            monedasOtorgadas: reward,
            monedasADueda: paidToDebt,
            monedasAlMonedero: toWallet
          });
          transaction.update(studentWalletRef, {
            saldo: Number(wallet.data().saldo || 0) + toWallet,
            deuda: debt - paidToDebt,
            ultimaOperacion: submission.id,
            tipoOperacion: "calificacion",
            actualizadaEn: serverTimestamp()
          });
        });
        await renderTeacherPanel();
      } catch (error) { console.error(error); button.disabled = false; button.textContent = error.message || "Reintentar"; }
    });
    body.append(form);
  }
  item.append(evidence, body);
  return item;
}

async function renderTeacherPanel() {
  const root = document.getElementById("tasks-app");
  if (!root) return;
  root.replaceChildren();
  const toolbar = el("div", "tasks-toolbar");
  toolbar.append(el("h2", "", "Mis tareas publicadas"));
  const addButton = el("button", "tasks-button", "+ Nueva tarea");
  addButton.type = "button";
  toolbar.append(addButton);
  const form = document.createElement("form");
  form.className = "task-form paper-card";
  form.hidden = true;
  const assignedHouses = Array.isArray(profile.casasACargo) ? profile.casasACargo.filter(house => VALID_HOUSES.includes(house)) : [];
  form.innerHTML = `<label>Título<input name="titulo" maxlength="100" required placeholder="Ej. Teoría de pociones"></label><label>Instrucciones<textarea name="instrucciones" maxlength="2000" required placeholder="Explica qué deben realizar…"></textarea></label><fieldset class="house-targets"><legend>Casas destinatarias</legend>${assignedHouses.map(house => `<label><input type="checkbox" name="casas" value="${house}" checked> ${house}</label>`).join("")}</fieldset><div class="task-form-row"><label>Dirigida a<select name="grado" required><option value="Todos">Todos los grados</option><option value="B">Grado B</option><option value="A">Grado A</option><option value="S">Grado S</option></select></label><label>Fecha límite<input name="fechaLimite" type="datetime-local" required></label></div><p class="form-status" role="status"></p><button class="tasks-button" type="submit">Publicar tarea</button>`;
  if (!assignedHouses.length) {
    addButton.disabled = true;
    addButton.textContent = "Sin casas asignadas";
  }
  addButton.addEventListener("click", () => { form.hidden = !form.hidden; if (!form.hidden) form.querySelector("input").focus(); });
  form.addEventListener("submit", createTask);
  root.append(toolbar, form);
  if (!assignedHouses.length) root.append(messageBox("Dirección debe añadir el campo casasACargo a tu perfil antes de que publiques tareas."));
  const list = el("div", "task-list");
  root.append(list);
  try {
    const [taskSnapshot, submissionSnapshot] = await Promise.all([
      getDocs(query(collection(db, "tareas"), where("profesorId", "==", auth.currentUser.uid))),
      getDocs(query(collection(db, "entregas"), where("profesorId", "==", auth.currentUser.uid)))
    ]);
    const tasks = taskSnapshot.docs.map(item => ({ id: item.id, ...item.data() })).sort(taskSort);
    const submissions = submissionSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    if (!tasks.length) { list.append(emptyBox("Todavía no has publicado ninguna tarea.")); return; }
    tasks.forEach(task => list.append(teacherTaskCard(task, submissions.filter(item => item.tareaId === task.id))));
  } catch (error) {
    console.error(error);
    list.append(messageBox("No se pudieron cargar tus tareas. Revisa que las reglas nuevas estén publicadas."));
  }
}

async function compressImage(file) {
  if (!file.type.startsWith("image/")) throw new Error("Selecciona una imagen.");
  if (file.size > 15 * 1024 * 1024) throw new Error("La imagen original no puede superar 15 MB.");
  const bitmap = await createImageBitmap(file);
  const max = 1600;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", .78));
  if (!blob) throw new Error("No se pudo preparar la imagen.");
  return blob;
}

async function uploadToCloudinary(file) {
  const blob = await compressImage(file);
  const body = new FormData();
  body.append("file", blob, "entrega.webp");
  body.append("upload_preset", UPLOAD_PRESET);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body });
  if (!response.ok) throw new Error("Cloudinary rechazó la imagen.");
  const result = await response.json();
  return { fotoUrl: result.secure_url, publicId: result.public_id };
}

function studentTaskCard(task, delivery) {
  const card = el("article", "task-card");
  card.append(taskHeader(task), taskDescription(task));
  card.append(el("p", "", `Profesor: ${task.profesorNombre || "Sin asignar"}`));
  if (delivery) {
    const box = el("div", "delivery-box");
    const preview = el("div", "delivery-preview");
    let evidence;
    if (delivery.metodo === "whatsapp") evidence = el("div", "whatsapp-evidence", "WhatsApp");
    else { const image = el("img"); image.src = delivery.fotoUrl; image.alt = "Tu entrega"; evidence = image; }
    const details = el("div");
    details.append(el("strong", delivery.estado === "calificada" ? "status-graded" : "status-pending", delivery.estado === "calificada" ? "Calificada" : "Pendiente de calificar"));
    details.append(el("p", "", `${delivery.metodo === "whatsapp" ? "Entregada por WhatsApp" : "Foto enviada"} · ${formatDate(delivery.fechaEntrega)}${delivery.entregadaTarde ? " · Tarde" : ""}`));
    if (delivery.estado === "calificada") {
      details.append(el("div", "score", `${delivery.calificacion}/100`));
      if (Number.isInteger(delivery.monedasOtorgadas)) details.append(el("p", "coins-earned", `${delivery.monedasOtorgadas} monedas generadas`));
      if (Number(delivery.monedasADueda || 0) > 0) details.append(el("p", "coins-earned", `${delivery.monedasADueda} pagaron tu deuda · ${Number(delivery.monedasAlMonedero || 0)} llegaron a tu monedero`));
      if (delivery.comentario) details.append(el("p", "", `Comentario: ${delivery.comentario}`));
    }
    preview.append(evidence, details); box.append(preview); card.append(box);
  } else if (task.estado === "activa") {
    const form = el("form", "delivery-box");
    const methods = el("fieldset", "delivery-methods");
    methods.append(el("legend", "", "¿Cómo entregarás la tarea?"));
    const photoOption = el("label", "method-option");
    const photoRadio = el("input"); photoRadio.type = "radio"; photoRadio.name = "metodo"; photoRadio.value = "foto"; photoRadio.checked = true;
    photoOption.append(photoRadio, document.createTextNode(" Subir una foto"));
    const whatsappOption = el("label", "method-option");
    const whatsappRadio = el("input"); whatsappRadio.type = "radio"; whatsappRadio.name = "metodo"; whatsappRadio.value = "whatsapp";
    whatsappOption.append(whatsappRadio, document.createTextNode(" Ya la entregué por WhatsApp"));
    methods.append(photoOption, whatsappOption);
    const label = el("label", "upload-label", "Seleccionar foto de la tarea");
    const input = el("input"); input.type = "file"; input.accept = "image/jpeg,image/png,image/webp"; input.required = true;
    label.append(input);
    const selected = el("p", "selected-file", "JPG, PNG o WebP · máximo 15 MB antes de comprimir");
    input.addEventListener("change", () => { selected.textContent = input.files[0]?.name || "Ninguna imagen seleccionada"; });
    methods.addEventListener("change", () => {
      const whatsapp = whatsappRadio.checked;
      label.hidden = whatsapp; selected.hidden = whatsapp; input.required = !whatsapp;
    });
    const status = el("p", "form-status"); status.setAttribute("role", "status");
    const button = el("button", "tasks-button", "Entregar tarea"); button.type = "submit";
    form.append(methods, label, selected, status, button);
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const method = whatsappRadio.checked ? "whatsapp" : "foto";
      const file = input.files[0];
      if (method === "foto" && !file) return;
      button.disabled = true; button.textContent = method === "foto" ? "Subiendo foto…" : "Registrando entrega…"; status.textContent = "";
      try {
        const upload = method === "foto" ? await uploadToCloudinary(file) : { fotoUrl: "", publicId: "" };
        const late = (dateValue(task.fechaLimite)?.getTime() || Infinity) < Date.now();
        await setDoc(doc(db, "entregas", `${task.id}_${auth.currentUser.uid}`), {
          tareaId: task.id,
          tareaTitulo: task.titulo,
          profesorId: task.profesorId,
          alumnoId: auth.currentUser.uid,
          alumnoNombre: String(profile.nombre || profile.usuario || "Alumno"),
          metodo: method,
          fotoUrl: upload.fotoUrl,
          publicId: upload.publicId,
          fechaEntrega: serverTimestamp(),
          entregadaTarde: late,
          estado: "pendiente",
          calificacion: null,
          comentario: ""
        });
        await renderStudentPanel();
      } catch (error) {
        console.error(error); status.textContent = error.message || "No se pudo entregar.";
        button.disabled = false; button.textContent = "Reintentar entrega";
      }
    });
    card.append(form);
  } else card.append(el("p", "status-pending", "Esta tarea está cerrada."));
  return card;
}

async function renderStudentPanel() {
  const root = document.getElementById("tasks-app");
  if (!root) return;
  root.replaceChildren();
  const profileGrade = normalizeGrade(profile.grado);
  const toolbar = el("div", "tasks-toolbar");
  toolbar.append(el("h2", "", `Tareas del grado ${profileGrade}`));
  root.append(toolbar);
  const list = el("div", "task-list"); root.append(list);
  if (!["A", "B", "S"].includes(profileGrade)) { list.append(messageBox("Tu perfil no tiene un grado válido. Dirección debe asignarte A, B o S.")); return; }
  const studentHouse = String(profile.casa || "").replace(/^Casa\s+/i, "");
  if (!VALID_HOUSES.includes(studentHouse)) { list.append(messageBox("Tu perfil no tiene una casa válida. Dirección debe asignarte una casa.")); return; }
  try {
    const [taskSnapshot, deliverySnapshot] = await Promise.all([
      getDocs(query(collection(db, "tareas"), where("casasDestino", "array-contains", studentHouse))),
      getDocs(query(collection(db, "entregas"), where("alumnoId", "==", auth.currentUser.uid)))
    ]);
    const tasks = taskSnapshot.docs.map(item => ({ id: item.id, ...item.data() }))
      .filter(task => normalizeGrade(task.grado) === profileGrade || normalizeGrade(task.grado) === "Todos").sort(taskSort);
    const deliveries = new Map(deliverySnapshot.docs.map(item => [item.data().tareaId, { id: item.id, ...item.data() }]));
    if (!tasks.length) { list.append(emptyBox("No hay tareas publicadas para tu grado.")); return; }
    tasks.forEach(task => list.append(studentTaskCard(task, deliveries.get(task.id))));
  } catch (error) {
    console.error(error);
    list.append(messageBox("No se pudieron cargar las tareas. Revisa tu conexión e inténtalo nuevamente."));
  }
}

export async function initTasksPage() {
  const root = document.getElementById("tasks-app");
  if (!root || !profile || !auth.currentUser) return;
  const intro = document.getElementById("tasks-intro");
  if (profile.rol === "profesor") {
    intro.textContent = "Publica actividades y califica únicamente las entregas de tus propias tareas.";
    await renderTeacherPanel();
  } else if (profile.rol === "alumno") {
    intro.textContent = "Consulta las actividades de tu grado, entrégalas con foto o por WhatsApp y revisa tus calificaciones.";
    await renderStudentPanel();
  } else {
    root.replaceChildren(messageBox("Este rol todavía no tiene acceso al módulo de tareas."));
  }
}
