# Servidor MCP

`src/mcp.js` expone interseo como servidor MCP por stdio. No usa red ni dependencias externas.

Los errores devueltos por las herramientas siguen el formato MCP: la respuesta incluye `isError: true` cuando corresponde.

## Arranque

```powershell
npm run mcp
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

1. Ejecuta `audit_source` sobre la carpeta con el HTML publicable.
2. Corrige los archivos que aparecen en `priority` y en `fixPrompt`.
3. Usa `generate_seo_kit` para crear lo que falte: robots, sitemap, JSON-LD, legales.
4. Vuelve a ejecutar `audit_source` y compara la puntuación.

## Herramientas

### `audit_source`

Audita una carpeta con HTML y devuelve hallazgos con rutas de archivo reales.

Parámetros:

- `dir` obligatorio: carpeta con el HTML publicable
- `baseUrl`: URL del sitio para resolver enlaces internos absolutos
- `pageLimit`: máximo de páginas HTML a analizar, por defecto 200

Devuelve:

- `score` y `grade`
- `checks` y `priority`
- `totals`
- `brokenLinks`
- `sitemapMissingFiles`
- `orphanPages`
- `pages`
- `fixPrompt`
- `report`

### `generate_seo_kit`

Genera los archivos SEO para una URL: robots.txt, sitemap.xml, snippet de head, JSON-LD, checklist de Search Console, plantillas legales, `llms.txt`, `humans.txt`, `security.txt` y configuración MCP.

Parámetros:

- `url` obligatorio: URL canónica del sitio
- `siteName`: nombre del sitio
- `description`: descripción corta
- `businessName`: nombre legal del negocio
- `lang`: código de idioma para WebSite
- `discoveredUrls`: URLs del mismo origen para incluir en el sitemap

Devuelve `{ siteName, origin, generatedAt, files[] }`, donde cada archivo contiene `{ path, language, content }`.

### `analyze_html`

Analiza HTML en bruto: metadatos, headings, enlaces, imágenes, JSON-LD, Open Graph, Twitter Cards, hreflang y mixed content.

Parámetros:

- `html` obligatorio: código fuente HTML
- `url` obligatorio: URL de la página para resolver enlaces relativos
