# Dinámicas Electrónicas — web

Sitio público de Dinámicas Electrónicas, publicado en:

**https://dinamicaselectronicas.com/**

El contenido es HTML estático con CSS propio, sin dependencias de ejecución. No
hay compilación: GitHub Actions reúne los archivos y los publica en GitHub
Pages. La rama de trabajo y de publicación es `gh-pages`.

## Estructura

| Ruta | Contenido |
| --- | --- |
| `index.html` | Portada. |
| `proyectos/` | Índice y fichas de Expanse, RSS2, ChatLand y Vuigram. |
| `en/` | Versión inglesa del sitio. |
| `blog/` | Blog y feeds RSS. Las entradas se generan automáticamente. |
| `assets/` | Estilos, logotipos e imágenes. |
| `404.html` | Página de error para rutas inexistentes. |
| `CNAME` | Dominio personalizado (`dinamicaselectronicas.com`). |
| `blog/automation/` | Generador y configuración del blog automático. |
| `.github/workflows/deploy.yml` | Publicación del sitio en GitHub Pages. |
| `.github/workflows/blog.yml` | Publicación semanal del resumen de los repositorios. |

## Publicación

Cada push a `gh-pages` lanza el workflow **Publicar el sitio**, que:

1. Comprueba que el `CNAME` y el dominio de las páginas sean correctos.
2. Copia los archivos estáticos a `_site/` (sin `.git` ni `.github`).
3. Publica el artefacto en GitHub Pages.

El despliegue también se puede lanzar a mano desde la pestaña *Actions*
(*Publicar el sitio* → *Run workflow*).

### Configuración necesaria en GitHub

En **Settings → Pages → Build and deployment**:

- **Source**: `GitHub Actions` (no "Deploy from a branch").
- **Custom domain**: `dinamicaselectronicas.com`.

En el DNS del dominio, apunta a GitHub Pages:

- `dinamicaselectronicas.com` → registros `A` a
  `185.199.108.153`, `185.199.109.153`, `185.199.110.153` y
  `185.199.111.153`.
- `www` → `CNAME` a `dinamicas-electronicas.github.io`.

Marca *Enforce HTTPS* cuando GitHub haya emitido el certificado.

> El job **Desplegar en GitHub Pages** falla si Pages sigue configurado como
> *Deploy from a branch*. Cambia la fuente a *GitHub Actions* antes de hacer el
> primer push a `gh-pages`.

> Si la rama por defecto del repositorio cambia de nombre, actualiza
> `on.push.branches` en `.github/workflows/deploy.yml` y la referencia `ref:` de
> `.github/workflows/blog.yml`.

## Blog automático

Cada lunes a las 06:00 UTC, GitHub Actions lee los commits de los repositorios
del proyecto, agrupa los cambios relevantes y publica una entrada en español e
inglés. Al terminar, despliega el sitio con el nuevo contenido. También se puede
ejecutar a mano desde la pestaña *Actions*.

Los detalles de configuración están en `blog/automation/README.md`.

## Desarrollo local

Al ser HTML estático basta con servirlo desde la raíz del repositorio:

```bash
python3 -m http.server 8080
# http://localhost:8080/
```
