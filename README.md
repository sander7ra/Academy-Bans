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

- `pages/home.html`: bienvenida y accesos.
- `pages/reglas.html`: reglas del team.
- `pages/lore.html`: lore de Academia Bans.
- `pages/calendario.html`: horario y examen de los viernes.
- `pages/tareas.html`: espacio preparado para el sistema de tareas.
- `pages/casa.html`: información e integrantes de la casa asignada.
- `pages/ajustes.html`: actualmente muestra “Próximamente”.

## Publicar en GitHub Pages

Sube **el contenido de esta carpeta** a la raíz del repositorio. En GitHub abre `Settings → Pages` y selecciona:

- Branch: `main`
- Folder: `/ (root)`

El archivo `index.html` debe quedar en la raíz. La PWA necesita HTTPS, que GitHub Pages proporciona automáticamente.

## Firebase y seguridad

La configuración pública de Firebase está en `js/firebase-config.js`. Las contraseñas pertenecen únicamente a Firebase Authentication: nunca las guardes en Firestore ni dentro de estos archivos.

Cada documento de `usuarios` debe usar el UID de Authentication como ID y contener `usuario`, `nombre`, `grado` y `rol`.

Cloudinary recibe únicamente las entregas hechas mediante foto: cloud name `djbnw9tl`, upload preset `tareas_team`. Nunca pongas el API Secret de Cloudinary en HTML o JavaScript.

## Actualizar la PWA

Después de cambios importantes, aumenta la versión del caché en `sw.js` (por ejemplo, de `academia-bans-v6` a `academia-bans-v7`). Esto obliga a la app instalada a preparar la nueva versión.

## Sistema de tareas

La sección `Tareas` cambia según el campo `rol` del perfil:

- `profesor`: publica tareas para B, A, S o Todos; ve únicamente sus propias tareas y califica sus entregas.
- `alumno`: ve las tareas de su grado, puede subir una foto o marcar que la entregó por WhatsApp, y consulta su nota y comentario.

Las imágenes se comprimen antes de subirlas a Cloudinary. El proyecto usa el cloud name `djbnw9tl` y el upload preset sin firma `tareas_team`; nunca añadas un API Secret al navegador.

Antes de probar el sistema, copia el contenido actualizado de `firestore.rules` en `Firestore Database → Reglas` y pulsa `Publicar`.

Las colecciones `tareas` y `entregas` se crean automáticamente con la primera publicación y la primera entrega. No es necesario crearlas manualmente.

## Casas

En cada documento privado de `usuarios` agrega el campo `casa` con uno de estos valores exactos:

- `Concordia` para Casa Concordia ♥
- `Divitiae` para Casa Divitiae ♦
- `Fatum` para Casa Fatum ♣
- `Virtus` para Casa Virtus ♠

También funciona si escribes el prefijo, por ejemplo `Casa Concordia`, pero usa el mismo valor en ambos lugares.

Crea además un documento en `perfilesPublicos` con el mismo UID del usuario y solo estos campos: `usuario`, `nombre` y `casa`. Así los integrantes de la misma casa pueden verse sin exponer sus datos privados. La foto se toma de `assets/images/members/usuario-icon.png`.
