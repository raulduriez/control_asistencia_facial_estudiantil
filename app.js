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

const DEFAULT_AVATAR = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='75' height='75' viewBox='0 0 24 24' fill='%2338bdf8'><path d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/></svg>";

let cacheEstudiantes = [];

// ==========================================
// 3. INICIAR CÁMARA Y MODELOS
// ==========================================
async function init() {
  try {
    statusBar.innerText = "⏳ Cargando modelos de Inteligencia Artificial...";
    
    const MODEL_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';
    
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
    ]);

    statusBar.innerText = "📷 Conectando cámara...";

    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: "user" },
        width: { ideal: 640 },
        height: { ideal: 480 }
      }
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    video.setAttribute("playsinline", "true");
    video.muted = true;
    await video.play();

    statusBar.innerText = "📥 Sincronizando con Firebase...";
    await cargarEstudiantes();

    statusBar.innerText = "⚡ Sistema Biométrico en línea. Listo para escanear.";
    btnScan.disabled = false;

  } catch (err) {
    if (err.name === "NotAllowedError") {
      statusBar.innerText = "❌ Permiso de cámara bloqueado en el navegador.";
    } else {
      statusBar.innerText = "❌ Error: " + err.message;
    }
    console.error(err);
  }
}

// ==========================================
// 4. DESCARGA DE ROSTROS Y FOTOS
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
    console.log(`Estudiantes sincronizados: ${cacheEstudiantes.length}`);
  } catch (e) {
    console.error("Error cargando estudiantes:", e);
  }
}

// ==========================================
// 5. ESCANEO FACIAL Y ASISTENCIA
// ==========================================
btnScan.addEventListener('click', async () => {
  statusBar.innerText = "🔍 Analizando rostro frente a la cámara...";

  const detection = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) {
    statusBar.innerText = "⚠️ No se detectó rostro. Mira fijamente al lente.";
    return;
  }

  const detectedDescriptor = detection.descriptor;
  let match = null;
  let menorDistancia = 0.55;

  cacheEstudiantes.forEach(est => {
    const distancia = faceapi.euclideanDistance(est.descriptor, detectedDescriptor);
    if (distancia < menorDistancia) {
      menorDistancia = distancia;
      match = est;
    }
  });

  if (match) {
    statusBar.innerText = `✅ Identificado: ${match.nombre_completo}`;
    mostrarFicha(match);
    await registrarAsistenciaFirestore(match);
  } else {
    statusBar.innerText = "❌ Rostro no registrado en la base de datos.";
    limpiarFicha();
  }
});

// ==========================================
// 6. MOSTRAR DATOS Y FOTO EN PANTALLA
// ==========================================
function mostrarFicha(est) {
  const ahora = new Date();
  const horaStr = ahora.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // Foto y Cabecera
  document.getElementById('img-perfil').src = est.foto_base64 || DEFAULT_AVATAR;
  document.getElementById('lbl-nombre-titulo').innerText = est.nombre_completo || 'Sin Identificar';
  document.getElementById('lbl-cedula-sub').innerText = `Cédula: ${est.cedula || '---'}`;

  // Datos Generales
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

  // Calificaciones
  const listaTareas = document.getElementById('lista-tareas');
  listaTareas.innerHTML = '';
  if (est.calificaciones_tareas && est.calificaciones_tareas.length > 0) {
    est.calificaciones_tareas.forEach(t => {
      listaTareas.innerHTML += `<li><span>${t.tarea}</span> <strong style="color:#00e5ff;">${t.nota}/100</strong></li>`;
    });
  } else {
    listaTareas.innerHTML = '<li style="justify-content:center;">Sin tareas registradas.</li>';
  }
}

function limpiarFicha() {
  document.getElementById('img-perfil').src = DEFAULT_AVATAR;
  document.getElementById('lbl-nombre-titulo').innerText = "Sin Identificar";
  document.getElementById('lbl-cedula-sub').innerText = "Cédula: ---";
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
    console.error("Error registrando asistencia:", e);
  }
}

// ==========================================
// 7. CAPTURA DE FOTO + BIOMETRÍA EN REGISTRO
// ==========================================
btnOpenModal.addEventListener('click', () => modal.style.display = 'flex');
btnCloseModal.addEventListener('click', () => modal.style.display = 'none');

// Función para extraer la foto del video en Base64
function capturarFotoCanvas() {
  const canvasTemp = document.createElement('canvas');
  canvasTemp.width = 300;
  canvasTemp.height = 300;
  const ctx = canvasTemp.getContext('2d');
  
  // Recorte centrado para que quede cuadrada tipo foto carnet
  const minDim = Math.min(video.videoWidth, video.videoHeight);
  const startX = (video.videoWidth - minDim) / 2;
  const startY = (video.videoHeight - minDim) / 2;

  ctx.drawImage(video, startX, startY, minDim, minDim, 0, 0, 300, 300);
  return canvasTemp.toDataURL('image/jpeg', 0.8);
}

formRegistro.addEventListener('submit', async (e) => {
  e.preventDefault();
  regStatus.innerText = "📸 Capturando rostro y procesando biometría...";

  const detection = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) {
    regStatus.innerText = "❌ No se vio tu rostro. Sostén el móvil frente a ti y presiona guardar.";
    return;
  }

  // Capturar la foto real de la cámara
  const fotoBase64 = capturarFotoCanvas();
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
    foto_base64: fotoBase64, // Guardar imagen capturada
    calificaciones_tareas: [
      { tarea: "Tarea Diagnóstica", nota: 100 },
      { tarea: "Práctica Evaluada 1", nota: 95 }
    ],
    face_descriptor: faceDescriptorArray,
    fecha_creacion: new Date().toISOString()
  };

  try {
    regStatus.innerText = "Guardando datos y foto en Firebase...";
    await db.collection('estudiantes').add(nuevoEstudiante);
    regStatus.innerText = "✅ ¡Estudiante y foto registrados exitosamente!";
    
    await cargarEstudiantes(); // Actualizar lista local
    
    setTimeout(() => {
      formRegistro.reset();
      regStatus.innerText = "";
      modal.style.display = 'none';
    }, 1500);

  } catch (err) {
    regStatus.innerText = "❌ Error al guardar: " + err.message;
    console.error(err);
  }
});

window.addEventListener('DOMContentLoaded', init);
