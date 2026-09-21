import { collection, doc, getDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { db } from "./firebase-config.js";
import { academicBadges, getAcademicState } from "./discipline.js";

let profile = null;

const houses = {
  Concordia: {
    symbol: "♥",
    meaning: "Unión y lealtad",
    motto: "Muchas almas, una sola fuerza.",
    description: "Casa Concordia reúne a quienes encuentran poder en los vínculos, la empatía y la cooperación. Sus integrantes protegen aquello que aman y saben que ninguna magia es más fuerte que la creada en conjunto."
  },
  Divitiae: {
    symbol: "♦",
    meaning: "Ambición y abundancia",
    motto: "El ingenio transforma el deseo en grandeza.",
    description: "Casa Divitiae pertenece a las mentes astutas, decididas y creativas. Sus integrantes buscan crecer, construir y convertir cada oportunidad en algo valioso para sí mismos y para la Academia."
  },
  Fatum: {
    symbol: "♣",
    meaning: "Destino y fortuna",
    motto: "El azar favorece a quien sabe leer sus señales.",
    description: "Casa Fatum acoge a quienes confían en su intuición y reconocen los caminos invisibles del destino. Son adaptables, curiosos y capaces de encontrar posibilidades donde otros solo ven casualidad."
  },
  Virtus: {
    symbol: "♠",
    meaning: "Valor y determinación",
    motto: "Avanzar, incluso cuando el miedo acompaña.",
    description: "Casa Virtus representa el coraje, la disciplina y la voluntad de actuar. Sus integrantes enfrentan los desafíos de frente y utilizan su fortaleza para defender sus ideales y a quienes los rodean."
  }
};

export function setHouseProfile(value) { profile = value; }

function memberSlug(value) {
  return String(value || "integrante").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-");
}

function memberCard(member) {
  const card = document.createElement("article");
  card.className = "house-person";

  const image = document.createElement("img");
  image.src = `./assets/images/members/${memberSlug(member.usuario)}-icon.png`;
  image.alt = `Foto de ${member.nombre || "integrante"}`;
  image.onerror = () => {
    image.onerror = null;
    image.src = "./assets/images/members/default-member.svg";
  };

  const name = document.createElement("h3");
  const badges = academicBadges(member.state);
  name.textContent = `${member.nombre || "Integrante"}${badges.star ? " ⭐" : ""}${badges.warnings ? ` ${"🔖".repeat(badges.warnings)}` : ""}`;

  card.append(image, name);
  return card;
}

function rankingRow(member, index) {
  const row = document.createElement("div");
  row.className = "ranking-row";
  const place = document.createElement("span");
  place.className = "ranking-place";
  place.textContent = `#${index + 1}`;
  const image = document.createElement("img");
  image.className = "avatar small";
  image.src = `./assets/images/members/${memberSlug(member.usuario)}-icon.png`;
  image.alt = "";
  image.onerror = () => { image.onerror = null; image.src = "./assets/images/members/default-member.svg"; };
  const name = document.createElement("strong");
  name.textContent = member.nombre || "Integrante";
  const coins = document.createElement("span");
  coins.className = "ranking-coins";
  const icon = document.createElement("img");
  icon.src = "./assets/images/coin.png";
  icon.alt = "Monedas";
  coins.append(icon, document.createTextNode(Number(member.saldo || 0).toLocaleString("es-MX")));
  row.append(place, image, name, coins);
  return row;
}

export async function initHousePage() {
  const root = document.getElementById("house-page");
  if (!root || !profile) return;
  const storedHouse = String(profile.casa || "").trim();
  const houseName = storedHouse.replace(/^Casa\s+/i, "");
  const house = houses[houseName];
  if (!house) {
    document.getElementById("house-page-intro").textContent = "La dirección todavía no te ha asignado una casa.";
    root.innerHTML = '<div class="empty-house"><span>♠</span><h2>Casa sin asignar</h2><p>Cuando la dirección añada el campo <b>casa</b> a tu perfil, aquí aparecerán tu información y tus compañeros.</p></div>';
    return;
  }

  document.getElementById("house-page-title").textContent = `Casa ${houseName}`;
  document.getElementById("house-page-symbol").textContent = house.symbol;
  document.getElementById("house-page-intro").textContent = house.meaning;
  root.dataset.house = houseName.toLowerCase();
  root.innerHTML = `
    <article class="house-lore-card">
      <span class="house-great-symbol" aria-hidden="true">${house.symbol}</span>
      <div><p class="kicker">Lema de la casa</p><h2>${house.motto}</h2><p>${house.description}</p></div>
    </article>
    <section class="ranking-panel"><p class="kicker">Popularidad</p><h2>Ranking de la casa</h2><div class="ranking-list" id="house-ranking-list"></div></section>
    <div class="house-members-heading"><div><p class="kicker">Compañeros</p><h2>Integrantes de la casa</h2></div><span id="house-members-count">Buscando…</span></div>
    <div class="house-members-grid" id="house-members-grid"></div>`;

  const grid = document.getElementById("house-members-grid");
  const count = document.getElementById("house-members-count");
  const ranking = document.getElementById("house-ranking-list");
  try {
    const snapshot = await getDocs(query(collection(db, "perfilesPublicos"), where("casa", "in", [houseName, `Casa ${houseName}`])));
    const baseMembers = snapshot.docs.map(item => ({ id: item.id, ...item.data() })).filter(item => item.rol !== "profesor");
    const members = await Promise.all(baseMembers.map(async member => {
      const [wallet, state] = await Promise.all([
        getDoc(doc(db, "monederos", member.id)),
        getAcademicState(member.id)
      ]);
      return { ...member, saldo: wallet.exists() ? Number(wallet.data().saldo || 0) : 0, state };
    }));
    members.sort((a, b) => String(a.nombre || a.usuario || "").localeCompare(String(b.nombre || b.usuario || ""), "es"));
    members.forEach(member => grid.append(memberCard(member)));
    [...members].sort((a, b) => b.saldo - a.saldo || String(a.nombre || "").localeCompare(String(b.nombre || ""), "es"))
      .forEach((member, index) => ranking.append(rankingRow(member, index)));
    count.textContent = `${members.length} integrante${members.length === 1 ? "" : "s"}`;
    if (!members.length) {
      grid.innerHTML = '<p class="house-members-empty">Todavía no hay integrantes visibles en esta casa.</p>';
      ranking.innerHTML = '<p class="community-empty">Todavía no hay alumnos en el ranking.</p>';
    }
  } catch (error) {
    console.error(error);
    count.textContent = "No disponible";
    grid.innerHTML = '<p class="task-error">No se pudieron cargar los integrantes. Revisa las reglas de Firestore.</p>';
  }
}
