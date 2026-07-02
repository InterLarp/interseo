# Referencia del CLI

El CLI es la interfaz mínima de interseo. Se ejecuta desde la raíz del repo con Node 20 o superior.

```powershell
node src/cli.js [comando] <carpeta|url> [flags]
```

Si no indicas comando, se ejecuta `source`.

## Comandos

### `source`

Audita una carpeta local con HTML y devuelve un informe orientado a SEO técnico. El análisis no usa red.

```powershell
node src/cli.js source ./dist --base https://tudominio.com
node src/cli.js ./public
node src/cli.js source . --prompt
node src/cli.js source ./dist --json
```

Flags:

- `--base <url>`: base para resolver enlaces internos absolutos
- `--limit <n>`: máximo de archivos HTML a analizar, por defecto 200
- `--prompt`: imprime un prompt con los archivos y problemas prioritarios
- `--json`: imprime el resultado completo como JSON

El informe incluye title, description, H1, `lang`, viewport, canonical, noindex, imágenes sin alt, contenido delgado y mixed content. A nivel de proyecto revisa robots.txt, sitemap.xml, páginas legales, contacto, duplicados, páginas huérfanas y enlaces rotos.

### `kit`

Genera el kit SEO para una URL. Devuelve el kit como JSON y, si usas `--save`, lo escribe a disco.

```powershell
node src/cli.js kit tudominio.com --save
node src/cli.js kit tudominio.com --description "Tienda de cerámica" --lang es --save
```

Flags:

- `--save`: guarda los archivos generados
- `--out <dir>`: carpeta de salida, por defecto `generated/<sitio>`
- `--name <nombre>`: nombre del sitio
- `--description <texto>`: descripción corta
- `--businessName <nombre>`: nombre legal para las plantillas
- `--lang <código>`: idioma para los datos estructurados
- `--urls <lista>`: URLs conocidas separadas por comas para el sitemap

## Flags generales

- `--help`, `-h`: muestra esta ayuda
- `--version`: muestra la versión

Los flags booleanos no consumen el siguiente argumento. El informe va por `stdout`, los errores por `stderr` y el código de salida es `1` si falta el objetivo o la auditoría falla.
