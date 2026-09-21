import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

let profile = null;

export function setDisciplineProfile(value) {
  profile = value;
}

function stateRef(uid = auth.currentUser?.uid) {
  return doc(db, "estadoAcademico", uid);
}

function walletRef(uid) {
  return doc(db, "monederos", uid);
}

function dateValue(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (value.seconds) return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function baseState(uid = "") {
  return {
    id: uid,
    tarjetasAmarillas: 0,
    esEstrella: false,
    advertencias: [],
    actualizadaEn: null
  };
}

export function normalizeAcademicState(data = {}, uid = "") {
  return {
    id: uid,
    tarjetasAmarillas: Math.max(0, Math.min(5, Number(data.tarjetasAmarillas || 0))),
    esEstrella: data.esEstrella === true,
    advertencias: Array.isArray(data.advertencias) ? data.advertencias : [],
    actualizadaEn: data.actualizadaEn || null
  };
}

export function activeWarningDates(state, now = new Date()) {
  return (state?.advertencias || [])
    .map(dateValue)
    .filter(date => date && date.getTime() > now.getTime())
    .sort((a, b) => a - b);
}

export function academicBadges(state) {
  const warnings = activeWarningDates(state).length;
  return {
    star: state?.esEstrella === true,
    yellowCards: Number(state?.tarjetasAmarillas || 0),
    warnings,
    text: `${state?.esEstrella === true ? "⭐" : ""}${"🔖".repeat(warnings)}`
  };
}

export async function ensureAcademicState(value = profile) {
  if (!auth.currentUser || value?.rol !== "alumno") return baseState(auth.currentUser?.uid || "");
  const ref = stateRef();
  const snapshot = await getDoc(ref);
  if (snapshot.exists()) return normalizeAcademicState(snapshot.data(), snapshot.id);

  await setDoc(ref, {
    tarjetasAmarillas: 0,
    esEstrella: false,
    advertencias: [],
    actualizadaEn: serverTimestamp()
  });
  return baseState(auth.currentUser.uid);
}

export async function getAcademicState(uid) {
  if (!uid) return baseState();
  const snapshot = await getDoc(stateRef(uid));
  return snapshot.exists()
    ? normalizeAcademicState(snapshot.data(), snapshot.id)
    : baseState(uid);
}

export function watchOwnAcademicState(callback) {
  if (!auth.currentUser || profile?.rol !== "alumno") return () => {};
  return onSnapshot(stateRef(), snapshot => {
    callback(snapshot.exists()
      ? normalizeAcademicState(snapshot.data(), snapshot.id)
      : baseState(auth.currentUser.uid));
  });
}

function assignedHouses() {
  return Array.isArray(profile?.casasACargo)
    ? profile.casasACargo.map(value => String(value).replace(/^Casa\s+/i, ""))
    : [];
}

function studentHouse(student) {
  return String(student?.casa || "").replace(/^Casa\s+/i, "");
}

function assertTeacherFor(student) {
  if (profile?.rol !== "profesor" || !assignedHouses().includes(studentHouse(student))) {
    throw new Error("No tienes permiso para modificar a este alumno.");
  }
}

export async function awardYellowCard(student) {
  assertTeacherFor(student);
  const studentId = student.id || student.uid;
  if (!studentId) throw new Error("No se encontró al alumno.");
  const actionRef = doc(collection(db, "accionesDisciplina"));
  let result = null;

  await runTransaction(db, async transaction => {
    const ref = stateRef(studentId);
    const snapshot = await transaction.get(ref);
    const reportSnapshot = reportRef ? await transaction.get(reportRef) : null;
    const current = snapshot.exists()
      ? normalizeAcademicState(snapshot.data(), studentId)
      : baseState(studentId);

    if (current.esEstrella) throw new Error("Este alumno ya es alumno estrella.");
    const cards = Math.min(5, current.tarjetasAmarillas + 1);
    const becameStar = cards === 5;
    const next = {
      tarjetasAmarillas: cards,
      esEstrella: becameStar,
      advertencias: current.advertencias,
      actualizadaEn: serverTimestamp()
    };

    if (snapshot.exists()) transaction.update(ref, next);
    else transaction.set(ref, next);

    transaction.set(actionRef, {
      alumnoId: studentId,
      alumnoNombre: String(student.nombre || student.usuario || "Alumno"),
      alumnoCasa: studentHouse(student),
      profesorId: auth.currentUser.uid,
      profesorNombre: String(profile.nombre || profile.usuario || "Profesor"),
      tipo: "tarjeta_amarilla",
      resultado: becameStar ? "alumno_estrella" : "tarjeta_otorgada",
      dias: 0,
      venceEn: null,
      creadaEn: serverTimestamp()
    });
    result = { cards, becameStar };
  });

  return result;
}

export async function applyWarning(student, days, reportId = "") {
  assertTeacherFor(student);
  const duration = Number(days);
  if (!Number.isInteger(duration) || duration < 1 || duration > 365) {
    throw new Error("Elige una duración entre 1 y 365 días.");
  }

  const studentId = student.id || student.uid;
  if (!studentId) throw new Error("No se encontró al alumno.");
  const actionRef = doc(collection(db, "accionesDisciplina"));
  const reportRef = reportId ? doc(db, "reportesPosts", reportId) : null;
  let result = null;

  await runTransaction(db, async transaction => {
    const ref = stateRef(studentId);
    const snapshot = await transaction.get(ref);
    const current = snapshot.exists()
      ? normalizeAcademicState(snapshot.data(), studentId)
      : baseState(studentId);
    const now = new Date();
    const active = activeWarningDates(current, now).map(date => Timestamp.fromDate(date));
    let cards = current.tarjetasAmarillas;
    let star = current.esEstrella;
    let warnings = active;
    let outcome = "advertencia_roja";
    let expiry = null;

    if (star) {
      star = false;
      cards = 0;
      outcome = "estrella_retirada";
    } else if (cards > 0) {
      cards -= 1;
      outcome = "tarjeta_consumida";
    } else {
      if (active.length >= 3) throw new Error("El alumno ya tiene tres advertencias activas.");
      expiry = Timestamp.fromMillis(Date.now() + duration * 86400000);
      warnings = [...active, expiry];
    }

    const targetWallet = outcome === "advertencia_roja" ? walletRef(studentId) : null;
    const walletSnapshot = targetWallet ? await transaction.get(targetWallet) : null;
    if (targetWallet && (!walletSnapshot.exists() || !Number.isInteger(walletSnapshot.data().deuda))) {
      throw new Error("El alumno debe abrir la versión nueva de la app antes de recibir una advertencia.");
    }
    if (reportRef && (!reportSnapshot.exists() || reportSnapshot.data().estado !== "pendiente")) {
      throw new Error("Este reporte ya fue atendido.");
    }

    const next = {
      tarjetasAmarillas: cards,
      esEstrella: star,
      advertencias: warnings,
      actualizadaEn: serverTimestamp()
    };
    if (snapshot.exists()) transaction.update(ref, next);
    else transaction.set(ref, next);

    if (outcome === "advertencia_roja") {
      transaction.update(targetWallet, {
        deuda: Number(walletSnapshot.data().deuda || 0) + 100,
        ultimaOperacion: actionRef.id,
        tipoOperacion: "advertencia",
        actualizadaEn: serverTimestamp()
      });
    }

    transaction.set(actionRef, {
      alumnoId: studentId,
      alumnoNombre: String(student.nombre || student.usuario || "Alumno"),
      alumnoCasa: studentHouse(student),
      profesorId: auth.currentUser.uid,
      profesorNombre: String(profile.nombre || profile.usuario || "Profesor"),
      tipo: "advertencia",
      resultado: outcome,
      dias: duration,
      venceEn: expiry,
      creadaEn: serverTimestamp()
    });

    if (reportRef) {
      transaction.update(reportRef, {
        estado: "advertencia",
        profesorId: auth.currentUser.uid,
        profesorNombre: String(profile.nombre || profile.usuario || "Profesor"),
        resueltaEn: serverTimestamp(),
        resultado: outcome
      });
    }

    result = {
      outcome,
      cards,
      star,
      warnings: warnings.length,
      debtAdded: outcome === "advertencia_roja" ? 100 : 0
    };
  });

  return result;
}

export function warningResultMessage(result) {
  if (result?.outcome === "estrella_retirada") {
    return "La estrella y todas sus tarjetas amarillas fueron retiradas. La advertencia quedó absorbida.";
  }
  if (result?.outcome === "tarjeta_consumida") {
    return "Una tarjeta amarilla protegió al alumno y fue consumida.";
  }
  return "Se añadió una advertencia activa y una deuda de 100 monedas.";
}
