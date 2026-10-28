# MultyDrink — estabilización y preparación de Hostinger

27-10-2026. Rama conservada: `design/focus-hero-fidelity`; HEAD `3dc0203`. No commits, cambios de rama, push, modificaciones de permisos ni despliegues. La publicación permanece bloqueada por decisión del propietario hasta verificar Hostinger.

## Diagnóstico de las diez fallas

Se reprodujo el resultado inicial de 32 pruebas aprobadas y 10 fallidas. El historial explica siete expectativas desactualizadas; tres fallas tienen una única causa funcional real.

| Pruebas afectadas | Causa | Corrección |
| --- | --- | --- |
| Assets de nutrición y datos del producto (2) | Esperaban `.nutrition-transcript` y texto en el panel de composición. Los commits de nutrición, incluido `e301115`, conservaron solo la etiqueta original allí. | Comprobar fotografía auténtica y los datos de 21 porciones/0,2 g en `#nutrition-portion`. |
| Sincronización de selección (1) | Esperaba «AHORRA 36%», sustituido por el ahorro monetario aprobado en `9d1641b`. | Esperar «AHORRAS $235.000»; mantener cálculos, cantidades y sincronización. |
| Visibilidad de testimonios, escape, procedencia y carrusel (4) | Fixtures y expectativas pertenecían a reseñas ocultas/con estrellas. El commit `640beb0` pasó a fragmentos personales suministrados, sin puntuaciones ni compra verificada. | Actualizar fixtures al contrato `transcriptProvided`, verificar texto escapado, ausencia de estrellas/enlaces inventados y mantener navegación/inert/paginación. |
| Validación del formulario, envío simulado correcto y error recuperable (3) | Al configurar una política, `initApp` buscaba un enlace eliminado del diálogo por `3dc0203` y escribía `href` sobre `null`. | Crear ese enlace únicamente cuando hay una política configurada; preservar navegación segura de nueva pestaña. Las tres pruebas vuelven a ejercitar su comportamiento real. |

No se eliminaron ni omitieron pruebas. Las 42 originales pasan. Se añadieron ocho pruebas del flujo de entrega: **50/50 aprobadas**.

No se han acreditado testimonios nuevos con esta intervención: adaptar las pruebas a una presentación aprobada no verifica derechos de publicación ni evidencia científica. La nota existente de configuración sobre contraste de videos y consentimiento sigue vigente para el lanzamiento.

## Validaciones ejecutadas

- `npm.cmd test`: 50 pruebas aprobadas, cero fallidas/omitidas.
- `npm.cmd run build`: build estático correcto, 12.837 KiB de recursos (la salida del script los etiqueta como KB).
- `npm.cmd run check:build`: HTTP 200; 82 recursos, 13 archivos de código y tres hojas de estilo; rutas privadas rechazadas; precios del esquema correctos y restricciones de indexación conservadas.
- `git diff --check`: correcto; solo aviso de conversión LF/CRLF configurada.
- `node --check scripts/hostinger-release.mjs`: correcto.
- Preparación y verificación del build real: 97 archivos públicos más `release.json`, hashes SHA-256 concordantes. Para esta prueba local se usó el identificador sintético de 40 ceros, porque los cambios aún no tienen commit. No es una versión aprobada ni publicable; el build final se regeneró para retirar ese manifiesto de prueba.
- Pruebas de publicación usan una API simulada: bloqueo por hosting desconocido, bandera/token ausente, destino cambiado, backup ausente o artefacto alterado. Commit descendiente del destino, backup intacto y actualización exclusivamente `force: false`. Una carrera o rechazo final no producen reintento forzado.
- Playwright MCP en `http://127.0.0.1:4174/`, escritorio 1440×900 y móvil 390×844: sin overflow horizontal; individual $110.000, familiar $425.000, dos familiares $850.000; diálogo de privacidad operativo; envío real deshabilitado; ningún error JavaScript observado. La primera tentativa apuntó al radio cubierto por su contenido visual; se comprobó la interacción normal mediante su etiqueta visible, sin cambiar el diseño.
- El diff confirma que no se modificaron HTML, CSS, imágenes, configuración comercial, componentes ni contenido. La única corrección de aplicación está en la rama condicional de política de privacidad configurada. Con la configuración actual esa rama no se ejecuta.
- `.playwright-mcp/` no tiene archivos tracked y queda excluido por `.gitignore`. La lista cerrada del artefacto lo rechaza adicionalmente.

## Repositorios y automatización

Los árboles de `publicacion-hostinger` (`a523e41`) y el HEAD de desarrollo coincidían al comenzar; las historias de origen y Hostinger son independientes. Se comprobaron remotos y ramas sin alterarlos. La conexión GitHub confirmó que `main` y `backup-inicial-hostinger` del destino siguen en `6ba53a04b8bd7b4a6d8eaade4c640d75775d2cc7`. La consulta shell remota estuvo limitada por la red del entorno; no se interpreta la caché local como verificación remota.

Se preparó CI y una publicación manual de un SHA aprobado con artefacto compilado. Las acciones se fijaron a commits comprobados en sus repositorios oficiales. La publicación requiere entorno protegido, secreto limitado al destino, modo `static-root` verificado, habilitación explícita y SHA esperado de `main`. El script añade historia normal al destino, sin transferir fuentes de desarrollo o evidencia de navegador. Ver [procedimiento completo](hostinger-publication.md).

No se ejecutaron workflows en GitHub ni la escritura real de la API. La revisión del YAML fue estática; no se instaló un parser ni `actionlint`, no disponibles en el entorno. Los tests de contrato del workflow no equivalen a su ejecución hospedada. No se conoce el dominio ni se ha verificado hPanel; por ello no se declara listo el alojamiento ni se activa la publicación.

## Archivos de esta intervención

Modificados: `.gitignore`, `src/app.js`, `tests/assets.test.mjs`, `tests/interface.test.mjs`.

Nuevos: `.github/workflows/ci.yml`, `.github/workflows/hostinger-release.yml`, `scripts/hostinger-release.mjs`, `tests/hostinger-release.test.mjs`, `docs/hostinger-publication.md`, este informe.

`dist/` se regeneró localmente y permanece ignorado. No se instalaron dependencias, no se alteró el lockfile y no se habilitaron pedidos. Falta verificar la integración de Hostinger, obtener autorización para subir los cambios y configurar las protecciones/credenciales, ejecutar el modo de preparación en GitHub y aprobar por separado la publicación final.
