# Blog automático

Este directorio contiene el generador que convierte los commits de los
repositorios del proyecto en entradas del blog, en español e inglés.

## Cómo funciona

1. `.github/workflows/blog.yml` se ejecuta cada lunes a las 06:00 UTC o a mano.
2. `generate.mjs` lee `repos.json`, clona de forma superficial cada repositorio
   (solo metadatos, sin blobs) y recoge los commits del periodo pendiente.
3. Descarta commits de mantenimiento (`chore`, `ci`, `build`, `test`, `style`,
   `revert`) y mensajes poco informativos (`varios`, `wip`, `initial commit`…).
4. Agrupa lo que queda por repositorio en una entrada con secciones
   (nuevas funcionalidades, correcciones, rendimiento, refactorización,
   documentación y otros cambios).
5. Escribe la entrada en `/blog/<fecha>-<repo>/` y `/en/blog/<fecha>-<repo>/`,
   actualiza los índices y los feeds RSS, y registra el estado en
   `blog/data/posts.json`.

El workflow solo hace commit si hay diferencias, así que una semana sin cambios
no genera ruido en el historial.

## Configuración

`blog/automation/repos.json`:

| Campo | Descripción |
| --- | --- |
| `site.baseUrl` | URL pública del sitio. De ella se derivan canónicas, hreflang y rutas. |
| `initialDays` | Días que se revisan en la primera ejecución (si no hay estado). |
| `maxCommitsPerPost` | Máximo de commits listados por entrada; el resto se resume con un aviso. |
| `repos[].slug` | Identificador corto; también es el nombre del directorio local. |
| `repos[].repo` | Repositorio en GitHub con formato `propietario/nombre`. |
| `repos[].projectPath` | Ruta de la ficha del proyecto en el sitio (versión ES). |
| `repos[].projectPathEn` | Ruta de la ficha en inglés, sin el prefijo `/en`. |
| `repos[].name` | Nombre visible del proyecto. |

Para añadir otro repositorio basta con añadir una entrada al array `repos`.
Para dejar de publicar uno, elimínalo de la lista (las entradas ya publicadas
se conservan).

## Token

`expanse` y `rss2` son públicos y se leen sin credenciales. `chatland` y
`vuigram` son privados: el workflow necesita un secreto `BLOG_GITHUB_TOKEN` con
un PAT de solo lectura (*Contents: Read* sobre esos dos repositorios). Sin ese
secreto, el generador omite los repos privados y publica el resto sin fallar.

El `GITHUB_TOKEN` del propio workflow se usa para hacer push a `main`; no hace
falta darle acceso a los otros repositorios.

## Ejecución manual

Desde GitHub: pestaña *Actions* → *Blog automático* → *Run workflow*. El campo
`days` solo se usa cuando todavía no existe `blog/data/posts.json`.

En local, con los clones del proyecto en `/home/x`:

```bash
node blog/automation/generate.mjs --local-root /home/x
```

Opciones:

```bash
node blog/automation/generate.mjs --help
node blog/automation/generate.mjs --days 7 --dry-run
```

`--dry-run` muestra qué entradas y commits se publicarían sin escribir nada.

## Estado y curaduría

`blog/data/posts.json` es el estado del blog y la fuente de verdad para
regenerar índices y feeds. Puedes editarlo para corregir títulos o quitar
commits, pero después vuelve a ejecutar el generador. Si borras el archivo, la
siguiente ejecución vuelve a sembrar el blog con los últimos `initialDays` días.

Los archivos generados (`blog/<fecha>-<repo>/`, `en/blog/<fecha>-<repo>/`,
`blog/feed.xml`, `en/blog/feed.xml`, `blog/index.html`, `en/blog/index.html`)
no deben editarse a mano: se sobrescriben en cada ejecución.

## Publicación

El workflow hace commit directamente en `main`, la rama publicada. Si la
organización restringe los permisos del `GITHUB_TOKEN` o protege la rama, hay
que permitir escritura a GitHub Actions (o usar un PAT con permiso de escritura
en el secreto `BLOG_GITHUB_TOKEN`). Un fallo de push no rompe el blog: la
siguiente ejecución vuelve a intentarlo.

## Nota sobre el código fuente del sitio

Este repositorio contiene el sitio ya compilado en la rama `main`. El
generador se apoya en la cabecera y el pie de `blog/index.html` y
`en/blog/index.html`, así que si algún día se regenera el sitio desde su fuente
(Astro u otra), conviene portar también esta automatización y los estilos
`.post-*` de `assets/styles.css`.
