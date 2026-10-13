# Recursos multimedia

El repositorio conserva el código, las pruebas y la documentación; los archivos
binarios no se publican en GitHub. La música y el vídeo de la escena se sirven
desde el bucket público R2 `youchosethis-media` en
`https://youchosethis-media.sarda0x.com`. Netlify define la variable de
producción `VITE_MEDIA_BASE_URL` con ese origen.

| Archivo local | Clave R2 | Función |
| --- | --- | --- |
| `emelie trahan - you chose this.mp3` | `music/you-chose-this.mp3` | Música en bucle y reloj de sincronización del vídeo. |
| `heaven-sky.mp4` | `video/heaven-sky.mp4` | Vídeo tenue sobre el cielo de Heaven. |

`recordings/`, las imágenes originales y `portrait.png` no se suben al
repositorio ni a R2. Por eso, la aparición ocasional del cielo se conserva en
el modo local, pero se omite en la versión pública. `favicon.png` solo se usa
localmente.

Para ejecutar la experiencia audiovisual completa en local, coloca los medios
con los nombres indicados en `public/`. La compilación y las pruebas unitarias
no necesitan esos archivos. La calibración de música y vídeo está descrita en
[heaven-sky-source.md](./heaven-sky-source.md); si cambias los medios, revisa
también su sincronización.
