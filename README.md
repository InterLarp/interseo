# interseo

interseo audita el SEO técnico del código fuente de un sitio web sin salir a la red. Analiza una carpeta con HTML, detecta problemas reales en archivos reales y devuelve una prioridad clara para corregirlos.

Está pensado para dos usos:

- como CLI local para revisar un build estático antes de publicar
- como servidor MCP para integrarlo en otros flujos o agentes

No tiene dependencias. Solo necesitas Node 20 o superior.

## Qué revisa

Por página HTML:

- `title`, meta description, H1, `lang`, viewport, canonical y noindex
- imágenes sin `alt`, contenido delgado y mixed content
- JSON-LD, Open Graph, Twitter Cards, favicon y charset
- enlaces internos y externos detectados en el HTML

Por proyecto:

- `robots.txt` y `sitemap.xml`
- URLs del sitemap que correspondan a archivos existentes
- páginas legales y de contacto
- enlaces internos rotos contra el árbol real del proyecto
- páginas huérfanas que no reciben enlaces ni aparecen en el sitemap
- titles y descriptions duplicados
- redirecciones `meta refresh`

## Uso rápido

```powershell
git clone https://github.com/InterLarp/interseo
cd interseo

node src/cli.js source ./dist --base https://tudominio.com
node src/cli.js source ./public --prompt
node src/cli.js source . --json
```

Si omites el comando, el CLI ejecuta `source`.

## CLI

Consulta la referencia completa en [docs/cli.md](docs/cli.md).

Ejemplos:

```powershell
node src/cli.js source ./dist --base https://tudominio.com
node src/cli.js source ./public --prompt
node src/cli.js kit tudominio.com --save
```

## MCP

El servidor MCP expone tres herramientas:

- `audit_source`
- `generate_seo_kit`
- `analyze_html`

Consulta [docs/mcp.md](docs/mcp.md) para el esquema de entrada y salida, y para el flujo recomendado de auditoría y corrección.

## Skill para agentes

La skill portable vive en [skills/interseo](skills/interseo) y puede instalarse con:

```powershell
npm run skill:install
```

También puedes ejecutar el runner desde la carpeta de la skill:

```powershell
node scripts/run_interseo.mjs source ./dist --base https://tudominio.com
```

## Kit generado

`node src/cli.js kit tudominio.com --save` genera archivos SEO habituales:

- `robots.txt`
- `sitemap.xml`
- `seo-head-snippet.html`
- `structured-data.jsonld`
- `google-search-console-checklist.md`
- `llms.txt`
- `humans.txt`
- `.well-known/security.txt`
- `legal/` con plantillas de privacidad, cookies y aviso legal

Las plantillas legales son orientativas. Revísalas con datos reales antes de publicarlas.

## Estructura

```text
src/analyzer.js         análisis HTML, robots y sitemap
src/source-auditor.js   auditoría del árbol de archivos
src/kit.js              generación del kit SEO
src/cli.js              CLI mínima
src/mcp.js              servidor MCP por stdio
docs/                   referencia de uso
skills/interseo/        skill portable
```

## Licencia

PolyForm Noncommercial 1.0.0. Revisa [LICENSE](LICENSE) para los detalles completos.
