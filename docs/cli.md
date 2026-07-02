# Referencia del CLI

Todos los comandos se ejecutan desde la raíz del repo con Node 20+.

```powershell
node src/cli.js [comando] <dominio> [nombre del sitio] [flags]
```

Si no se indica comando, se ejecuta `audit`. El dominio acepta con o sin protocolo (`tudominio.com` se normaliza a `https://tudominio.com`). El nombre del sitio es opcional: si no se pasa, se infiere del crawl.

## Comandos

### `audit` (por defecto)

Audita el dominio y muestra el informe en Markdown por consola.

```powershell
node src/cli.js tudominio.com
node src/cli.js tudominio.com --save
node src/cli.js tudominio.com --json
```

### `prompt`

Audita y devuelve solo el prompt de arreglo, listo para pegar en un agente.

```powershell
node src/cli.js prompt tudominio.com
node src/cli.js tudominio.com --prompt          # equivalente, estilo skill
node src/cli.js tudominio.com --prompt=mcp      # usa las tools MCP
node src/cli.js tudominio.com --prompt=direct   # edición directa del repo
```

Se puede combinar con `--save`: guarda el kit y después imprime el prompt.

### `kit`

Genera el kit de archivos sin rastrear el sitio. Devuelve el kit como JSON; con `--save` lo escribe a disco.

```powershell
node src/cli.js kit tudominio.com --save
node src/cli.js kit tudominio.com --description "Tienda de cerámica" --save
node src/cli.js kit tudominio.com --urls "https://tudominio.com/,https://tudominio.com/contacto"
```

### `source`

Audita el código fuente local de un sitio (una carpeta con HTML) sin acceso a red. Los hallazgos referencian archivos reales del proyecto.

```powershell
node src/cli.js source ./dist --base https://tudominio.com
node src/cli.js source ./public --json
node src/cli.js source . --prompt
```

- `--base <url>` define la URL del sitio para resolver enlaces absolutos internos (por defecto `https://example.com`).
- `--limit <n>` limita los archivos HTML analizados (por defecto 200).
- `--prompt` imprime un prompt de arreglo con las rutas de archivo a editar; `--json` devuelve el resultado completo.

Revisa por página (title, description, H1, lang, viewport, canonical, noindex, alt, thin content) y por proyecto (robots.txt, sitemap.xml, páginas legales, mixed content y enlaces internos rotos comprobados contra los archivos existentes).

### `report`

Audita y muestra solo el informe Markdown (sin guardar nada). Acepta `--deep`, `--full` y `--limit` igual que `audit`.

```powershell
node src/cli.js report tudominio.com --full
```

## Flags

| Flag | Comandos | Descripción |
| --- | --- | --- |
| `--save` | audit, kit | Escribe el kit generado a disco |
| `--out <dir>` | audit, kit | Carpeta de salida (por defecto `generated/<sitio>`) |
| `--deep` | audit, prompt | Crawl de hasta 12 páginas y 24 probes de enlaces |
| `--full` | audit, prompt | Crawl de hasta 20 páginas y 40 probes de enlaces |
| `--limit <n>` | audit, report | Límite de páginas a rastrear (por defecto 5) |
| `--linkProbeLimit <n>` | audit | Límite de URLs internas a comprobar como enlaces rotos |
| `--prompt[=skill\|mcp\|direct]` | audit | Imprime el prompt de arreglo en lugar del informe |
| `--json` | audit | Imprime el resultado completo de la auditoría como JSON |
| `--name <nombre>` | todos | Fuerza el nombre del sitio en lugar de inferirlo |
| `--description <texto>` | kit | Descripción corta del sitio para los archivos generados |
| `--businessName <nombre>` | kit | Nombre legal del negocio para las plantillas |
| `--urls <lista>` | kit | URLs conocidas (separadas por comas) para el sitemap |
| `--help`, `-h` | — | Muestra la ayuda completa |
| `--version` | — | Muestra la versión |

Los flags booleanos (`--save`, `--deep`, `--full`, `--json`, `--prompt`) nunca consumen el siguiente argumento, así que `node src/cli.js --save tudominio.com` también funciona.

## Salida

- El informe va por `stdout`; los avisos (como la ruta donde se guardó el kit) van por `stderr`, así que puedes redirigir el informe a un archivo sin ruido:

```powershell
node src/cli.js tudominio.com --save > informe.md
```

- El código de salida es `1` si falta el dominio o la auditoría falla.
