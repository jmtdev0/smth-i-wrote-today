# Smth I Wrote Today

Escena independiente de Three.js: una mariposa blanca atraviesa un túnel acuoso y oscuro hasta una salida envuelta en niebla. Al otro lado espera Heaven: una pradera ondulada de hierba animada, un cielo azul con nubes suaves y 1400 mariposas de colores. El avatar conserva las curvas y nervaduras de Belmont Girl, alas con un 90 % de opacidad y una animación de llamada cargada.

El repositorio público contiene código, pruebas y documentación. Los recursos de música, vídeo e imágenes se mantienen fuera de Git: consulta [los recursos locales](./public/README.md) para completar la experiencia audiovisual sin redistribuir material de terceros.

## Ejecutar

Con Node.js y npm instalados: `npm ci`, después `npm run dev -- --host 127.0.0.1 --port 5193`.
Compilación: `npm run build`. Pruebas: `node --test tests/*.test.mjs`.

Abre `http://127.0.0.1:5193/`. El parámetro `?start=underworld`, `?start=limbo` o `?start=heaven` permite elegir el punto de inicio, tanto en desarrollo como en producción.

## Controles

- Arrastrar: girar la cámara 360°. Flechas izquierda/derecha: alternativa de teclado.
- W / S: avanzar / retroceder siguiendo la mirada de la cámara, incluida su inclinación vertical.
- A / D: desplazarse lateralmente respecto a la cámara. Combinar teclas no aumenta la velocidad máxima.
- Espacio / Alt: ascender / descender; la pared y el fondo del túnel detienen el avance y permiten deslizarse.
- Mando estándar / DualShock 4: stick izquierdo o cruceta para volar, stick derecho para girar la cámara, L2 para descender, R2 para ascender y círculo para llamar a las mariposas cercanas.
- Icono de ajustes: cambiar la sensibilidad de cámara (arrastre, flechas y stick derecho), el volumen de música y la opacidad del vídeo del cielo.
- Rueda o pellizco: distancia de cámara.
- Mantener E o círculo y soltar: cargar y emitir una llamada; alcanza la potencia máxima tras 1,2 s. En móvil, doble toque breve para una llamada básica.
- R: recuperar la cámara y la posición inicial al fondo del túnel; reiniciar los vínculos con las compañeras.
- P: detener el flujo y el vuelo. Con movimiento reducido del sistema comienza pausada.

## Construcción

`src/TunnelWorld.js` construye un cilindro de radio 46 y longitud 1080, orientado sobre el eje Z. El jugador comienza en Z=873 y la salida está en Z=−180. La iluminación de la pared se atenúa desde la abertura; el jugador y las compañeras conectadas aportan pequeños halos y luces locales. La niebla permite atravesar el umbral gradualmente y el túnel se desvanece al entrar en Heaven. La cámara y el jugador comparten límites cilíndricos.

`src/ButterflyParadise.js` dibuja una pradera que se extiende alrededor del jugador y un enjambre de 1400 mariposas de siete colores. La hierba combina distintas distancias de detalle, viento suave y una reacción localizada al aleteo del jugador. La cámara respeta el suelo. Las mariposas usan geometrías instanciadas compartidas, aleteos desfasados y pequeñas coreografías. En Heaven responden al chirp compartiendo su color con el jugador y sus compañeras, sin unirse al grupo.

`src/HeavenClouds.js` añade nubes procedurales suaves al cielo azul. El vídeo se superpone con bordes difuminados y un fundido al repetir el bucle, sincronizado con la música ralentizada. La imagen ocasional del cielo aparece y desaparece suavemente. Estos efectos audiovisuales requieren los recursos locales indicados arriba. Las nubes volumétricas y las sombras realistas son una mejora propuesta, no una función implementada en esta versión.

Doce mariposas rescatables recorren pequeñas órbitas repartidas por el túnel. La llamada tiene un alcance de 12 a 30 unidades según cuánto se cargue; las alcanzadas se vuelven blancas, comienzan a emitir luz y siguen al jugador. La transición es gradual y el vínculo permanece al salir al jardín. Jugador y compañeras reciben un impulso de hasta ×1,6 durante 4 segundos. El pulso puede repetirse cada 0,2 segundos para renovarlo sin acumular multiplicadores. Una llamada sin respuesta no acelera el vuelo.

La velocidad base es de 5 unidades/s, hasta 8 durante el impulso. La pausa congela el agua, la niebla, el enjambre y las llamadas. En desarrollo también se pueden revisar las transiciones con `?preview=mist` y `?preview=paradise`; para accesos públicos se utiliza `?start=…`.

`Waterfall.js` y `PortraitPass.js` conservan los componentes de la escena anterior, pero no se montan en este recorrido. El retrato no se superpone al túnel oscuro al girar la cámara.

## Publicación y recursos

No se incluyen dependencias instaladas, compilaciones, configuraciones locales, credenciales ni archivos `.env`. Los medios de `public/` permanecen locales. El repositorio no concede derechos sobre la canción, el vídeo o las imágenes de referencia. No se ha añadido una licencia de código abierto; hacer público el código no implica conceder automáticamente una licencia de reutilización.
