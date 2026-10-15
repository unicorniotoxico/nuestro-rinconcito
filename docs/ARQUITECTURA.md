# Arquitectura

```
 Celular A (PWA)                 Servidor (Node.js)                    Guardado
 ┌────────────────┐   WebSocket  ┌──────────────────────────────┐    ┌───────────────────┐
 │ Canvas + UI    │◀────────────▶│ Hub: islas en memoria,       │───▶│ archivos JSON     │
 │ predice SU     │   JSON       │ llaves, códigos, conexiones  │    │ (atómicos + .bak) │
 │ movimiento     │              │                              │    │        o          │
 └────────────────┘              │ Island: reglas y validación  │    │ Supabase (REST)   │
 Celular B (PWA)                 │  · acciones de a una         │    └───────────────────┘
 ┌────────────────┐              │  · tick 20 Hz: criaturas,    │
 │ igual que A    │◀────────────▶│    carpincho                 │
 └────────────────┘              │  · tick 1 Hz: cultivos,      │
                                 │    reapariciones, desafíos   │
                                 └──────────────────────────────┘
```

## El servidor es la autoridad

- El cliente **propone** acciones (`gather`, `plant`, `craft`, `mail_send`, `fish_end`, `attack`, …) y el servidor las **valida y aplica**: distancia real al objetivo, herramienta necesaria, inventario suficiente, reglas del lugar (huerta, piso de la casa, buzón) y del desafío en curso.
- Inventarios, recompensas, cosechas, muebles, proyectos, cartas y desafíos solo cambian en el servidor; el cliente recibe el resultado.
- El **movimiento** se predice en el celular para que se sienta inmediato, pero el servidor revisa cada paso: velocidad máxima y colisiones con el mismo código del cliente (`shared/maps.js`). Si algo no cierra, manda una corrección.

## Sincronización y acciones simultáneas

- Node procesa los mensajes **de a uno** (un solo hilo): si los dos golpean el mismo árbol o juntan la misma flor "al mismo tiempo", uno llega primero y el segundo recibe "ya no queda nada". No hay forma de que el objeto se entregue dos veces (hay una prueba que lo verifica).
- Cada acción viaja con un **id único**. Si un mensaje se reenvía (por ejemplo, por una reconexión), el servidor devuelve la misma respuesta **sin repetir el efecto**.
- La pesca no confía en "gané": el servidor manda la rareza y una **semilla**; el celular registra cuándo tocaste y el servidor **recalcula** el resultado con la misma fórmula (`shared/fishing.js`), además de verificar que haya pasado el tiempo real. Cada pique se cobra una sola vez.
- Los desafíos son una máquina de estados (`propuesto → cuenta regresiva → en curso → terminado`). Los premios se entregan en la transición a "terminado", marcada como pagada antes de repartir, y se guarda en el momento: aunque alguien se desconecte o el servidor reinicie, se paga exactamente una vez.
- Lo que es de cada uno no se puede tocar en competencia: cada persona abre **su propio** cofre, durante la "cosecha relámpago" cada uno cosecha lo que plantó, los muebles guardados vuelven a la mochila de **quien los puso**, y las herramientas no se pueden regalar.

## Identidad y acceso

- Al crear o unirse, el servidor entrega una **llave personal** aleatoria de 256 bits. El celular la guarda (es lo único que guarda; el mundo vive en el servidor).
- En el servidor se guarda solo el **hash SHA-256** de la llave: si alguien copiara el archivo de guardado, no podría entrar.
- El **código de invitación** (8 caracteres, ~40 bits) sirve **una vez**: al entrar la segunda persona se borra. No puede usarse para reemplazar a nadie.
- Si la misma llave se conecta desde otro lugar, la sesión vieja queda en pausa (no hay dos "yo" a la vez).

## Guardado

- Todo el estado de una isla es un JSON (`server/game/island.js` → `createIslandData`). Se guarda unos segundos después de cada cambio y **de inmediato** en eventos importantes (regalos, proyectos, fin de desafío), y al apagar el servidor (`SIGTERM`/`SIGINT`).
- `STORAGE=file`: escritura atómica (archivo temporal + `fsync` + `rename`) y copia `.bak` de la versión anterior; si un archivo se daña, se recupera la copia.
- `STORAGE=supabase`: upsert por la API REST de Supabase (sin dependencias). Pensado para hostings gratuitos sin disco.
- Los cultivos y las reapariciones usan **marcas de tiempo**, no contadores: si nadie entra por días no pasa nada malo (los cultivos solo esperan a que los rieguen).

## Seguridad (resumen)

- Mensajes JSON con tamaño máximo (16 KB) y límite de mensajes por conexión.
- Límites por IP para crear islas y para probar códigos (evita adivinar códigos por fuerza bruta).
- El WebSocket solo acepta conexiones desde la misma página (protección contra *cross-site WebSocket hijacking*), configurable con `ALLOWED_ORIGINS`.
- Todo texto de jugadores (nombres, notas) se limpia de caracteres invisibles/de control y se muestra con `textContent` (no se puede inyectar HTML).
- Cabeceras: `Content-Security-Policy` estricta (sin scripts ni estilos externos), `nosniff`, `Referrer-Policy`, `frame-ancestors 'none'`.
- El servidor de archivos estáticos impide salir de `public/` y `shared/`.

## Cliente

- `public/js/render.js`: capa de suelo pre-renderizada por mapa, entidades ordenadas por profundidad, luz (noche, cueva, faroles) con una capa de oscuridad recortada. Resolución interna ~200 px de lado corto con escalado entero → nítido y barato en celulares de gama baja.
- `public/js/sprites.js`: todos los gráficos se dibujan con mapas de píxeles y formas en código (personajes con capas de piel/pelo/ropa, árboles, casa, muebles, criaturas, íconos).
- `public/js/audio.js`: música generativa suave (cambia en la casa y la cueva) y efectos sintetizados; volumen de música/efectos y silencio, guardados en el celular.
- `public/sw.js`: service worker "primero red" para instalar la PWA y abrir rápido; el mundo nunca se guarda en el navegador.
