import { initTasksPage } from "./tasks.js";
import { initHousePage } from "./house.js";
import { initStorePage, initRequestsPage } from "./economy.js";

const routes = new Set(["home", "reglas", "lore", "ajustes", "casa", "calendario", "tareas", "tienda", "solicitudes"]);
let currentRoute = "";

function routeFromHash() {
  const requested = location.hash.slice(1).toLowerCase();
  return routes.has(requested) ? requested : "home";
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
    if (route === "tareas") await initTasksPage();
    if (route === "casa") await initHousePage();
    if (route === "tienda") await initStorePage();
    if (route === "solicitudes") await initRequestsPage();
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
