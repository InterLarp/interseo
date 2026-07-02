# interseo

Auditor de SEO técnico para sitios web. Le pasas un dominio y te devuelve un informe con puntuación, los problemas ordenados por prioridad y un kit de archivos listo para publicar (`robots.txt`, `sitemap.xml`, datos estructurados, checklist de Search Console, plantillas legales...).

Funciona de tres formas:

- **CLI** — auditorías desde la terminal.
- **Servidor MCP** — cinco herramientas para usar desde cualquier cliente MCP.
- **Skill** — versión empaquetada para Codex en `skills/interseo`.

No tiene dependencias: solo necesita Node 20 o superior.

## Uso rápido

Con el dominio basta. El nombre del sitio se infiere del propio crawl (metadatos, title, H1, Open Graph o el dominio) y el email de contacto legal se deriva como `contacto@dominio`.

```powershell
node src/cli.js tudominio.com
```

Algunas variantes habituales:

```powershell
node src/cli.js tudominio.com --save        # guarda el kit en generated/
node src/cli.js tudominio.com --deep        # crawl más amplio (12 páginas)
node src/cli.js tudominio.com --full        # crawl máximo (20 páginas)
node src/cli.js tudominio.com --prompt      # imprime un prompt de arreglo
node src/cli.js kit tudominio.com --save    # genera el kit sin auditar
```

La referencia completa de comandos y flags está en [docs/cli.md](docs/cli.md).

## Servidor MCP

```powershell
npm run mcp
```

Configuración de ejemplo para el cliente (ajusta la ruta a donde tengas el repo):

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

Herramientas disponibles:

| Herramienta | Qué hace |
| --- | --- |
| `audit_site` | Auditoría completa: DNS, crawl, score, reportes, prompts y kit |
| `generate_seo_kit` | Genera los archivos del kit sin rastrear |
| `generate_fix_prompt` | Prompt de arreglo listo para skill, MCP o edición directa |
| `analyze_html` | Analiza HTML en bruto |
| `build_report` | Convierte un audit JSON en Markdown y CSV |

Detalles de cada herramienta y sus parámetros en [docs/mcp.md](docs/mcp.md).

## Skill para Codex

La skill versionada vive en `skills/interseo`. Para instalarla en local (la copia a `$CODEX_HOME/skills`):

```powershell
npm run skill:install
```

## Qué revisa

La auditoría puntúa por categorías y da una nota global (Excelente / Bueno / Mejorable / Crítico):

- **Infra** — resolución DNS y latencia, A/AAAA, IPv6, nameservers, SPF y DMARC.
- **Rastreo** — home accesible por HTTPS, redirects, `robots.txt`, bloqueos globales y sitemap.
- **Contenido** — `title`, meta description, canonical, viewport, idioma, H1, enlaces internos e imágenes sin `alt`.
- **Indexación** — `noindex`, `X-Robots-Tag`, JSON-LD, Open Graph, Twitter Cards, hreflang y favicon.
- **Confianza** — política de privacidad, cookies, aviso legal, página de contacto y mixed content.
- **Crawler** — errores HTTP, titles y descriptions duplicados, thin content y enlaces internos rotos.
- **Google** — sitemap declarado en robots, Schema.org útil y preparación mínima para Search Console.
- **Rendimiento** — tiempo de respuesta y control de redirects.

El detalle de checks y el orden de prioridad al arreglar está en [skills/interseo/references/seo-checks.md](skills/interseo/references/seo-checks.md).

## Qué genera

Con `--save`, el kit se escribe en `generated/<sitio>/`:

```
robots.txt
sitemap.xml
seo-head-snippet.html
structured-data.jsonld
google-search-console-checklist.md
google-site-verification.html
llms.txt
humans.txt
.well-known/security.txt
interseo.mcp.json
legal/          plantillas de privacidad, cookies y aviso legal
reports/        informe Markdown, CSV de checks y páginas, audit JSON
prompts/        prompts de arreglo (skill, MCP y edición directa)
```

Las plantillas de `legal/` son orientativas: revísalas con datos reales y criterio legal antes de publicarlas.

## Estructura del proyecto

```
src/auditor.js             motor de auditoría, scoring, reportes y kit
src/cli.js                 interfaz de línea de comandos
src/mcp.js                 servidor MCP por stdio
scripts/install-skill.js   instalador de la skill en CODEX_HOME
skills/interseo/           skill versionada para Codex
docs/                      referencia de CLI y MCP
```

## Licencia

Gratis y open source, bajo licencia [MIT](LICENSE). Úsalo, modifícalo y compártelo como quieras.
