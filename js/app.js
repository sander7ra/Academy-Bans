import {
  setPersistence,
  browserLocalPersistence,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import { auth, db } from "./firebase-config.js";
import { renderRoute, startRouter } from "./router.js";
import { setTaskProfile } from "./tasks.js";
import { setHouseProfile } from "./house.js";

import {
  initEconomySession,
  setEconomyProfile
} from "./economy.js";

const $ = id => document.getElementById(id);

const roleNames = {
  admin: "Administrador",
  profesor: "Profesor",
  alumno: "Alumno"
};

const houseSymbols = {
  Concordia: "♥",
  Divitiae: "♦",
  Fatum: "♣",
  Virtus: "♠"
};

let sessionCheck = 0;
let routerStarted = false;

function memberSlug(value) {
  return String(value || "integrante")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-");
}

function showLogin(message = "") {
  $("portal").hidden = true;
  $("login-screen").hidden = false;
  $("login-message").textContent = message;
}

function setMemberPhoto(username, name) {
  const photo = $("member-photo");

  const personalPhoto =
    `./assets/images/members/${memberSlug(username)}-icon.png`;

  const defaultPhoto =
    "./assets/images/members/default-member.svg";

  photo.alt = `Foto de ${name}`;

  photo.onerror = () => {
    photo.onerror = null;
    photo.src = defaultPhoto;
  };

  photo.src = personalPhoto;
}

function setMemberBanner(username, name) {
  const banner = $("academy-banner");

  const personalBanner =
    `./assets/images/members/${memberSlug(username)}-banner.png`;

  const defaultBanner =
    "./assets/images/banner.png";

  const placeholderBanner =
    "./assets/images/banner-placeholder.svg";

  let fallbackStep = 0;

  banner.alt = `Banner de ${name}`;

  banner.onerror = () => {
    if (fallbackStep === 0) {
      fallbackStep = 1;
      banner.src = defaultBanner;
      return;
    }

    banner.onerror = null;
    banner.src = placeholderBanner;
  };

  banner.src = personalBanner;
}

async function showPortal(profile) {
  const name = String(
    profile.nombre ||
    profile.usuario ||
    "Integrante"
  );

  const username = String(
    profile.usuario ||
    "integrante"
  );

  $("member-name").textContent = name;

  $("member-grade").textContent =
    profile.grado || "Sin grado";

  $("member-role").textContent =
    roleNames[profile.rol] || "Integrante";

  setTaskProfile(profile);
  setHouseProfile(profile);
  setEconomyProfile(profile);

  const admin =
    profile.esAdmin === true ||
    profile.rol === "admin";

  $("admin-requests-link").hidden = !admin;

  const house = String(profile.casa || "")
    .trim()
    .replace(/^Casa\s+/i, "");

  $("house-nav-symbol").textContent =
    houseSymbols[house] || "♠";

  setMemberPhoto(username, name);
  setMemberBanner(username, name);

  $("password").value = "";
  $("login-message").textContent = "";

  $("login-screen").hidden = true;
  $("portal").hidden = false;

  try {
    await initEconomySession();
  } catch (error) {
    console.error(
      "No se pudo iniciar la economía:",
      error
    );
  }

  if (!routerStarted) {
    routerStarted = true;
    await startRouter();
  } else {
    await renderRoute(true);
  }
}

$("show-password").addEventListener("click", () => {
  const password = $("password");
  const visible = password.type === "password";

  password.type = visible
    ? "text"
    : "password";

  $("show-password").textContent = visible
    ? "Ocultar"
    : "Ver";

  $("show-password").setAttribute(
    "aria-label",
    visible
      ? "Ocultar contraseña"
      : "Mostrar contraseña"
  );
});

$("login-form").addEventListener(
  "submit",
  async event => {
    event.preventDefault();

    const button = $("login-button");

    button.disabled = true;
    button.innerHTML = "Entrando…";

    $("login-message").textContent = "";

    try {
      await setPersistence(
        auth,
        browserLocalPersistence
      );

      const username = $("username")
        .value
        .trim()
        .toLowerCase();

      const password = $("password").value;

      await signInWithEmailAndPassword(
        auth,
        `${username}@team.invalid`,
        password
      );
    } catch (error) {
      if (error.code === "auth/too-many-requests") {
        $("login-message").textContent =
          "Demasiados intentos. Espera un momento.";
      } else if (
        error.code === "auth/network-request-failed"
      ) {
        $("login-message").textContent =
          "No se pudo conectar. Revisa tu conexión.";
      } else {
        $("login-message").textContent =
          "Usuario o contraseña incorrectos.";
      }
    } finally {
      button.disabled = false;
      button.innerHTML =
        "Entrar <span>✦</span>";
    }
  }
);

$("logout-button").addEventListener(
  "click",
  async () => {
    try {
      await signOut(auth);
    } catch {
      $("logout-button").textContent =
        "No se pudo cerrar. Reintentar";
    }
  }
);

onAuthStateChanged(auth, async account => {
  const check = ++sessionCheck;

  if (!account) {
    showLogin();
    return;
  }

  $("login-message").textContent =
    "Cargando tu perfil…";

  try {
    const snapshot = await getDoc(
      doc(db, "usuarios", account.uid)
    );

    if (check !== sessionCheck) {
      return;
    }

    if (!snapshot.exists()) {
      await signOut(auth);

      showLogin(
        "Tu cuenta todavía no tiene perfil. Contacta a la dirección."
      );

      return;
    }

    await showPortal(snapshot.data());
  } catch (error) {
    console.error(
      "No se pudo cargar el perfil:",
      error
    );

    if (check !== sessionCheck) {
      return;
    }

    await signOut(auth);

    showLogin(
      "No pudimos cargar tu perfil. Intenta nuevamente."
    );
  }
});