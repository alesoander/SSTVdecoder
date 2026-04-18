# SSTVdecoder

Decodificador SSTV web (Martin M1 y Scottie1) pensado para publicarse en GitHub Pages.

## Uso

1. Abre el sitio web.
2. Selecciona un archivo de audio SSTV (WAV PCM 16-bit; se recomienda 44.1 kHz, aunque el decoder también soporta otros sample rates como 96 kHz).
3. Elige el modo SSTV en el selector (**Martin M1** o **Scottie1**).
4. Pulsa **Escuchar** para iniciar reproducción + decodificación.
5. Observa el progreso de renderizado de la imagen en el canvas.
6. Pulsa **Descargar imagen** cuando termine.

## Deploy automático en GitHub Pages

El flujo de trabajo `.github/workflows/pages.yml` despliega automáticamente el sitio cuando hay cambios en `main`.
