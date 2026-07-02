# interseo

Auditor de SEO técnico que analiza el **código fuente** de un sitio web — una carpeta con HTML — sin tocar la red. Pensado para agentes: cada hallazgo señala el archivo concreto que hay que editar, así que un agente puede auditar, arreglar y volver a auditar hasta dejarlo limpio. Ideal antes del deploy, en CI, o cuando el sitio aún no está publicado.

Se usa de dos formas:

- **Skill** — versionada en `skills/interseo`, portable: cualquier agente puede copiarla y usarla (se auto-descarga el motor si hace falta).
- **Servidor MCP** — tres herramientas para cualquier cliente MCP.

No tiene dependencias: solo Node 20 o superior.

## Qué revisa

Por página HTML:

- `title`, meta description, H1, `lang`, viewport, canonical, `noindex`
- Imágenes sin `alt`, thin content (menos de 120 palabras), mixed content
- JSON-LD, Open Graph y favicon en la home

Por proyecto:

- `robots.txt` presente y sin bloqueo global
- `sitemap.xml` presente y válido
- Páginas legales (privacidad, cookies, aviso legal) y de contacto
- **Enlaces internos rotos comprobados contra los archivos reales** (`/blog/` → ¿existe `blog/index.html`?)
- Titles y descriptions duplicados entre páginas

Devuelve puntuación 0-100 con nota (Excelente / Bueno / Mejorable / Crítico), los problemas ordenados por prioridad y un prompt de arreglo con las rutas de archivo a editar.

## Uso rápido

```powershell
git clone https://github.com/InterLarp/interseo
cd interseo

node src/cli.js source ./dist --base https://tudominio.com
node src/cli.js source ./public --prompt     # prompt de arreglo con rutas
node src/cli.js source . --json              # resultado completo
```

`source` es el comando por defecto: `node src/cli.js ./dist` también funciona.

## Servidor MCP

```powershell
npm run mcp
```

Configuración del cliente (ajusta la ruta al repo):

```json
{
  "mcpServers": {
    "interseo": {
      "command": "node",
      "args": ["<ruta-al-repo>/src/mcp.js"]
    }
  }
}
```

| Herramienta | Qué hace |
| --- | --- |
| `audit_source` | Audita una carpeta con HTML sin red; hallazgos con rutas de archivo |
| `generate_seo_kit` | Genera robots.txt, sitemap.xml, JSON-LD, legales y más |
| `analyze_html` | Analiza HTML en bruto |

El flujo natural: `audit_source` → arreglar los archivos señalados → `generate_seo_kit` para lo que falte → `audit_source` de nuevo para confirmar. Detalles en [docs/mcp.md](docs/mcp.md).

## Skill para agentes

La skill vive en `skills/interseo` y es portable: su runner localiza el motor por `INTERSEO_HOME`, por la estructura del repo, o clonándolo automáticamente en `~/.interseo/repo` la primera vez (necesita git).

```powershell
# desde la carpeta de la skill, en cualquier máquina con Node 20
node scripts/run_interseo.mjs source ./dist --base https://tudominio.com
```

Para instalarla en Codex:

```powershell
npm run skill:install
```

## Kit generado

`generate_seo_kit` (o `node src/cli.js kit tudominio.com --save`) produce los archivos que el audit suele echar en falta:

```
robots.txt                sitemap.xml
seo-head-snippet.html     structured-data.jsonld
llms.txt                  humans.txt
.well-known/security.txt  google-site-verification.html
google-search-console-checklist.md
legal/                    plantillas de privacidad, cookies y aviso legal
```

Las plantillas de `legal/` son orientativas: revísalas con datos reales y criterio legal antes de publicarlas.

## Estructura del proyecto

```
src/source-auditor.js      auditoría de código fuente
src/analyzer.js            análisis HTML, robots y sitemaps
src/kit.js                 generación del kit de archivos
src/cli.js                 CLI mínimo (source y kit)
src/mcp.js                 servidor MCP por stdio
skills/interseo/           skill portable para agentes
docs/                      referencia de CLI y MCP
```

## Licencia

Gratis para uso personal, educativo, de investigación y de organizaciones sin ánimo de lucro, bajo [PolyForm Noncommercial 1.0.0](LICENSE). Puedes usarlo, modificarlo y compartirlo libremente mientras no sea con fines comerciales. Para uso comercial, contacta con el autor.
