import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

const COIN_IMAGE = "./assets/images/coin.png";

const PRODUCTS = {
  cambio_imagen: {
    name: "Cambio de foto o banner",
    shortName: "Cambio de foto/banner",
    cost: 50,
    cooldownDays: 3,
    field: "ultimoCambioPerfil",
    icon: "🖼️",
    description: "Cambia la foto o el banner de tu perfil. Disponible una vez cada 3 días.",
    needsDetail: true,
    detailOptions: ["Foto de perfil", "Banner"],
    whatsapp: "523221093485"
  },

  cambio_personaje: {
    name: "Máscara de una nueva identidad",
    shortName: "Cambio de personaje",
    cost: 120,
    cooldownDays: 30,
    field: "ultimoCambioPersonaje",
    icon: "🎭",
    description: "Solicita cambiar tu personaje dentro del team. Disponible una vez cada 30 días.",
    needsDetail: true
  },

  repetir_test: {
    name: "Segunda lectura del destino",
    shortName: "Volver a hacer el test",
    cost: 450,
    cooldownDays: 60,
    field: "ultimoTestCasa",
    icon: "🔮",
    description: "Solicita permiso para repetir el test de las casas. Disponible una vez cada dos meses.",
    needsDetail: false
  }
};

let profile = null;

export function setEconomyProfile(value) {
  profile = value;
}

function isAdmin() {
  return profile?.esAdmin === true || profile?.rol === "admin";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function walletRef(uid = auth.currentUser?.uid) {
  return doc(db, "monederos", uid);
}

function dateValue(value) {
  if (!value) return null;

  if (typeof value.toDate === "function") {
    return value.toDate();
  }

  if (value.seconds) {
    return new Date(value.seconds * 1000);
  }

  return new Date(value);
}

function formatDate(value) {
  const date = dateValue(value);

  if (!date || Number.isNaN(date.getTime())) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function coinMarkup(amount, className = "coin-amount") {
  return `
    <span class="${className}">
      <img src="${COIN_IMAGE}" alt="Monedas">
      <b>${Number(amount || 0).toLocaleString("es-MX")}</b>
    </span>
  `;
}

async function ensureWallet() {
  if (!auth.currentUser) return null;

  const ref = walletRef();
  const snapshot = await getDoc(ref);
  const epoch = Timestamp.fromMillis(0);

  if (snapshot.exists()) {
    const wallet = snapshot.data();

    if (!wallet.ultimoCambioPerfil) {
      await updateDoc(ref, {
        ultimoCambioPerfil: epoch,
        actualizadaEn: serverTimestamp()
      });

      return {
        id: snapshot.id,
        ...wallet,
        ultimoCambioPerfil: epoch
      };
    }

    return {
      id: snapshot.id,
      ...wallet
    };
  }

  await setDoc(ref, {
    saldo: 0,
    ultimaOperacion: "inicio",
    tipoOperacion: "inicio",
    ultimoCambioPersonaje: epoch,
    ultimoTestCasa: epoch,
    ultimoCambioPerfil: epoch,
    creadaEn: serverTimestamp(),
    actualizadaEn: serverTimestamp()
  });

  const created = await getDoc(ref);

  return {
    id: created.id,
    ...created.data()
  };
}

async function refreshAdminCount() {
  const badge = document.getElementById("admin-request-count");

  if (!badge || !isAdmin()) return;

  try {
    const snapshot = await getDocs(
      query(
        collection(db, "solicitudesTienda"),
        where("estado", "==", "pendiente")
      )
    );

    badge.textContent = snapshot.size
      ? String(snapshot.size)
      : "◆";

    badge.setAttribute(
      "aria-label",
      `${snapshot.size} solicitudes pendientes`
    );
  } catch {
    badge.textContent = "◆";
  }
}

export async function initEconomySession() {
  if (!auth.currentUser || !profile) return;

  await ensureWallet();

  if (isAdmin()) {
    await refreshAdminCount();
  }
}

function cooldownState(wallet, product) {
  const last = dateValue(wallet[product.field]);

  const availableAt = new Date(
    (last?.getTime() || 0) +
    product.cooldownDays * 86400000
  );

  return {
    available: availableAt <= new Date(),
    availableAt
  };
}

function openDialog(dialog) {
  if (typeof dialog.showModal === "function") {
    dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
}

function closeDialog(dialog) {
  if (!dialog) return;

  if (typeof dialog.close === "function") {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
}

function bindDialogClosers(root) {
  root.querySelectorAll("[data-close-dialog]").forEach(button => {
    button.addEventListener("click", () => {
      closeDialog(button.closest("dialog"));
    });
  });
}

async function transferCoins(form, wallet, rerender) {
  const status = form.querySelector(".modal-status");
  const button = form.querySelector("button[type=submit]");
  const formData = new FormData(form);

  const username = String(
    formData.get("usuario") || ""
  ).trim().toLowerCase();

  const amount = Number(formData.get("cantidad"));

  if (!username || !Number.isInteger(amount) || amount < 1) {
    status.textContent =
      "Escribe un usuario y una cantidad válida.";
    return;
  }

  if (username === String(profile.usuario || "").toLowerCase()) {
    status.textContent =
      "No puedes transferirte monedas a ti mismo.";
    return;
  }

  if (amount > Number(wallet.saldo || 0)) {
    status.textContent = "No tienes suficientes monedas.";
    return;
  }

  button.disabled = true;
  status.textContent = "Buscando al integrante…";

  try {
    const publicSnapshot = await getDocs(
      query(
        collection(db, "perfilesPublicos"),
        where("usuario", "==", username)
      )
    );

    if (publicSnapshot.size !== 1) {
      throw new Error(
        "No encontramos un usuario único con ese nombre."
      );
    }

    const receiverProfile = publicSnapshot.docs[0];

    if (receiverProfile.id === auth.currentUser.uid) {
      throw new Error(
        "No puedes transferirte monedas a ti mismo."
      );
    }

    const transferRef = doc(
      collection(db, "transferenciasMonedas")
    );

    await runTransaction(db, async transaction => {
      const senderRef = walletRef();
      const receiverRef = walletRef(receiverProfile.id);

      const senderSnapshot =
        await transaction.get(senderRef);

      const receiverSnapshot =
        await transaction.get(receiverRef);

      if (!senderSnapshot.exists()) {
        throw new Error(
          "Tu monedero todavía no está disponible."
        );
      }

      if (!receiverSnapshot.exists()) {
        throw new Error(
          "Esa persona debe abrir la app al menos una vez antes de recibir monedas."
        );
      }

      const senderBalance = Number(
        senderSnapshot.data().saldo || 0
      );

      const receiverBalance = Number(
        receiverSnapshot.data().saldo || 0
      );

      if (senderBalance < amount) {
        throw new Error(
          "Ya no tienes suficientes monedas."
        );
      }

      transaction.set(transferRef, {
        emisorId: auth.currentUser.uid,
        emisorUsuario: String(profile.usuario || ""),
        receptorId: receiverProfile.id,
        receptorUsuario: String(
          receiverProfile.data().usuario || username
        ),
        cantidad: amount,
        fecha: serverTimestamp()
      });

      transaction.update(senderRef, {
        saldo: senderBalance - amount,
        ultimaOperacion: transferRef.id,
        tipoOperacion: "transferencia_salida",
        actualizadaEn: serverTimestamp()
      });

      transaction.update(receiverRef, {
        saldo: receiverBalance + amount,
        ultimaOperacion: transferRef.id,
        tipoOperacion: "transferencia_entrada",
        actualizadaEn: serverTimestamp()
      });
    });

    closeDialog(form.closest("dialog"));
    form.reset();

    await rerender(
      `Transferiste ${amount} monedas a @${username}.`
    );
  } catch (error) {
    console.error(error);

    status.textContent =
      error.message ||
      "No se pudo realizar la transferencia.";
  } finally {
    button.disabled = false;
  }
}

async function purchaseProduct(
  productId,
  detail,
  rerender
) {
  const product = PRODUCTS[productId];

  if (!product) {
    throw new Error("Producto no válido.");
  }

  const safeDetail = String(detail || "").trim();
  const requestRef = doc(collection(db, "solicitudesTienda"));

  await runTransaction(db, async transaction => {
    const ref = walletRef();
    const snapshot = await transaction.get(ref);

    if (!snapshot.exists()) {
      throw new Error(
        "Tu monedero todavía no está disponible."
      );
    }

    const wallet = snapshot.data();
    const balance = Number(wallet.saldo || 0);
    const cooldown = cooldownState(wallet, product);

    if (balance < product.cost) {
      throw new Error("No tienes suficientes monedas.");
    }

    if (!cooldown.available) {
      throw new Error(
        `Disponible nuevamente el ${cooldown.availableAt.toLocaleDateString("es-MX")
        }.`
      );
    }

    if (product.needsDetail && !safeDetail) {
      throw new Error(
        "Selecciona o escribe el detalle de tu solicitud."
      );
    }

    if (safeDetail.length > 120) {
      throw new Error(
        "El detalle es demasiado largo."
      );
    }

    const cooldownPrevious =
      wallet[product.field] ||
      Timestamp.fromMillis(0);

    transaction.set(requestRef, {
      compradorId: auth.currentUser.uid,
      compradorNombre: String(
        profile.nombre ||
        profile.usuario ||
        "Integrante"
      ),
      compradorUsuario: String(profile.usuario || ""),
      productoId: productId,
      productoNombre: product.shortName,
      costo: product.cost,
      detalle: safeDetail,
      estado: "pendiente",
      fechaSolicitud: serverTimestamp(),
      cooldownAnterior: cooldownPrevious,
      administradorId: null,
      administradorNombre: "",
      fechaAtencion: null,
      reembolsada: false
    });

    transaction.update(ref, {
      saldo: balance - product.cost,
      [product.field]: serverTimestamp(),
      ultimaOperacion: requestRef.id,
      tipoOperacion: "compra",
      actualizadaEn: serverTimestamp()
    });
  });

  await rerender(
    `Solicitud de “${product.shortName}” enviada a Dirección.`
  );

  if (product.whatsapp) {
    const message = encodeURIComponent(
      `Hola, soy @${profile.usuario}. Compré el cambio de foto/banner y elegí: ${safeDetail}. Aquí enviaré la imagen.`
    );

    window.location.href =
      `https://wa.me/${product.whatsapp}?text=${message}`;
  }
}

async function loadMyRequests() {
  const snapshot = await getDocs(
    query(
      collection(db, "solicitudesTienda"),
      where(
        "compradorId",
        "==",
        auth.currentUser.uid
      )
    )
  );

  return snapshot.docs
    .map(item => ({
      id: item.id,
      ...item.data()
    }))
    .sort((a, b) => {
      return (
        (dateValue(b.fechaSolicitud)?.getTime() || 0) -
        (dateValue(a.fechaSolicitud)?.getTime() || 0)
      );
    });
}

function requestStatusLabel(status) {
  if (status === "aceptada") {
    return "Aceptada";
  }

  if (status === "rechazada") {
    return "Rechazada y reembolsada";
  }

  return "Pendiente";
}

function myRequestMarkup(request) {
  return `
    <article class="mini-request">
      <div>
        <strong>
          ${escapeHtml(request.productoNombre)}
        </strong>

        <small>
          ${escapeHtml(formatDate(request.fechaSolicitud))}
        </small>
      </div>

      <span class="request-status ${request.estado}">
        ${escapeHtml(requestStatusLabel(request.estado))}
      </span>
    </article>
  `;
}

export async function initStorePage(message = "") {
  const root = document.getElementById("store-app");

  if (!root || !auth.currentUser || !profile) {
    return;
  }

  try {
    const [wallet, requests] = await Promise.all([
      ensureWallet(),
      loadMyRequests()
    ]);

    root.innerHTML = `
      ${message
        ? `<p class="economy-notice" role="status">${escapeHtml(message)}</p>`
        : ""
      }

      <div class="store-toolbar">
        <button
          class="store-action"
          id="open-transfer"
          type="button"
        >
          ⇄ Transferir
        </button>

        <button
          class="balance-card"
          id="open-coin-info"
          type="button"
          aria-label="Cómo conseguir monedas"
        >
          ${coinMarkup(wallet.saldo, "balance-amount")}

          <span
            class="balance-plus"
            aria-hidden="true"
          >
            +
          </span>
        </button>
      </div>

      <div
        class="product-grid"
        id="product-grid"
      ></div>

      <section class="my-requests">
        <div class="section-heading">
          <div>
            <p class="kicker">Historial</p>
            <h2>Mis solicitudes</h2>
          </div>
        </div>

        <div class="mini-request-list">
          ${requests.length
        ? requests.map(myRequestMarkup).join("")
        : '<p class="empty-economy">Todavía no has comprado nada.</p>'
      }
        </div>
      </section>

      <dialog
        class="economy-dialog"
        id="coin-info-dialog"
      >
        <button
          class="dialog-close"
          data-close-dialog
          type="button"
          aria-label="Cerrar"
        >
          ×
        </button>

        <img
          class="dialog-coin"
          src="${COIN_IMAGE}"
          alt="Moneda de Academia Bans"
        >

        <h2>¿Cómo consigo monedas?</h2>

        <p>
          Entrega tareas y espera a que tu profesor las
          califique. Las mejores calificaciones reciben
          más monedas y entregar a tiempo da una
          bonificación.
        </p>

        <ul>
          <li>100: 25 monedas</li>
          <li>90–99: 20 monedas</li>
          <li>80–89: 15 monedas</li>
          <li>70–79: 10 monedas</li>
          <li>1–69: 5 monedas</li>
          <li>Entrega a tiempo: +5 monedas</li>
        </ul>
      </dialog>

      <dialog
        class="economy-dialog"
        id="transfer-dialog"
      >
        <button
          class="dialog-close"
          data-close-dialog
          type="button"
          aria-label="Cerrar"
        >
          ×
        </button>

        <p class="kicker">Compartir monedas</p>
        <h2>Transferir</h2>

        <form
          id="transfer-form"
          class="economy-form"
        >
          <label>
            Usuario del destinatario

            <input
              name="usuario"
              maxlength="64"
              required
              placeholder="Ej. boosaurus"
              pattern="[a-zA-Z0-9._-]+"
            >
          </label>

          <label>
            Cantidad

            <input
              name="cantidad"
              type="number"
              min="1"
              step="1"
              max="${wallet.saldo}"
              required
            >
          </label>

          <p
            class="modal-status"
            role="status"
          ></p>

          <button
            class="store-primary"
            type="submit"
          >
            Transferir monedas
          </button>
        </form>
      </dialog>

      <dialog
        class="economy-dialog"
        id="purchase-dialog"
      >
        <button
          class="dialog-close"
          data-close-dialog
          type="button"
          aria-label="Cerrar"
        >
          ×
        </button>

        <div id="purchase-dialog-content"></div>
      </dialog>
    `;

    const productGrid =
      root.querySelector("#product-grid");

    Object.entries(PRODUCTS).forEach(
      ([id, product]) => {
        const cooldown =
          cooldownState(wallet, product);

        const enough =
          Number(wallet.saldo || 0) >= product.cost;

        const card =
          document.createElement("article");

        card.className = "product-card";

        card.innerHTML = `
          <span class="product-icon">
            ${product.icon}
          </span>

          <p class="kicker">Beneficio</p>

          <h2>${product.name}</h2>

          <p>${product.description}</p>

          <div class="product-footer">
            ${coinMarkup(product.cost)}

            <button
              class="store-primary"
              type="button"
              ${!enough || !cooldown.available
            ? "disabled"
            : ""
          }
            >
              ${!cooldown.available
            ? `Disponible ${cooldown.availableAt.toLocaleDateString("es-MX")}`
            : enough
              ? "Comprar"
              : "Saldo insuficiente"
          }
            </button>
          </div>
        `;

        card
          .querySelector("button")
          .addEventListener("click", () => {
            const dialog =
              root.querySelector("#purchase-dialog");

            const content =
              root.querySelector(
                "#purchase-dialog-content"
              );

            let detailField = "";

            if (product.detailOptions) {
              const options = product.detailOptions
                .map(option => {
                  return `
                    <option value="${escapeHtml(option)}">
                      ${escapeHtml(option)}
                    </option>
                  `;
                })
                .join("");

              detailField = `
                <label>
                  ¿Qué deseas cambiar?

                  <select
                    name="detalle"
                    required
                  >
                    ${options}
                  </select>
                </label>
              `;
            } else if (product.needsDetail) {
              detailField = `
                <label>
                  Personaje solicitado

                  <input
                    name="detalle"
                    maxlength="120"
                    required
                    placeholder="¿A qué personaje quieres cambiar?"
                  >
                </label>
              `;
            } else {
              detailField = `
                <input
                  type="hidden"
                  name="detalle"
                  value=""
                >
              `;
            }

            content.innerHTML = `
              <p class="kicker">
                Confirmar compra
              </p>

              <h2>${product.shortName}</h2>

              <p>
                Se descontarán ${product.cost} monedas
                y Dirección recibirá una solicitud.
              </p>

              <form
                class="economy-form"
                id="purchase-form"
              >
                ${detailField}

                <p
                  class="modal-status"
                  role="status"
                ></p>

                <button
                  class="store-primary"
                  type="submit"
                >
                  Confirmar compra
                </button>
              </form>
            `;

            content
              .querySelector("form")
              .addEventListener(
                "submit",
                async event => {
                  event.preventDefault();

                  const submit =
                    event.currentTarget.querySelector(
                      "button"
                    );

                  const status =
                    event.currentTarget.querySelector(
                      ".modal-status"
                    );

                  submit.disabled = true;
                  status.textContent =
                    "Creando solicitud…";

                  try {
                    await purchaseProduct(
                      id,
                      new FormData(
                        event.currentTarget
                      ).get("detalle"),
                      initStorePage
                    );

                    closeDialog(dialog);
                  } catch (error) {
                    console.error(error);

                    status.textContent =
                      error.message ||
                      "No se pudo completar la compra.";

                    submit.disabled = false;
                  }
                }
              );

            openDialog(dialog);
          });

        productGrid.append(card);
      }
    );

    bindDialogClosers(root);

    root
      .querySelector("#open-coin-info")
      .addEventListener("click", () => {
        openDialog(
          root.querySelector("#coin-info-dialog")
        );
      });

    root
      .querySelector("#open-transfer")
      .addEventListener("click", () => {
        openDialog(
          root.querySelector("#transfer-dialog")
        );
      });

    root
      .querySelector("#transfer-form")
      .addEventListener("submit", event => {
        event.preventDefault();

        transferCoins(
          event.currentTarget,
          wallet,
          initStorePage
        );
      });
  } catch (error) {
    console.error(error);

    root.innerHTML = `
      <p class="task-error">
        No se pudo abrir la tienda. Publica las reglas
        nuevas de Firestore e inténtalo otra vez.
      </p>
    `;
  }
}

function adminRequestMarkup(request) {
  const pending =
    request.estado === "pendiente";

  return `
    <article
      class="admin-request-card"
      data-id="${request.id}"
    >
      <div class="admin-request-head">
        <div>
          <p class="kicker">
            ${request.compradorUsuario
      ? `@${escapeHtml(request.compradorUsuario)}`
      : "Integrante"
    }
          </p>

          <h2>
            ${escapeHtml(
      request.compradorNombre || "Integrante"
    )}
          </h2>
        </div>

        <span class="request-status ${request.estado}">
          ${escapeHtml(
      requestStatusLabel(request.estado)
    )}
        </span>
      </div>

      <h3>
        ${escapeHtml(request.productoNombre)}
      </h3>

      ${request.detalle
      ? `
            <p>
              <strong>Solicitud:</strong>
              ${escapeHtml(request.detalle)}
            </p>
          `
      : ""
    }

      <p class="request-meta">
        ${coinMarkup(request.costo)}
        ·
        ${escapeHtml(formatDate(request.fechaSolicitud))}
      </p>

      ${pending
      ? `
            <div class="request-actions">
              <button
                class="store-primary accept-request"
                type="button"
              >
                Aceptar
              </button>

              <button
                class="store-secondary reject-request"
                type="button"
              >
                Rechazar y reembolsar
              </button>
            </div>
          `
      : `
            <p class="request-resolution">
              Atendida por
              ${escapeHtml(
        request.administradorNombre ||
        "Dirección"
      )}
              ·
              ${escapeHtml(
        formatDate(request.fechaAtencion)
      )}
            </p>
          `
    }
    </article>
  `;
}

async function acceptRequest(request) {
  await updateDoc(
    doc(db, "solicitudesTienda", request.id),
    {
      estado: "aceptada",
      administradorId: auth.currentUser.uid,
      administradorNombre: String(
        profile.nombre ||
        profile.usuario ||
        "Dirección"
      ),
      fechaAtencion: serverTimestamp(),
      reembolsada: false
    }
  );
}

async function rejectRequest(request) {
  const requestRef = doc(
    db,
    "solicitudesTienda",
    request.id
  );

  await runTransaction(db, async transaction => {
    const currentRequest =
      await transaction.get(requestRef);

    if (
      !currentRequest.exists() ||
      currentRequest.data().estado !== "pendiente"
    ) {
      throw new Error(
        "Esta solicitud ya fue atendida."
      );
    }

    const data = currentRequest.data();

    const targetWalletRef =
      walletRef(data.compradorId);

    const targetWallet =
      await transaction.get(targetWalletRef);

    if (!targetWallet.exists()) {
      throw new Error(
        "No se encontró el monedero del integrante."
      );
    }

    const wallet = targetWallet.data();

    const cooldownFields = {
      cambio_personaje: "ultimoCambioPersonaje",
      repetir_test: "ultimoTestCasa",
      cambio_imagen: "ultimoCambioPerfil"
    };

    const cooldownField =
      cooldownFields[data.productoId];

    if (!cooldownField) {
      throw new Error(
        "El producto no tiene un tiempo de espera válido."
      );
    }

    transaction.update(requestRef, {
      estado: "rechazada",
      administradorId: auth.currentUser.uid,
      administradorNombre: String(
        profile.nombre ||
        profile.usuario ||
        "Dirección"
      ),
      fechaAtencion: serverTimestamp(),
      reembolsada: true
    });

    transaction.update(targetWalletRef, {
      saldo:
        Number(wallet.saldo || 0) +
        Number(data.costo || 0),

      [cooldownField]:
        data.cooldownAnterior ||
        Timestamp.fromMillis(0),

      ultimaOperacion: request.id,
      tipoOperacion: "reembolso",
      actualizadaEn: serverTimestamp()
    });
  });
}

export async function initRequestsPage(
  message = ""
) {
  const root =
    document.getElementById("requests-app");

  if (!root || !auth.currentUser || !profile) {
    return;
  }

  if (!isAdmin()) {
    root.innerHTML = `
      <p class="task-error">
        Esta sección es exclusiva de Dirección.
      </p>
    `;

    return;
  }

  try {
    const snapshot = await getDocs(
      collection(db, "solicitudesTienda")
    );

    const requests = snapshot.docs
      .map(item => ({
        id: item.id,
        ...item.data()
      }))
      .sort((a, b) => {
        if (
          a.estado === "pendiente" &&
          b.estado !== "pendiente"
        ) {
          return -1;
        }

        if (
          a.estado !== "pendiente" &&
          b.estado === "pendiente"
        ) {
          return 1;
        }

        return (
          (dateValue(b.fechaSolicitud)?.getTime() || 0) -
          (dateValue(a.fechaSolicitud)?.getTime() || 0)
        );
      });

    const pendingCount = requests.filter(
      item => item.estado === "pendiente"
    ).length;

    root.innerHTML = `
      ${message
        ? `<p class="economy-notice" role="status">${escapeHtml(message)}</p>`
        : ""
      }

      <div class="requests-summary">
        <strong>${pendingCount}</strong>
        <span>pendientes</span>
      </div>

      <div class="admin-request-list">
        ${requests.length
        ? requests
          .map(adminRequestMarkup)
          .join("")
        : '<p class="empty-economy">Todavía no hay solicitudes.</p>'
      }
      </div>
    `;

    requests
      .filter(item => item.estado === "pendiente")
      .forEach(request => {
        const card = root.querySelector(
          `[data-id="${request.id}"]`
        );

        card
          .querySelector(".accept-request")
          .addEventListener(
            "click",
            async event => {
              const accepted = confirm(
                `¿Aceptar “${request.productoNombre}” de ${request.compradorNombre}?`
              );

              if (!accepted) return;

              event.currentTarget.disabled = true;

              try {
                await acceptRequest(request);
                await refreshAdminCount();

                await initRequestsPage(
                  "Solicitud aceptada."
                );
              } catch (error) {
                console.error(error);

                await initRequestsPage(
                  "No se pudo aceptar la solicitud."
                );
              }
            }
          );

        card
          .querySelector(".reject-request")
          .addEventListener(
            "click",
            async event => {
              const rejected = confirm(
                `¿Rechazar la solicitud y devolver ${request.costo} monedas?`
              );

              if (!rejected) return;

              event.currentTarget.disabled = true;

              try {
                await rejectRequest(request);
                await refreshAdminCount();

                await initRequestsPage(
                  "Solicitud rechazada y monedas devueltas."
                );
              } catch (error) {
                console.error(error);

                await initRequestsPage(
                  error.message ||
                  "No se pudo rechazar la solicitud."
                );
              }
            }
          );
      });
  } catch (error) {
    console.error(error);

    root.innerHTML = `
      <p class="task-error">
        No se pudieron cargar las solicitudes.
        Revisa las reglas de Firestore.
      </p>
    `;
  }
}