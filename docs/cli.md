# Referencia del CLI

El CLI es la capa mínima que usan la skill y los scripts. Se ejecuta desde la raíz del repo con Node 20+.

```powershell
node src/cli.js [comando] <carpeta|url> [flags]
```

Si no se indica comando, se ejecuta `source`.

## Comandos

### `source` (por defecto)

Audita el código fuente local de un sitio — una carpeta con HTML — sin acceso a red. Los hallazgos referencian archivos reales del proyecto.

```powershell
node src/cli.js source ./dist --base https://tudominio.com
node src/cli.js ./public                # source implicito
node src/cli.js source . --prompt
node src/cli.js source ./dist --json
```

| Flag | Descripción |
| --- | --- |
| `--base <url>` | URL del sitio para resolver enlaces absolutos internos (por defecto `https://example.com`) |
| `--limit <n>` | Máximo de archivos HTML a analizar (por defecto 200) |
| `--prompt` | Imprime un prompt de arreglo con las rutas de archivo a editar |
| `--json` | Imprime el resultado completo como JSON |

Revisa por página: title, description, H1, lang, viewport, canonical, noindex, alt de imágenes, thin content y mixed content. Por proyecto: robots.txt, sitemap.xml, páginas legales, contacto, duplicados entre páginas y enlaces internos que apuntan a archivos inexistentes.

### `kit`

Genera el kit de archivos SEO para una URL, sin red. Devuelve el kit como JSON; con `--save` lo escribe a disco.

```powershell
node src/cli.js kit tudominio.com --save
node src/cli.js kit tudominio.com --description "Tienda de cerámica" --lang es --save
```

| Flag | Descripción |
| --- | --- |
| `--save` | Escribe los archivos generados a disco |
| `--out <dir>` | Carpeta de salida (por defecto `generated/<sitio>`) |
| `--name <nombre>` | Nombre del sitio |
| `--description <texto>` | Descripción corta |
| `--businessName <nombre>` | Nombre legal para las plantillas |
| `--lang <código>` | Idioma para los datos estructurados de WebSite |
| `--urls <lista>` | URLs conocidas (separadas por comas) para el sitemap |

## Flags generales

| Flag | Descripción |
| --- | --- |
| `--help`, `-h` | Ayuda completa |
| `--version` | Versión |

Los flags booleanos (`--save`, `--json`, `--prompt`) nunca consumen el siguiente argumento. El informe va por `stdout` y los avisos por `stderr`; el código de salida es `1` si falta el objetivo o la auditoría falla.
