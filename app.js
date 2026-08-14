// ==========================================
// 1. CONFIGURACIÓN FIREBASE
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyDsLhHdxNt06_QLAnpoC2ZoJQG0ZweXZ70",
  authDomain: "ingresoestudiante-fbde0.firebaseapp.com",
  projectId: "ingresoestudiante-fbde0",
  storageBucket: "ingresoestudiante-fbde0.firebasestorage.app",
  messagingSenderId: "309792158081",
  appId: "1:309792158081:web:aa1ee1a3ec28380eaeb880",
  measurementId: "G-G7WNR43P2P"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ==========================================
// 2. REFERENCIAS DOM
// ==========================================
const video = document.getElementById('webcam');
const btnScan = document.getElementById('btn-scan');
const statusBar = document.getElementById('status-bar');

const modal = document.getElementById('modal-registro');
const btnOpenModal = document.getElementById('btn-open-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const formRegistro = document.getElementById('form-registro');
const regStatus = document.getElementById('reg-status');

let cacheEstudiantes = [];

// ==========================================
// 3. INICIAR CÁMARA Y MODELOS EN MÓVIL
// ==========================================
async function init() {
  try {
    statusBar.innerText = "⏳ Descargando modelos de IA...";
    
    // Modelos de face-api.js desde repositorio público estable
    const MODEL_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';
    
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
    ]);

    statusBar.innerText = "📷 Solicitando permiso de cámara...";

    // Configuración para Móviles (Android / iPhone)
    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: "user" }, // Cámara frontal
        width: { ideal: 640 },
        height: { ideal: 480 }
      }
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    
    // Atributos obligatorios para móviles
    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");
    video.muted = true;
    
    await video.play();

    statusBar.innerText = "📥 Conectando con la base de datos...";
    await cargarEstudiantes();

    statusBar.innerText = "⚡ Sistema listo en móvil. Presiona 'Escanear Rostro'.";
    btnScan.disabled = false;

  } catch (err) {
    if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
      statusBar.innerText = "❌ Permiso denegado. Ve a los ajustes del navegador y autoriza la cámara.";
    } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
      statusBar.innerText = "❌ No se encontró cámara frontal disponible.";
    } else {
      statusBar.innerText = "❌ Error: " + err.message;
    }
    console.error(err);
  }
}

// ==========================================
// 4. DESCARGA DE ROSTROS REGISTRADOS
// ==========================================
async function cargarEstudiantes() {
  try {
    const snapshot = await db.collection('estudiantes').get();
    cacheEstudiantes = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.face_descriptor && Array.isArray(data.face_descriptor)) {
        cacheEstudiantes.push({
          id: doc.id,
          ...data,
          descriptor: new Float32Array(data.face_descriptor)
        });
      }
    });
    console.log(`Base de datos sincronizada: ${cacheEstudiantes.length} estudiantes.`);
  } catch (e) {
    console.error("Error al cargar estudiantes:", e);
    statusBar.innerText = "⚠️ Error al conectar con Firestore. Revisa las reglas de seguridad.";
  }
}

// ==========================================
// 5. ESCANEO Y ASISTENCIA (AJUSTADO PARA MÓVIL)
// ==========================================
btnScan.addEventListener('click', async () => {
  statusBar.innerText = "🔍 Analizando rostro...";

  // TinyFaceDetector optimizado para procesadores de celular
  const detection = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) {
    statusBar.innerText = "⚠️ No se detectó rostro. Sostén el móvil firme frente a tu cara.";
    return;
  }

  const detectedDescriptor = detection.descriptor;
  let match = null;
  let menorDistancia = 0.55; // Tolerancia euclidiana

  cacheEstudiantes.forEach(est => {
    const distancia = faceapi.euclideanDistance(est.descriptor, detectedDescriptor);
    if (distancia < menorDistancia) {
      menorDistancia = distancia;
      match = est;
    }
  });

  if (match) {
    statusBar.innerText = `✅ ¡Identificado! ${match.nombre_completo}`;
    mostrarFicha(match);
    await registrarAsistenciaFirestore(match);
  } else {
    statusBar.innerText = "❌ Rostro no identificado en la base de datos.";
    limpiarFicha();
  }
});

// ==========================================
// 6. ACTUALIZAR INTERFAZ
// ==========================================
function mostrarFicha(est) {
  const ahora = new Date();
  const horaStr = ahora.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  document.getElementById('lbl-nombre').innerText = est.nombre_completo || '---';
  document.getElementById('lbl-cedula').innerText = est.cedula || '---';
  document.getElementById('lbl-edad').innerText = (est.edad ? `${est.edad} años` : '---');
  document.getElementById('lbl-civil').innerText = est.estado_civil || '---';
  document.getElementById('lbl-padre').innerText = est.nombre_padre || '---';
  document.getElementById('lbl-madre').innerText = est.nombre_madre || '---';
  document.getElementById('lbl-clase').innerText = est.clase_actual || '---';
  document.getElementById('lbl-profesor').innerText = est.nombre_profesor || '---';
  document.getElementById('lbl-hora').innerText = horaStr;

  const badge = document.getElementById('badge-estado');
  badge.innerText = "Asistencia Registrada";
  badge.className = "badge success";

  const listaTareas = document.getElementById('lista-tareas');
  listaTareas.innerHTML = '';
  if (est.calificaciones_tareas && est.calificaciones_tareas.length > 0) {
    est.calificaciones_tareas.forEach(t => {
      listaTareas.innerHTML += `<li><span>${t.tarea}</span> <span class="score">${t.nota}/100</span></li>`;
    });
  } else {
    listaTareas.innerHTML = '<li style="justify-content:center;">Sin tareas registradas.</li>';
  }
}

function limpiarFicha() {
  document.querySelectorAll('.info-grid span').forEach(el => el.innerText = '---');
  document.getElementById('lista-tareas').innerHTML = '<li style="justify-content:center;">Sin datos disponibles.</li>';
  const badge = document.getElementById('badge-estado');
  badge.innerText = "No Reconocido";
  badge.className = "badge danger";
}

async function registrarAsistenciaFirestore(est) {
  try {
    await db.collection('asistencias').add({
      estudiante_id: est.id,
      nombre_completo: est.nombre_completo,
      cedula: est.cedula,
      clase: est.clase_actual,
      profesor: est.nombre_profesor,
      fecha_hora: new Date().toISOString(),
      estado: "Presente"
    });
  } catch (e) {
    console.error("Error al registrar asistencia:", e);
  }
}

// ==========================================
// 7. REGISTRO DE NUEVO ESTUDIANTE
// ==========================================
btnOpenModal.addEventListener('click', () => modal.style.display = 'flex');
btnCloseModal.addEventListener('click', () => modal.style.display = 'none');

formRegistro.addEventListener('submit', async (e) => {
  e.preventDefault();
  regStatus.innerText = "Capturando rostro...";

  const detection = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) {
    regStatus.innerText = "❌ No se detectó rostro. Sostén el móvil firme frente a tu cara.";
    return;
  }

  const faceDescriptorArray = Array.from(detection.descriptor);

  const nuevoEstudiante = {
    cedula: document.getElementById('reg-cedula').value,
    nombre_completo: document.getElementById('reg-nombre').value,
    edad: parseInt(document.getElementById('reg-edad').value, 10),
    estado_civil: document.getElementById('reg-civil').value,
    nombre_padre: document.getElementById('reg-padre').value,
    nombre_madre: document.getElementById('reg-madre').value,
    clase_actual: document.getElementById('reg-clase').value,
    nombre_profesor: document.getElementById('reg-profesor').value,
    calificaciones_tareas: [
      { tarea: "Tarea Diagnóstica", nota: 100 },
      { tarea: "Práctica Evaluada 1", nota: 92 }
    ],
    face_descriptor: faceDescriptorArray,
    fecha_creacion: new Date().toISOString()
  };

  try {
    regStatus.innerText = "Guardando en Firebase...";
    await db.collection('estudiantes').add(nuevoEstudiante);
    regStatus.innerText = "✅ Guardado correctamente.";
    
    await cargarEstudiantes();
    
    setTimeout(() => {
      formRegistro.reset();
      regStatus.innerText = "";
      modal.style.display = 'none';
    }, 1200);

  } catch (err) {
    regStatus.innerText = "❌ Error: " + err.message;
    console.error(err);
  }
});

// Arrancar al cargar la página
window.addEventListener('DOMContentLoaded', init);
