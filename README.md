# LimpiaFoto by MGP Media

PWA estática de MGP Media para analizar y eliminar metadatos de imágenes, además de normalizar texto, directamente en el navegador.

## Publicar gratis con GitHub Pages

1. Crea un repositorio nuevo en GitHub, por ejemplo `limpiafoto`.
2. Sube **todos los archivos de esta carpeta a la raíz del repositorio**. No subas el ZIP como único archivo.
3. En el repositorio entra a **Settings → Pages**.
4. En **Build and deployment**, selecciona **Deploy from a branch**.
5. Elige la rama **main** y la carpeta **/(root)**, luego guarda.
6. Cuando GitHub termine el despliegue, verás una URL parecida a:
   `https://TU-USUARIO.github.io/limpiafoto/`
7. Ábrela en Safari en tu iPhone y usa **Compartir → Añadir a pantalla de inicio**.

## Dominio propio opcional

En **Settings → Pages → Custom domain** puedes conectar después un dominio o subdominio propio. GitHub creará/actualizará el archivo `CNAME` cuando corresponda.

## Archivos principales

- `index.html` — interfaz.
- `styles.css` — diseño responsive.
- `app.js` — análisis y limpieza local.
- `manifest.webmanifest` — instalación como PWA.
- `service-worker.js` — funcionamiento offline.
- `logo.svg` — logotipo horizontal.
- `icon.svg` y PNG — iconos de app/iPhone.
- `.nojekyll` — evita procesamiento Jekyll innecesario en GitHub Pages.

## Privacidad

LimpiaFoto no incluye analítica ni backend de imágenes. Los archivos seleccionados se procesan en el navegador. La política CSP incluida limita las conexiones de la página a su propio origen.

## Compatibilidad

- JPEG, PNG y WebP: limpieza de metadatos compatible sin recomprimir cuando es posible.
- JPEG con orientación EXIF distinta de la normal: se recodifica para conservar la orientación visual al quitar EXIF.
- HEIC/HEIF: depende del soporte del navegador; cuando puede abrirse se convierte a JPEG limpio.

## Nota

Eliminar metadatos no garantiza cómo una plataforma externa clasificará una imagen. Algunas plataformas usan señales adicionales o análisis del contenido visual.


## Humanizador de texto

La pestaña **Texto** funciona completamente en el navegador y no usa APIs externas. Puede normalizar Unicode oculto, espacios especiales, guiones, comillas, entidades HTML, espacios sobrantes y símbolos frecuentes. No realiza una reescritura semántica con IA ni garantiza resultados frente a detectores de IA.


## Branding

Esta edición incorpora la firma visual **LimpiaFoto by MGP Media** y utiliza el logo de MGP Media en cabecera y footer.
