import { initTasksPage } from "./tasks.js";
import { initHousePage } from "./house.js";
import { initStorePage, initRequestsPage } from "./economy.js";
import { initCommunityPage } from "./community.js";
import { initStudentsPage } from "./students.js";
import { initReportsPage } from "./reports.js";

const routes = new Set(["home", "reglas", "lore", "ajustes", "casa", "calendario", "tareas", "tienda", "solicitudes", "alumnos", "reportes"]);
let currentRoute = "";
let profile = null;

export function setRouterProfile(value) {
  profile = value;
}

function routeFromHash() {
  const requested = location.hash.slice(1).toLowerCase();
  if (!routes.has(requested)) return "home";
  if (profile?.rol === "profesor" && ["casa", "calendario"].includes(requested)) return "home";
  if (profile?.rol !== "profesor" && ["alumnos", "reportes"].includes(requested)) return "home";
  if (requested === "solicitudes" && !(profile?.esAdmin === true || profile?.rol === "admin")) return "home";
  return requested;
}

function setActiveLinks(route) {
  document.querySelectorAll("[data-route]").forEach(link => {
    const active = link.dataset.route === route;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

export async function renderRoute(force = false) {
  const content = document.getElementById("page-content");
  const route = routeFromHash();
  if (location.hash.slice(1).toLowerCase() !== route) history.replaceState(null, "", `#${route}`);
  if (!force && route === currentRoute) return;
  currentRoute = route;
  content.setAttribute("aria-busy", "true");
  content.innerHTML = '<div class="loading-card"><span class="spinner"></span><p>Abriendo el grimorio…</p></div>';
  setActiveLinks(route);
  document.getElementById("main-nav").classList.remove("open");
  document.getElementById("menu-toggle").setAttribute("aria-expanded", "false");
  try {
    const response = await fetch(`./pages/${route}.html`);
    if (!response.ok) throw new Error(`No se encontró ${route}`);
    content.innerHTML = await response.text();
    content.querySelector("h1")?.focus({ preventScroll: true });
    if (route === "home") await initCommunityPage();
    if (route === "tareas") await initTasksPage();
    if (route === "casa") await initHousePage();
    if (route === "tienda") await initStorePage();
    if (route === "solicitudes") await initRequestsPage();
    if (route === "alumnos") await initStudentsPage();
    if (route === "reportes") await initReportsPage();
  } catch {
    content.innerHTML = '<div class="soon"><span>✦</span><h1>No se pudo abrir</h1><p>Revisa tu conexión y vuelve a intentarlo.</p></div>';
  } finally {
    content.setAttribute("aria-busy", "false");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

export function startRouter() {
  window.addEventListener("hashchange", () => renderRoute());
  document.getElementById("menu-toggle").addEventListener("click", event => {
    const nav = document.getElementById("main-nav");
    const open = nav.classList.toggle("open");
    event.currentTarget.setAttribute("aria-expanded", String(open));
  });
  if (!location.hash || !routes.has(routeFromHash())) history.replaceState(null, "", "#home");
  return renderRoute(true);
}
