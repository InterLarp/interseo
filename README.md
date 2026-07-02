# interseo

CLI + MCP + skill para auditar SEO tecnico, DNS, rastreo, indexacion y preparacion para Google Search Console.

## Uso rapido

Solo dominio. El nombre se infiere desde el crawl, metadatos, title, H1 o dominio:

```powershell
node src/cli.js tudominio.com
```

Guardar kit generado:

```powershell
node src/cli.js tudominio.com --save
```

Rastreo mas amplio:

```powershell
node src/cli.js tudominio.com --deep
node src/cli.js tudominio.com --full
```

Generar un prompt para arreglar los problemas detectados:

```powershell
node src/cli.js tudominio.com --prompt
node src/cli.js tudominio.com --prompt=mcp
node src/cli.js prompt tudominio.com
```

Generar kit sin auditoria:

```powershell
node src/cli.js kit tudominio.com --save
```

El email legal se deriva solo como `contacto@dominio`.

## MCP

```powershell
npm.cmd run mcp
```

Config de ejemplo:

```json
{
  "mcpServers": {
    "interseo": {
      "command": "node",
      "args": ["C:\\Users\\sigma\\Desktop\\seomax\\src\\mcp.js"]
    }
  }
}
```

Herramientas MCP:

- `audit_site`: auditoria con DNS, crawler, score, reportes, prompts y kit.
- `generate_seo_kit`: genera archivos sin rastrear.
- `generate_fix_prompt`: genera un prompt listo para arreglar SEO con `$interseo`, MCP o cambios directos.
- `analyze_html`: analiza HTML bruto.
- `build_report`: crea Markdown y CSV desde un audit JSON.

## Skill Codex

La skill versionada esta en `skills/interseo`.

Instalacion local:

```powershell
npm.cmd run skill:install
```

## Que revisa

- DNS: A/AAAA, latencia de resolucion, IPv6, nameservers, SPF y DMARC.
- Home accesible, HTTPS, redirects, tiempo de respuesta, `robots.txt`, bloqueo global y sitemap.
- `title`, meta description, canonical, viewport, idioma, H1, enlaces internos e imagenes sin `alt`.
- `noindex`, `X-Robots-Tag`, JSON-LD, Open Graph, Twitter Cards, hreflang, favicon y mixed content.
- Politica de privacidad, cookies, aviso legal o terminos, contacto o sobre nosotros.
- Crawler interno con errores HTTP, duplicados, thin content y enlaces rotos.
- Preparacion minima para Search Console.

## Que genera

- `robots.txt`
- `sitemap.xml`
- `seo-head-snippet.html`
- `structured-data.jsonld`
- `google-search-console-checklist.md`
- `llms.txt`
- `humans.txt`
- `.well-known/security.txt`
- `google-site-verification.html`
- `interseo.mcp.json`
- Plantillas en `legal/`
- Reportes en `reports/`
- Prompts de arreglo en `prompts/`

Las plantillas legales son orientativas. Deben revisarse con datos reales y criterio legal antes de publicarlas.

## Pruebas

```powershell
npm.cmd test
```