# Recursos multimedia locales

Este repositorio publica únicamente código, pruebas y documentación. La música,
el vídeo y las imágenes originales no se incluyen ni se concede una licencia
para redistribuirlos. Los archivos existentes en tu equipo no se eliminan.

La carpeta `public/` excluye de Git todos los recursos salvo sus documentos Markdown.
No uses `git add -f` para subir los medios sin revisar antes sus permisos de publicación.

## Recursos que utiliza la escena

| Archivo local | Función |
| --- | --- |
| `emelie trahan - you chose this.mp3` | Música en bucle; reloj de sincronización del vídeo. |
| `heaven-sky.mp4` | Vídeo tenue sobre el cielo de Heaven. |
| `1dad95b9-3fb0-4e1a-9c5a-662cc640537c_1758672000.jpeg` | Aparición ocasional en el cielo. |
| `favicon.png` | Icono de la página. |
| `portrait.png` | Referencia de los componentes de la escena anterior. |

Para reproducir la experiencia audiovisual completa en una copia nueva, coloca
recursos que tengas permiso para utilizar con estos nombres o adapta sus rutas
en el código. La compilación y las pruebas unitarias no necesitan esos archivos;
las comprobaciones visuales de audio, vídeo e imágenes sí dependen de ellos.
Sin los medios, la escena 3D puede ejecutarse, pero no ofrecerá esas capas
audiovisuales y el navegador puede registrar respuestas 404.

La calibración de música y vídeo está descrita en [heaven-sky-source.md](./heaven-sky-source.md).
Si cambias los medios, revisa también su sincronización.
