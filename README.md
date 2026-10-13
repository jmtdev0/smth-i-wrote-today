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
- Mando estándar / DualShock 4: stick izquierdo o cruceta para volar, stick derecho para girar la cámara, L2 para descender y R2 para ascender.
- Mantener R3 (clic del stick derecho) + stick izquierdo arriba/abajo: acercar/alejar la cámara suavemente, dentro de los mismos límites que la rueda. Mientras se mantiene R3, el stick izquierdo no mueve la mariposa; al soltarlo vuelve a controlar el vuelo. La cruceta, los gatillos y el giro de cámara siguen disponibles.
- Esc / Options: abrir o cerrar los ajustes de sensibilidad de cámara, volumen de música, volumen de efectos (chirp) y opacidad del vídeo del cielo. El volumen de efectos va del 0 al 100 %, se guarda y controla tanto la llamada como su respuesta, sin alterar la música ni los efectos visuales. No hay icono permanente; abrir el panel cancela los controles de vuelo y cualquier chirp que estuviera cargándose.
- Rueda o pellizco: distancia de cámara.
- En primera persona se apagan el halo y la luz local del usuario; se atenúan durante el zoom y se recuperan al volver a tercera persona dentro del túnel. Las luces de las compañeras no cambian y en Heaven la luz propia sigue apagada.
- Acercar el zoom al máximo (rueda, pellizco o R3 + stick): transición gradual, más suave al acercarse a primera persona, ocultando la mariposa al llegar a ella. Alejarlo devuelve la tercera persona. El doble toque de R3 cambia de vista con un corte inmediato en la segunda pulsación y recupera la distancia anterior al volver a tercera persona. El gesto tolera pequeños movimientos involuntarios del stick; mantener R3 para hacer zoom no cuenta como doble toque. La orientación del vuelo y las colisiones se mantienen en ambas vistas.
- Mantener E / círculo y soltar: chirp que recluta a las mariposas cercanas, incluidas las de colores de Heaven una vez terminada la transición. Las NPC conservan sus colores, tanto las nuevas como las que ya formaban parte de la grupeta; el usuario sigue pudiendo recibir el color de la respuesta. En móvil, doble toque breve para una llamada básica de reclutamiento.
- Mantener Q / cuadrado y soltar: chirp de saludo; conserva la respuesta de color, el impulso y los efectos. En Heaven no añade mariposas a la grupeta. Ambos chirps alcanzan su potencia máxima tras 1,2 s y comparten el cooldown.
- F / triángulo: disolver el grupo en Heaven, sin botón permanente en pantalla. Las liberadas conservan su color y su posición, vuelan por su cuenta y pueden volver a reclutarse con E / círculo.
- R / X (cruz) del DualShock: emitir un chirp inmediato y recuperar el blanco original de la mariposa, sin absorber otro color en esa llamada ni reiniciar la posición, la cámara o la grupeta. En Heaven no recluta. Las compañeras conservan sus colores; mantener el botón no repite la llamada.
- Dentro del túnel, incluido el limbo antes de cruzar la salida, todos los tipos de chirp rescatan y añaden a la grupeta a las mariposas alcanzadas. El alcance según la carga y el cooldown siguen aplicándose. Al salir se recuperan las modalidades de Heaven, aunque el túnel todavía esté desvaneciéndose.
- P: detener el flujo y el vuelo. Con movimiento reducido del sistema comienza pausada.

## Construcción

`src/TunnelWorld.js` construye un cilindro de radio 46 y longitud 1080, orientado sobre el eje Z. El jugador comienza en Z=873 y la salida está en Z=−180. La iluminación de la pared se atenúa desde la abertura; el jugador y las compañeras conectadas aportan pequeños halos y luces locales. La niebla permite atravesar el umbral gradualmente y el túnel se desvanece al entrar en Heaven. La cámara y el jugador comparten límites cilíndricos.

`src/ButterflyParadise.js` dibuja una pradera que se extiende alrededor del jugador y un enjambre de 1400 mariposas de siete colores. La hierba combina distintas distancias de detalle, viento suave y una reacción localizada al aleteo del jugador. La cámara respeta el suelo. Las mariposas usan geometrías instanciadas compartidas, aleteos desfasados y pequeñas coreografías. En Heaven responden al chirp compartiendo su color con el jugador: E / círculo las recluta sin cambiar el color de las NPC, mientras Q / cuadrado saluda y comparte el color con las compañeras sin reclutar. Las nuevas compañeras conservan las mismas instancias y sombras; reclutar no crea modelos ni luces adicionales. Los puestos de vuelo se comparten con las rescatadas del túnel. Liberarlas traslada sus órbitas a la posición actual, sin saltar a su lugar de origen. Las rescatadas liberadas permanecen visibles en Heaven y no vuelven al túnel.

La hierba exterior se prepara al acercarse al limbo: entre 60 y 14 unidades antes de la boca del túnel aparecen progresivamente su volumen, cobertura y color. Ya está completa al entrar en la niebla y no reinicia su aparición al salir a Heaven. Mientras existe el túnel, las briznas se limitan al terreno exterior; esto no adelanta el cambio de controles, reclutamiento ni colisiones. Empezar directamente en Heaven también muestra la hierba completa desde el primer fotograma.

`src/HeavenClouds.js` dibuja nubes volumétricas: recorre un campo de densidad tridimensional, integra la luz solar y proyecta sombras de ese mismo volumen sobre la pradera. Se calcula a resolución reducida, con 36–128 pasos según la longitud del recorrido (24–96 si detecta lentitud sostenida). El detalle se filtra según la distancia y el tamaño del píxel, sin desplazamientos aleatorios por píxel, y la reconstrucción suaviza exclusivamente la capa de nubes para reducir el granulado en el horizonte. Conserva los claros de cielo azul sin añadir niebla a Heaven. La sombra de las nubes se actualiza a unos 8 Hz; su movimiento comparte el reloj de pausa de la escena.

`src/HeavenLighting.js` usa la misma dirección solar para iluminar el terreno y proyectar sombras cercanas de las briznas, el jugador y sus compañeras. El mapa local de 2048 px acompaña al jugador y cubre un radio visible de 56 unidades, con desvanecido entre 44 y 56; las sombras de hierba se limitan a 12 unidades y reproducen su deformación por viento y aleteo. La mariposa conserva su material luminoso y sus alas al 90 % de opacidad. El paso de sombras se suspende dentro del túnel.

Las NPC de Heaven también proyectan sus alas y cuerpo sobre la pradera al volar bajo. `src/HeavenButterflyShadows.js` reutiliza sus transformaciones de aleteo y reúne solo las siluetas cercanas en cinco lotes instanciados; no vuelve a dibujar el enjambre completo en el mapa de sombras. La sombra se atenúa entre 12 y 36 unidades sobre el terreno y desaparece fuera de la zona local. La selección incluye las NPC más alejadas cuya sombra entra en esa zona por la inclinación del sol.

El vídeo se superpone a las nubes con bordes difuminados y un fundido al repetir el bucle, sincronizado con la música ralentizada. La imagen ocasional del cielo aparece y desaparece suavemente. Estos efectos audiovisuales requieren los recursos locales indicados arriba. Para comprobar nubes, sombras, pausa, viajes largos y fluidez por separado: `/tests/heaven-glowup-render.html` en el servidor de desarrollo. Sus controles son solo de prueba y no aparecen en la web normal.

Doce mariposas rescatables recorren pequeñas órbitas repartidas por el túnel. La llamada tiene un alcance de 12 a 30 unidades según cuánto se cargue; las alcanzadas se vuelven blancas, comienzan a emitir luz y siguen al jugador. La transición es gradual y el vínculo permanece al salir al jardín. Jugador y compañeras reciben un impulso de hasta ×1,6 durante 4 segundos. El pulso puede repetirse cada 0,2 segundos para renovarlo sin acumular multiplicadores. Una llamada sin respuesta no acelera el vuelo.

La velocidad base es de 5 unidades/s, hasta 8 durante el impulso. La pausa congela el agua, la niebla, el enjambre y las llamadas. En desarrollo también se pueden revisar las transiciones con `?preview=mist` y `?preview=paradise`; para accesos públicos se utiliza `?start=…`.

`Waterfall.js` y `PortraitPass.js` conservan los componentes de la escena anterior, pero no se montan en este recorrido. El retrato no se superpone al túnel oscuro al girar la cámara.

## Publicación y recursos

No se incluyen dependencias instaladas, compilaciones, configuraciones locales, credenciales ni archivos `.env`. Los medios de `public/` permanecen locales. El repositorio no concede derechos sobre la canción, el vídeo o las imágenes de referencia. No se ha añadido una licencia de código abierto; hacer público el código no implica conceder automáticamente una licencia de reutilización.
