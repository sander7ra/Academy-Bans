import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";
import { academicBadges, getAcademicState } from "./discipline.js";

let profile = null;

export function setCommunityProfile(value) {
  profile = value;
}

function memberSlug(value) {
  return String(value || "integrante").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-");
}

function memberImage(username) {
  return `./assets/images/members/${memberSlug(username)}-icon.png`;
}

function avatar(username, name, small = false) {
  const image = document.createElement("img");
  image.className = `avatar${small ? " small" : ""}`;
  image.src = memberImage(username);
  image.alt = `Foto de ${name || "integrante"}`;
  image.onerror = () => {
    image.onerror = null;
    image.src = "./assets/images/members/default-member.svg";
  };
  return image;
}

function dateValue(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value.seconds) return new Date(value.seconds * 1000);
  return new Date(value);
}

function formatDate(value) {
  const date = dateValue(value);
  if (!date || Number.isNaN(date.getTime())) return "Ahora";
  return new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function identityBadges(state) {
  const badge = academicBadges(state);
  const node = document.createElement("span");
  node.className = "identity-badges";
  if (badge.star) {
    const star = document.createElement("span");
    star.className = "star";
    star.textContent = " ⭐";
    node.append(star);
  }
  if (badge.warnings) node.append(document.createTextNode(` ${"🔖".repeat(badge.warnings)}`));
  return node;
}

function authorBlock(item, state, small = false) {
  const block = document.createElement("div");
  block.className = small ? "reply-author" : "post-author";
  const data = document.createElement("div");
  data.className = "post-author-data";
  const name = document.createElement("strong");
  name.textContent = item.autorNombre || item.autorUsuario || "Integrante";
  name.append(identityBadges(state));
  const meta = document.createElement("small");
  meta.textContent = item.autorRol === "profesor"
    ? "Profesor"
    : `${item.autorCasa ? `Casa ${String(item.autorCasa).replace(/^Casa\s+/i, "")}` : "Sin casa"} · Grado ${item.autorGrado || "—"}`;
  data.append(name, meta);
  block.append(avatar(item.autorUsuario, item.autorNombre, small), data);
  return block;
}

async function createPost(form) {
  const content = form.elements.contenido.value.trim();
  const status = form.querySelector(".form-status");
  const button = form.querySelector("button[type=submit]");
  if (!content) return;
  if (content.length > 1200) {
    status.textContent = "La publicación no puede superar 1200 caracteres.";
    return;
  }
  button.disabled = true;
  status.textContent = "Publicando…";
  try {
    await addDoc(collection(db, "publicaciones"), {
      autorId: auth.currentUser.uid,
      autorUsuario: String(profile.usuario || ""),
      autorNombre: String(profile.nombre || profile.usuario || "Integrante"),
      autorRol: String(profile.rol || "alumno"),
      autorCasa: String(profile.casa || "").replace(/^Casa\s+/i, ""),
      autorGrado: String(profile.grado || ""),
      contenido: content,
      creadaEn: serverTimestamp()
    });
    form.reset();
    await initCommunityPage("Publicación compartida.");
  } catch (error) {
    console.error(error);
    status.textContent = "No se pudo publicar. Revisa las reglas de Firestore.";
    button.disabled = false;
  }
}

async function reportPost(post) {
  const reportRef = doc(db, "reportesPosts", post.id);
  await setDoc(reportRef, {
    postId: post.id,
    contenidoPost: String(post.contenido || ""),
    autorId: post.autorId,
    autorUsuario: String(post.autorUsuario || ""),
    autorNombre: String(post.autorNombre || post.autorUsuario || "Alumno"),
    autorRol: String(post.autorRol || "alumno"),
    autorCasa: String(post.autorCasa || "").replace(/^Casa\s+/i, ""),
    autorGrado: String(post.autorGrado || ""),
    reportadoPorId: auth.currentUser.uid,
    reportadoPorNombre: String(profile.nombre || profile.usuario || "Alumno estrella"),
    estado: "pendiente",
    profesorId: null,
    profesorNombre: "",
    resultado: "",
    creadaEn: serverTimestamp(),
    resueltaEn: null
  });
}

async function renderPost(post, states) {
  const [likesSnapshot, repliesSnapshot] = await Promise.all([
    getDocs(collection(db, "publicaciones", post.id, "likes")),
    getDocs(query(collection(db, "publicaciones", post.id, "respuestas"), orderBy("creadaEn", "asc")))
  ]);
  const currentState = states.get(auth.currentUser.uid);
  const ownBadges = academicBadges(currentState);
  const liked = likesSnapshot.docs.some(item => item.id === auth.currentUser.uid);
  const card = document.createElement("article");
  card.className = "community-post";
  const head = document.createElement("div");
  head.className = "post-head";
  head.append(authorBlock(post, states.get(post.autorId)));
  const right = document.createElement("div");
  right.className = "post-time";
  right.textContent = formatDate(post.creadaEn);
  if (post.autorId === auth.currentUser.uid) {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "post-delete";
    remove.textContent = "Borrar";
    remove.addEventListener("click", async () => {
      if (!confirm("¿Borrar esta publicación?")) return;
      remove.disabled = true;
      try {
        await deleteDoc(doc(db, "publicaciones", post.id));
        await initCommunityPage("Publicación eliminada.");
      } catch {
        remove.textContent = "No se pudo borrar";
      }
    });
    right.append(document.createElement("br"), remove);
  }
  head.append(right);

  const content = document.createElement("p");
  content.className = "post-content";
  content.textContent = post.contenido;
  const actions = document.createElement("div");
  actions.className = "post-actions";
  const like = document.createElement("button");
  like.type = "button";
  like.className = liked ? "liked" : "";
  like.textContent = `${liked ? "♥" : "♡"} ${likesSnapshot.size}`;
  like.setAttribute("aria-label", liked ? "Quitar me gusta" : "Dar me gusta");
  like.addEventListener("click", async () => {
    like.disabled = true;
    const ref = doc(db, "publicaciones", post.id, "likes", auth.currentUser.uid);
    try {
      if (liked) await deleteDoc(ref);
      else await setDoc(ref, { usuarioId: auth.currentUser.uid, fecha: serverTimestamp() });
      await initCommunityPage();
    } catch {
      like.disabled = false;
    }
  });
  const replyToggle = document.createElement("button");
  replyToggle.type = "button";
  replyToggle.textContent = `Responder · ${repliesSnapshot.size}`;
  actions.append(like, replyToggle);

  const mayReport = profile.rol === "alumno" && ownBadges.star
    && post.autorRol === "alumno" && post.autorId !== auth.currentUser.uid;
  if (mayReport) {
    const report = document.createElement("button");
    report.type = "button";
    report.className = "report-post";
    report.textContent = "⚑ Reportar";
    report.addEventListener("click", async () => {
      if (!confirm("¿Enviar esta publicación al panel de profesores?")) return;
      report.disabled = true;
      try {
        await reportPost(post);
        report.textContent = "Reporte enviado";
      } catch (error) {
        report.textContent = error.message || "No se pudo reportar";
      }
    });
    actions.append(report);
  }

  const replies = document.createElement("div");
  replies.className = "replies";
  replies.hidden = repliesSnapshot.empty;
  repliesSnapshot.docs.forEach(item => {
    const data = item.data();
    const reply = document.createElement("div");
    reply.className = "reply";
    reply.append(authorBlock(data, states.get(data.autorId), true));
    const text = document.createElement("p");
    text.textContent = data.contenido;
    reply.append(text);
    replies.append(reply);
  });

  const form = document.createElement("form");
  form.className = "reply-form";
  form.hidden = true;
  const input = document.createElement("textarea");
  input.name = "respuesta";
  input.maxLength = 500;
  input.required = true;
  input.placeholder = "Escribe una respuesta…";
  const send = document.createElement("button");
  send.type = "submit";
  send.className = "community-button";
  send.textContent = "Enviar";
  form.append(input, send);
  replyToggle.addEventListener("click", () => {
    form.hidden = !form.hidden;
    if (!form.hidden) input.focus();
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const answer = input.value.trim();
    if (!answer) return;
    send.disabled = true;
    try {
      await addDoc(collection(db, "publicaciones", post.id, "respuestas"), {
        autorId: auth.currentUser.uid,
        autorUsuario: String(profile.usuario || ""),
        autorNombre: String(profile.nombre || profile.usuario || "Integrante"),
        autorRol: String(profile.rol || "alumno"),
        autorCasa: String(profile.casa || "").replace(/^Casa\s+/i, ""),
        autorGrado: String(profile.grado || ""),
        contenido: answer,
        creadaEn: serverTimestamp()
      });
      await initCommunityPage();
    } catch {
      send.disabled = false;
      send.textContent = "Reintentar";
    }
  });

  card.append(head, content, actions, replies, form);
  return card;
}

export async function initCommunityPage(message = "") {
  const root = document.getElementById("community-app");
  if (!root || !profile || !auth.currentUser) return;
  root.innerHTML = "";

  if (message) {
    const notice = document.createElement("p");
    notice.className = "economy-notice";
    notice.textContent = message;
    root.append(notice);
  }

  const composer = document.createElement("form");
  composer.className = "composer";
  const composerHead = document.createElement("div");
  composerHead.className = "composer-head";
  composerHead.append(avatar(profile.usuario, profile.nombre));
  const intro = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = profile.nombre || profile.usuario || "Integrante";
  const subtitle = document.createElement("small");
  subtitle.textContent = "Comparte algo con toda la Academia";
  intro.append(title, document.createElement("br"), subtitle);
  composerHead.append(intro);
  const textarea = document.createElement("textarea");
  textarea.name = "contenido";
  textarea.maxLength = 1200;
  textarea.required = true;
  textarea.placeholder = "¿Qué quieres contar?";
  const footer = document.createElement("div");
  footer.className = "composer-actions";
  const counter = document.createElement("span");
  counter.className = "composer-counter";
  counter.textContent = "0 / 1200";
  textarea.addEventListener("input", () => { counter.textContent = `${textarea.value.length} / 1200`; });
  const status = document.createElement("p");
  status.className = "form-status";
  const publish = document.createElement("button");
  publish.type = "submit";
  publish.className = "community-button";
  publish.textContent = "Publicar";
  footer.append(counter, status, publish);
  composer.append(composerHead, textarea, footer);
  composer.addEventListener("submit", event => { event.preventDefault(); createPost(composer); });
  root.append(composer);

  const feed = document.createElement("div");
  feed.className = "community-feed";
  root.append(feed);
  try {
    const postsSnapshot = await getDocs(query(collection(db, "publicaciones"), orderBy("creadaEn", "desc"), limit(30)));
    const posts = postsSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    if (!posts.length) {
      feed.innerHTML = '<p class="community-empty">Todavía no hay publicaciones. ¡Inaugura el tablón!</p>';
      return;
    }
    const authorIds = [...new Set([...posts.map(item => item.autorId), auth.currentUser.uid])];
    const stateEntries = await Promise.all(authorIds.map(async uid => [uid, await getAcademicState(uid)]));
    const states = new Map(stateEntries);
    const cards = await Promise.all(posts.map(post => renderPost(post, states)));
    cards.forEach(card => feed.append(card));
  } catch (error) {
    console.error(error);
    feed.innerHTML = '<p class="task-error">No se pudieron cargar las publicaciones. Publica las reglas nuevas de Firestore.</p>';
  }
}
