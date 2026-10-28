# Publicación controlada de MultyDrink

Estado: **preparado localmente, publicación bloqueada**. El propietario indicó que desconoce el tipo de integración y el dominio de Hostinger. No se configuraron secretos, permisos ni entornos remotos; no se ejecutó una publicación.

## Repositorios y entrega

- Fuente única: `laddy10/Multydrink`, desarrollo en `design/focus-hero-fidelity`.
- Destino de entrega: `santgodev/Multydrink`, `main`. Hostinger ya tiene activada su implementación automática según el propietario.
- Los historiales son independientes. La rama local `publicacion-hostinger` (`a523e41`) contiene el árbol anterior a estas correcciones; **no publicarla**.
- `main` del destino y `backup-inicial-hostinger` se comprobaron mediante la conexión GitHub el 27-10-2026: ambos en `6ba53a04b8bd7b4a6d8eaade4c640d75775d2cc7`. Debe volverse a leer el SHA antes de cada publicación; este dato no es una autorización permanente.

Se entrega exclusivamente el contenido compilado de `dist/`, en la raíz del repositorio de destino. Incluye HTML con datos estructurados ya serializados, módulos de navegador, CSS y recursos seleccionados. El proyecto es estático; no necesita ejecutar un servidor Node en producción. `src/` dentro del build contiene módulos públicos necesarios, no herramientas de desarrollo.

El commit de entrega tendrá como único padre el `main` actual del destino. No se mezclan historiales ni se fuerza una referencia. El árbol nuevo reemplaza los archivos de la rama de entrega: elimina allí fuentes de desarrollo, pruebas, documentos y originales que no forman parte de `dist/`. Esos archivos siguen en la historia anterior y en la copia de seguridad. No se modifica ninguna otra rama. Esta sustitución de archivos es parte de la publicación que requiere autorización.

## Por qué hay un bloqueo de Hostinger

La [integración Git para sitios HTML/PHP](https://www.hostinger.com/support/1583302-how-to-deploy-a-git-repository-in-hostinger/) despliega una rama en una carpeta del alojamiento. La [integración de aplicaciones Node](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/) tiene un flujo de build distinto. No se puede deducir cuál usa este sitio mirando únicamente GitHub.

Antes de habilitar nada, comprobar en hPanel, sin pulsar Deploy:

1. Dominio público y tipo de sitio/integración.
2. Repositorio `santgodev/Multydrink`, rama `main` y carpeta servida realmente (por ejemplo `public_html`).
3. Que esa integración sirva la raíz estática que recibirá, sin esperar `package.json`, `npm run build` ni una subcarpeta `dist`. Este flujo solo admite **static-root**.
4. Si hay configuración del servidor, `.htaccess`, archivos subidos fuera de Git o un backend en la carpeta de publicación, inventariarlos antes de reemplazar nada. El build actual no suministra configuración del servidor.
5. Si resulta ser una aplicación Node con build obligatorio, mantener el bloqueo y adaptar la entrega antes de autorizar. No aplicar este flujo por suposición.

## Archivos de automatización

- `.github/workflows/ci.yml`: pruebas, build y smoke check en pushes/PRs a `main` y a la rama de desarrollo. Solo permiso `contents: read`, sin secretos de publicación.
- `.github/workflows/hostinger-release.yml`: ejecución **manual**, únicamente desde `main` del repositorio principal. `publish=false` por defecto. Acepta un SHA completo y comprueba que pertenece a la rama de desarrollo.
- `scripts/hostinger-release.mjs`: manifiesto SHA-256, lista cerrada de archivos públicos y publicación mediante Git Data API. Rechaza archivos extra, symlinks, alteraciones, SHA distinto, integración desconocida, falta de token o falta de backup.
- `tests/hostinger-release.test.mjs`: pruebas locales sin red de los bloqueos, integridad, historia, concurrencia y ausencia de actualizaciones forzadas.

Las acciones externas se fijan a SHA de commits oficiales. El job que ejecuta el código de la versión candidata no recibe el token del destino. La publicación usa otro runner y las herramientas del commit de workflow aprobado. `release.json` permite comprobar el commit fuente y los hashes de cada archivo. Es un control de integridad, no una firma criptográfica independiente; requiere proteger la rama que contiene los workflows.

El script crea blobs, un árbol y un commit sobre el padre esperado. Vuelve a comprobar `main` y actualiza la referencia con `force: false`; una carrera concurrente se rechaza. Una interrupción antes de actualizar la referencia puede dejar objetos Git sin referenciar, pero no modifica el sitio. No se reintenta forzando. Documentación: [GitHub Git references](https://docs.github.com/en/rest/git/refs#update-a-reference).

## Activación, únicamente después de autorización

1. Revisar y guardar estas correcciones en un commit de desarrollo. Autorizar su push a **origin** y un PR a `main`; no hacer push a `hostinger`. El workflow manual debe existir en la rama por defecto para aparecer en Actions.
2. Proteger `main` del repositorio principal y sus cambios de workflows mediante revisión. Crear el environment `hostinger-production`, limitarlo a `main`, exigir revisor y evitar autoaprobación. No habilitar publicación si esas protecciones no están disponibles. [Entornos de GitHub Actions](https://docs.github.com/en/actions/concepts/workflows-and-actions/deployment-environments).
3. El propietario del repositorio de destino debe crear un token fine-grained con acceso **solo** a `santgodev/Multydrink`, permiso **Contents: read and write**, sin permisos de administración ni workflows, y caducidad. Guardarlo como secreto **del environment** `HOSTINGER_CONTENTS_TOKEN`. No pegarlo en chat, código, comandos o URLs. Si una política del repositorio impide el update, no sortearla ni forzar: revisar la política con el propietario.
4. Tras verificar hPanel, definir en ese environment `HOSTINGER_DELIVERY_MODE=static-root` y `HOSTINGER_PUBLISH_ENABLED=true`. Mientras falten, toda publicación falla antes de escribir remotamente. No crear esas variables a nivel global por conveniencia.
5. Ejecutar primero el workflow desde `main` con el SHA completo aprobado y **publish=false**. Revisar el artefacto descargable, `release.json`, resultados de QA y una vista local del paquete. No se transmite ningún archivo a Hostinger en este modo.
6. Con autorización de publicación, leer el SHA actual de `santgodev/Multydrink/main` y ejecutar de nuevo con el mismo SHA fuente, **publish=true**, y ese valor en `expected_target_sha`. Se vuelve a compilar y validar; aprobar el job protegido solo cuando ese nuevo resultado esté correcto. El update de `main` puede activar Hostinger inmediatamente.
7. No declarar publicación correcta solo porque Actions acaba: comprobar en hPanel el despliegue, abrir `https://DOMINIO/release.json` y verificar `sourceSha`, comparar hashes de HTML/CSS/JS/imagen representativa, revisar precios, recursos y guardia de pedidos. CDN/caché pueden servir una versión anterior. Un resultado distinto bloquea la aceptación, no justifica otro push a ciegas.

El `GITHUB_TOKEN` del repositorio principal no se usa para escribir en el repositorio ajeno. No se necesitan credenciales FTP ni de Hostinger en este flujo; sí confirmar la integración existente.

## Exclusiones y comportamiento conservado

`.playwright-mcp/` queda ignorado por Git y rechazado por la lista de archivos del artefacto. Tampoco se entregan `.env`, `.github`, `node_modules`, `tests`, `scripts`, documentos internos u originales no incluidos en el build. No usar `git add -f` para evidencia de navegador.

Se preservan imágenes, diseño, precios, descuentos, cantidades e interacciones. `orderEndpoint`, identidad del vendedor y política siguen sin configurar; los pedidos reales permanecen deshabilitados. Publicar la web no activa un backend. Se conservan `noindex, nofollow` y `robots.txt` de preview: esta tarea no autoriza indexación pública ni inventa dominio/canonical. Revisar por separado esos ajustes cuando se confirme el alcance de lanzamiento.

## Recuperación

No borrar ni mover `backup-inicial-hostinger`. Para volver a una versión validada, preparar de nuevo su build por SHA y crear un **nuevo commit descendiente** mediante el mismo flujo y aprobación. No hacer reset remoto ni force-push. La copia inicial conserva fuentes sin compilar; no debe tratarse automáticamente como un artefacto apto para servir desde la raíz. Si falla Hostinger, detener publicaciones y verificar su registro antes de actuar.

## Límite de la validación local

Las pruebas simulan GitHub; no se ejercitó una escritura real ni una ejecución hospedada de Actions. Tampoco se verificó el servidor público, sus cabeceras, permisos, caché o limpieza de archivos viejos. La aprobación de un despliegue requiere resolver primero los datos de Hostinger indicados arriba.
