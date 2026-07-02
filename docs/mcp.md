# Servidor MCP

`src/mcp.js` expone interseo como servidor MCP por stdio (JSON-RPC, protocolo `2025-06-18`). Sin dependencias: cualquier cliente MCP lo lanza con Node. Ninguna herramienta toca la red.

Los fallos al ejecutar una herramienta se devuelven dentro del resultado con `isError: true` (como indica el spec MCP); las herramientas o métodos desconocidos devuelven errores JSON-RPC (`-32602` / `-32601`).

## Arranque

```powershell
npm run mcp
# o directamente
node src/mcp.js
```

Configuración típica del cliente:

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

## Flujo recomendado

1. `audit_source` sobre la carpeta con el HTML del proyecto.
2. Editar los archivos que señalan los checks con status `fail`/`warn` (el `fixPrompt` del resultado los lista).
3. `generate_seo_kit` para crear lo que falte (robots, sitemap, JSON-LD, legales).
4. `audit_source` de nuevo para comparar el score.

## Herramientas

### `audit_source`

Audita el código fuente local de un sitio (carpeta con HTML) sin acceso a red. Los hallazgos señalan rutas de archivo reales.

| Parámetro | Tipo | Descripción |
| --- | --- | --- |
| `dir` (requerido) | string | Carpeta con el HTML publicable (`dist/`, `public/`, o la raíz) |
| `baseUrl` | string | URL del sitio para resolver enlaces absolutos internos |
| `pageLimit` | number | Máximo de archivos HTML a analizar (200 por defecto) |

Devuelve: `score` (0-100) y `grade`, `checks` y `priority` (con `evidence` y `recommendation`), `totals` por carencia, `brokenLinks` con archivo de origen, `sitemapMissingFiles` (URLs del sitemap sin archivo correspondiente), `pages` (análisis por página), `fixPrompt` (prompt de arreglo con rutas) y `report` (Markdown).

### `generate_seo_kit`

Genera los archivos SEO para una URL: robots.txt, sitemap.xml, snippet de head, JSON-LD (Organization + WebSite), checklist de Search Console, plantillas legales, `llms.txt`, `humans.txt`, `security.txt` y config MCP.

| Parámetro | Tipo | Descripción |
| --- | --- | --- |
| `url` (requerido) | string | URL canónica del sitio |
| `siteName` | string | Nombre del sitio; si se omite, se usa el dominio |
| `description` | string | Descripción corta del sitio |
| `businessName` | string | Nombre legal del negocio |
| `lang` | string | Código de idioma para los datos estructurados de WebSite |
| `discoveredUrls` | string[] | URLs del mismo origen para incluir en el sitemap |

Devuelve: `{ siteName, origin, generatedAt, files[] }` donde cada archivo es `{ path, language, content }`.

### `analyze_html`

Analiza HTML en bruto: metadatos, headings, enlaces, imágenes, JSON-LD, Open Graph, Twitter Cards, hreflang y mixed content.

| Parámetro | Tipo | Descripción |
| --- | --- | --- |
| `html` (requerido) | string | Código fuente HTML |
| `url` (requerido) | string | URL de la página, para resolver enlaces relativos |
