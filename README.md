# interseo

App local interseo para auditar SEO tecnico y preparar los archivos base que suelen hacer falta antes de enviar un sitio a Google Search Console.

## Uso

```powershell
npm.cmd start
```

Abre `http://localhost:4173`, introduce la URL y ejecuta la auditoria.

Tambien puedes usarlo por CLI:

```powershell
npm.cmd run audit -- https://tudominio.com "Nombre del sitio"
```

## Que revisa

- Home accesible, HTTPS, `robots.txt`, bloqueo global y sitemap.
- `title`, meta description, canonical, viewport, idioma, H1, enlaces internos e imagenes sin `alt`.
- `noindex`, JSON-LD, Open Graph, favicon y contenido textual.
- Politica de privacidad, cookies, aviso legal o terminos, contacto o sobre nosotros.
- Preparacion minima para Search Console.

## Que genera

Al guardar el kit crea una carpeta dentro de `generated/` con:

- `robots.txt`
- `sitemap.xml`
- `seo-head-snippet.html`
- `structured-data.jsonld`
- `google-search-console-checklist.md`
- Plantillas en `legal/`

Las plantillas legales son orientativas. Deben revisarse con datos reales y criterio legal antes de publicarlas.

## Pruebas

```powershell
npm.cmd test
```

## Fuentes de criterio

- Google Search Central: sitemaps.
- Google Search Central: robots.txt.
- Google Search Central: SEO Starter Guide.
- Search Console Help: informe Sitemaps.
