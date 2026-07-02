# Servidor MCP

`src/mcp.js` expone interseo como servidor MCP por stdio (JSON-RPC, protocolo `2025-06-18`). No requiere instalación ni dependencias: cualquier cliente MCP puede lanzarlo con Node.

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

## Herramientas

### `audit_site`

Auditoría completa de una URL pública: DNS, robots, sitemap, metadatos, políticas legales, crawl interno, score por categorías, reportes y kit generado.

| Parámetro | Tipo | Descripción |
| --- | --- | --- |
| `url` (requerido) | string | URL del sitio a auditar |
| `siteName` | string | Nombre del sitio; si se omite, se infiere del crawl |
| `crawlLimit` | number | Máximo de páginas del mismo origen a rastrear (5 por defecto, máx. 40) |
| `linkProbeLimit` | number | Máximo de URLs internas a comprobar como enlaces rotos (12 por defecto) |

### `generate_seo_kit`

Genera los archivos del kit (robots, sitemap, JSON-LD, checklist de Search Console, plantillas legales, `llms.txt`, `humans.txt`, `security.txt`, config MCP) sin rastrear el sitio.

| Parámetro | Tipo | Descripción |
| --- | --- | --- |
| `url` (requerido) | string | URL canónica del sitio |
| `siteName` | string | Nombre del sitio; si se omite, se usa el dominio |
| `description` | string | Descripción corta del sitio |
| `businessName` | string | Nombre legal del negocio |
| `discoveredUrls` | string[] | URLs del mismo origen para incluir en el sitemap |

### `generate_fix_prompt`

Devuelve un prompt de arreglo listo para usar. Si se pasa un `audit` previo no vuelve a rastrear; si solo se pasa `url`, audita primero.

| Parámetro | Tipo | Descripción |
| --- | --- | --- |
| `url` | string | URL a auditar antes de generar el prompt |
| `mode` | `skill` \| `mcp` \| `direct` | Estilo del prompt (por defecto `skill`) |
| `audit` | object | Resultado de `audit_site` para reutilizar |

### `analyze_html`

Analiza HTML en bruto: metadatos, headings, enlaces, imágenes, JSON-LD, Open Graph, Twitter Cards, hreflang y mixed content.

| Parámetro | Tipo | Descripción |
| --- | --- | --- |
| `html` (requerido) | string | Código fuente HTML |
| `url` (requerido) | string | URL de la página, para resolver enlaces relativos |

### `build_report`

Convierte un resultado de `audit_site` en informe Markdown y CSVs de checks y páginas.

| Parámetro | Tipo | Descripción |
| --- | --- | --- |
| `audit` (requerido) | object | Resultado devuelto por `audit_site` |
