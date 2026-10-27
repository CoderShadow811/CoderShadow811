# Casino Local Audit

Extension de Chrome para **auditar tu propio juego local**. No hace trampa ni
modifica nada: solo observa el trafico entre tu juego (navegador) y tu servidor,
y te avisa si el servidor le manda al cliente datos del resultado **antes** de
que tu decidas. Esa es la prueba de que tu sistema NO filtra la solucion.

Todo corre dentro de tu navegador. No envia nada a ningun sitio externo.

## Que revisa

- **HTTP** (fetch y XMLHttpRequest) y **WebSocket**, los dos.
- Cada mensaje queda registrado en orden, con su direccion (⬆ tu→servidor /
  ⬇ servidor→tu).
- Marca en **rojo** cualquier respuesta del servidor que contenga campos del
  resultado (`traps`, `crashPoint`, `result`, `serverSeed`, etc.).
- Veredicto arriba: ✅ si ninguna respuesta filtro el resultado, ⚠️ si alguna lo hizo.

## Como se usa

1. Abre `chrome://extensions`.
2. Activa **Modo de desarrollador** (arriba a la derecha).
3. **Cargar descomprimida** → selecciona esta carpeta `casino-audit-extension`.
4. Abre tu juego en `http://localhost:PUERTO` (o `127.0.0.1`).
5. Aparece el panel flotante arriba a la derecha. Juega rondas completas
   (iniciar, avanzar, perder, cobrar) para cubrir todos los mensajes.

### Si tu juego no corre en localhost

Edita `manifest.json` y añade tu URL en los dos bloques `matches`. Por ejemplo,
si abres el juego como archivo o en otro host:

```json
"matches": ["http://localhost/*", "http://127.0.0.1/*", "http://192.168.1.50/*"]
```

Luego pulsa **Recargar** en la tarjeta de la extension.

## Ajustar que se considera "fuga"

En el panel hay una barra de **campos sospechosos**. Añade los nombres reales
que use tu servidor (por ejemplo, si tu campo de trampas se llama `hazards` o
`casillasMalas`, agregalo). La lista se guarda sola.

## Como leer el resultado

- **Bien hecho:** cuando inicias una ronda, la respuesta del servidor NO trae
  las trampas ni el punto de explosion. Solo llegan cuando ya diste el paso.
  El veredicto queda en ✅.
- **Mal hecho (fuga):** la respuesta de "iniciar ronda" ya trae la solucion
  completa. Fila en rojo y veredicto ⚠️. Significa que el cliente podria leer
  el resultado de antemano: hay que mover esa logica al servidor y dejar de
  mandar esos campos.

### Provably fair

Si usas sistema comprobable: al iniciar la ronda solo debe llegar el **hash**.
La **semilla del servidor** (`serverSeed`) solo debe aparecer al terminar la
ronda. Si `serverSeed` sale al inicio, el panel lo marca como fuga.

## Limites

- Esto comprueba **fugas de datos al cliente**. No comprueba validacion de
  saldo, apuestas negativas, cobros duplicados ni calidad del generador
  aleatorio; eso se revisa en el codigo del servidor.
- Si el trafico es **binario** (WebSocket binario), el panel lo marca como
  `[binario]` y no puede inspeccionarlo. Para auditar, usa JSON en texto.
