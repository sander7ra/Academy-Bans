# Academia Bans

Portal del team hecho con HTML, CSS, JavaScript, Firebase y PWA.

## Abrirlo en VS Code

1. Abre esta carpeta completa en Visual Studio Code.
2. Abre `index.html` con **Live Server**.
3. Inicia sesión escribiendo solo el usuario y la contraseña. El código añade `@team.invalid` internamente.

No abras `index.html` con doble clic: la navegación interna y la PWA necesitan un servidor como Live Server o GitHub Pages.

## Estructura

```text
academia-bans/
├── index.html                 Login y estructura principal
├── css/                       Diseño
├── js/                        Firebase, sesión, navegación y PWA
├── pages/                     Contenido editable de cada sección
├── assets/
│   ├── icons/                 Iconos de la PWA
│   └── images/
│       ├── banner-placeholder.svg
│       ├── coin.png           Moneda usada por la tienda
│       └── members/           Fotos de los integrantes
├── pwa/                       Manifest y página sin conexión
├── sw.js                      Service worker (debe permanecer en la raíz)
└── firestore.rules            Reglas actuales de Firestore
```

## Poner el banner

Guarda tu banner en:

`assets/images/banner.png`

La página lo detectará automáticamente. Si no existe, mostrará un banner provisional. Se recomienda una imagen horizontal de aproximadamente 1400 × 300 px.

## Fotos de integrantes

Guárdalas en `assets/images/members/`. El archivo se elige usando el campo `usuario` de Firestore:

- `flins-icon.png`
- `neuvillete-icon.png`
- `lumine-icon.png`

Los nombres deben estar en minúsculas. Si falta una foto, aparecerá el icono genérico.

## Editar las páginas

- `pages/home.html`: tablón general con publicaciones, respuestas y likes.
- `pages/reglas.html`: reglas del team.
- `pages/lore.html`: lore de Academia Bans.
- `pages/calendario.html`: horario y examen de los viernes.
- `pages/tareas.html`: espacio preparado para el sistema de tareas.
- `pages/casa.html`: información e integrantes de la casa asignada.
- `pages/tienda.html`: saldo, transferencias y beneficios canjeables.
- `pages/solicitudes.html`: solicitudes de la tienda, visible solo para Dirección.
- `pages/alumnos.html`: expedientes y ranking de las casas asignadas al profesor.
- `pages/reportes.html`: publicaciones reportadas por alumnos estrella.
- `pages/ajustes.html`: actualmente muestra “Próximamente”.

## Publicar en GitHub Pages

Sube **el contenido de esta carpeta** a la raíz del repositorio. En GitHub abre `Settings → Pages` y selecciona:

- Branch: `main`
- Folder: `/ (root)`

El archivo `index.html` debe quedar en la raíz. La PWA necesita HTTPS, que GitHub Pages proporciona automáticamente.

## Firebase y seguridad

La configuración pública de Firebase está en `js/firebase-config.js`. Las contraseñas pertenecen únicamente a Firebase Authentication: nunca las guardes en Firestore ni dentro de estos archivos.

Cada documento de `usuarios` debe usar el UID de Authentication como ID y contener `usuario`, `nombre`, `grado`, `casa` y `rol`.

Para dar acceso de Dirección a una persona, añade el campo booleano `esAdmin: true`. Es independiente de `rol`, así que esa persona puede seguir siendo `alumno` o `profesor`. Nunca uses el texto `"true"`: debe ser un booleano.

Cloudinary recibe únicamente las entregas hechas mediante foto: cloud name `djbnw9tl`, upload preset `tareas_team`. Nunca pongas el API Secret de Cloudinary en HTML o JavaScript.

## Actualizar la PWA

Después de cambios importantes, aumenta la versión del caché en `sw.js` (por ejemplo, de `academia-bans-v6` a `academia-bans-v7`). Esto obliga a la app instalada a preparar la nueva versión.

## Sistema de tareas

La sección `Tareas` cambia según el campo `rol` del perfil:

- `profesor`: publica tareas para B, A, S o Todos y solo para sus casas asignadas; ve únicamente sus propias tareas y califica sus entregas.
- `alumno`: ve las tareas de su grado y su casa, puede subir una foto o marcar que la entregó por WhatsApp, y consulta su nota, comentario y monedas obtenidas.

En cada perfil de profesor añade `casasACargo` como **array**. Ejemplo para Boosaurus:

```text
casasACargo: ["Fatum", "Concordia"]
```

Al otro profesor puedes asignarle, por ejemplo, `["Divitiae", "Virtus"]`. El formulario solo permitirá marcar las casas de ese array. Las tareas antiguas que no tengan `casasDestino` no aparecerán a los alumnos; las nuevas ya guardan ese campo automáticamente.

Las imágenes se comprimen antes de subirlas a Cloudinary. El proyecto usa el cloud name `djbnw9tl` y el upload preset sin firma `tareas_team`; nunca añadas un API Secret al navegador.

Antes de probar el sistema, copia el contenido actualizado de `firestore.rules` en `Firestore Database → Reglas` y pulsa `Publicar`.

Las colecciones `tareas`, `entregas`, `monederos`, `transferenciasMonedas` y `solicitudesTienda` se crean automáticamente al usarse. No es necesario crearlas manualmente.

## Tienda y monedas

Cada integrante recibe un monedero con saldo inicial `0` la primera vez que abre esta versión de la app. Por eso, antes de transferirle monedas o calificarle una tarea, esa persona debe haber iniciado sesión al menos una vez.

Los profesores no gastan monedas al calificar: la recompensa se genera automáticamente según la nota:

- 100: 25 monedas
- 90–99: 20 monedas
- 80–89: 15 monedas
- 70–79: 10 monedas
- 1–69: 5 monedas
- Entrega a tiempo: 5 monedas adicionales

La tienda contiene inicialmente `Cambio de personaje` por 120 monedas, con espera de 30 días, y `Volver a hacer el test` por 450 monedas, con espera de 60 días. La compra descuenta el saldo y crea una solicitud para Dirección. Si Dirección la rechaza, las monedas se devuelven y la espera se deshace; si la acepta, no hay devolución automática.

Las transferencias buscan el campo `usuario` de `perfilesPublicos`. Conserva cada usuario en minúsculas, exactamente igual que en su perfil privado.

## Casas

En cada documento privado de `usuarios` agrega el campo `casa` con uno de estos valores exactos, sin escribir el prefijo `Casa`:

- `Concordia` para Casa Concordia ♥
- `Divitiae` para Casa Divitiae ♦
- `Fatum` para Casa Fatum ♣
- `Virtus` para Casa Virtus ♠

La app crea o sincroniza automáticamente un documento en `perfilesPublicos` con el mismo UID y los campos seguros `usuario`, `nombre`, `casa`, `grado` y `rol`. Así los rankings y los paneles de profesores pueden identificar correctamente a cada alumno sin exponer su perfil privado completo. La foto se toma de `assets/images/members/usuario-icon.png`.

## Comunidad, disciplina y alumnos estrella

El Home funciona como un tablón general. Alumnos y profesores pueden publicar texto, responder y dar like. Los alumnos estrella pueden reportar publicaciones hechas por alumnos, pero nunca publicaciones de profesores.

Los profesores ven `Alumnos` y `Reportes` en lugar de `Casa` y `Calendario`. Solo pueden moderar alumnos pertenecientes a las casas incluidas en su campo `casasACargo`.

- Cada tarjeta amarilla `🏷️` cuenta para alcanzar el rango de alumno estrella.
- Con 5 tarjetas, el alumno obtiene `⭐` y permiso para reportar posts.
- Si un alumno normal recibe una advertencia y tiene tarjetas, pierde una tarjeta y no recibe deuda.
- Si un alumno estrella recibe una advertencia, pierde la estrella y todas sus tarjetas; esa medida no genera deuda.
- Sin protección, una advertencia añade `🔖`, dura los días elegidos por el profesor y genera una deuda de 100 monedas.
- Con 3 advertencias activas, el acceso queda suspendido hasta que expire la primera.

Las recompensas de tareas pagan primero cualquier deuda. El alumno también puede abonar total o parcialmente desde la Tienda. Las colecciones `estadoAcademico`, `accionesDisciplina`, `publicaciones` y `reportesPosts` se crean automáticamente.

Después de reemplazar el proyecto, publica también el nuevo archivo `firestore.rules`. Sin esas reglas, las funciones nuevas aparecerán en pantalla pero Firebase rechazará sus operaciones.
