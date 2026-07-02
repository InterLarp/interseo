---
name: interseo
description: Use this skill to audit and fix the SEO of a website's source code without network access, generate Google-ready SEO files, and guide an agent to apply the changes directly in the repository.
---

# interseo

interseo audita el **código fuente** de un sitio web sin tocar la red. La ruta normal es clara: usar la skill, detectar lo que falla, corregir los archivos y validar otra vez. También genera los activos SEO que suelen faltar, como robots.txt, sitemap.xml, JSON-LD y plantillas legales.

## Cómo trabajar con la skill

- Pide a la IA que use `interseo` para analizar el sitio y aplicar los arreglos necesarios.
- Si ya tienes el HTML final, trabaja sobre esa carpeta (`dist/`, `public/`, `build/` o la raíz del proyecto).
- Si quieres automatizarlo desde otro agente, usa el runner de la skill o conecta el MCP.

## Inicio rápido

Desde la carpeta de la skill:

```powershell
node scripts/run_interseo.mjs source <dir> --base <site-url>
node scripts/run_interseo.mjs source <dir> --prompt
node scripts/run_interseo.mjs kit <site-url> --save
```

Si no existe una instalación previa, el runner busca `INTERSEO_HOME`, la estructura del repo o clona el motor en `~/.interseo/repo`.

## MCP

Punto de conexión del cliente:

```json
{
  "mcpServers": {
    "interseo": {
      "command": "node",
      "args": ["<path-to-interseo-repo>/src/mcp.js"]
    }
  }
}
```

Herramientas:

- `audit_source` para auditar una carpeta con HTML
- `generate_seo_kit` para generar robots, sitemap, JSON-LD y legales
- `analyze_html` para inspeccionar HTML en bruto

## Qué devuelve

- hallazgos con rutas de archivo reales
- prioridad de arreglos
- score y grade
- prompt de corrección con los archivos concretos a editar

## Interpretación

- `priority` ordena los problemas de mayor impacto a menor impacto
- `brokenLinks` muestra el archivo de origen del enlace roto
- `orphanPages` ayuda a ver qué páginas quedaron desconectadas
- `pages` resume los metadatos y carencias de cada archivo

## Buen criterio

- Corrige primero lo que bloquea rastreo, indexación o navegación.
- No inventes contenido legal; usa las plantillas como base y completa los datos reales.
- Si necesitas comprobaciones en vivo, como DNS o Search Console, hazlas después de publicar.
