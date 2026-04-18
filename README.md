# SSTVdecoder

Decodificador SSTV web (Martin M1) pensado para publicarse en GitHub Pages.

## Uso

1. Abre el sitio web.
2. Selecciona un archivo de audio SSTV (idealmente WAV PCM 44.1 kHz / 16-bit).
3. Pulsa **Escuchar** para iniciar reproducción + decodificación.
4. Observa el progreso de renderizado de la imagen en el canvas.
5. Pulsa **Descargar imagen** cuando termine.

## Deploy automático en GitHub Pages

El flujo de trabajo `.github/workflows/pages.yml` despliega automáticamente el sitio cuando hay cambios en `main`.
