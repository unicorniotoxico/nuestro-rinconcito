# Qué está probado (y qué no)

## Pruebas automáticas — `npm test` (37 pruebas)

Corren contra un **servidor real** en un puerto libre, con **dos clientes WebSocket independientes** (como dos celulares).

**Creación, unión e identidad**
- Crear isla → código de 8 caracteres; unirse con el código; una **tercera persona** con el mismo código es rechazada.
- Cada uno vuelve con **su llave** y sigue siendo quien era; una llave falsa no entra.
- Una segunda sesión con la misma llave pone en pausa a la vieja.

**Sincronización y acciones simultáneas**
- Los movimientos de uno llegan al otro en tiempo real; el servidor corrige teletransportes y caminar por el agua.
- Los dos juntan **la misma flor a la vez**: exactamente uno la recibe.
- Los dos talan el mismo árbol: los golpes suman y la madera se entrega una sola vez.
- Reenviar una acción con el mismo id **no duplica** el efecto (fabricar dos veces con un solo pago).
- Abrir el mismo regalo dos veces en paralelo: se entrega una sola vez; el otro no puede abrir regalos ajenos.

**Guardado y reconexión**
- Un servidor se apaga y otro arranca con los mismos datos: inventarios, muebles, huerta y llaves siguen intactos.
- Al desconectarse, el otro lo ve; al volver, aparece en el mismo lugar y con el mismo inventario.
- Guardado en archivos: atómico, con copia `.bak` que se usa si el archivo se daña.
- Guardado en Supabase contra una **API falsa compatible** (paginación, upsert, claves nuevas y viejas, errores claros) y una isla que sobrevive a un reinicio del servidor.

**Cada función del juego**
- Huerta completa; los cultivos **no mueren** aunque pasen 10 días sin riego.
- Buzón con regalo y nota para alguien **desconectado**; aviso al volver.
- Proyecto del puente entre los dos (solo se toma lo que falta) y luego se puede cruzar.
- Casa: muebles en lugares válidos, nada frente a la puerta, sin superponer, sin encerrar a nadie, cuadros solo en la pared; guardar un mueble lo devuelve a **quien lo puso**.
- Pesca: el servidor recalcula los toques; un pique se cobra una vez; toques "del futuro" se rechazan.
- Cueva: entrar, pelear, y **desmayarse sin perder el inventario** (despierta en casa con la vida llena).
- Carpincho: nombre (limpio de caracteres raros), comida, mimos de los dos.
- Cofres individuales, comida, cama, gestos, sombreros solo si se ganaron, herramientas únicas.

**Desafíos**
- Solo se pueden proponer con los dos conectados; no se acepta el propio.
- Minería: rocas que reaparecen rápido durante el desafío, **premio a los dos una sola vez** aunque el tick corra de nuevo, y sombrero para quien gana.
- Cosecha: riego mágico, crecimiento ×4 y **cada uno cosecha lo suyo**.

**Mundo y datos**
- Todo lo importante es alcanzable caminando (casa, cueva, huerta completa, muelle, buzón, puente); el mirador solo con el puente reparado; cofres y minerales de la cueva alcanzables; portales que no caen en paredes ni en otro portal.
- Recetas, cultivos, peces, nodos, desafíos y muebles coherentes; el hacha y el pico se pueden fabricar sin herramientas previas.
- El minijuego de pesca se puede ganar en todas las rarezas.

**Seguridad**
- No se puede leer código del servidor con rutas raras (`..`, `%2e%2e`).
- Cabeceras de seguridad (CSP, nosniff…).
- El WebSocket rechaza otros orígenes.
- Mensajes gigantes cierran la conexión; mensajes basura o con `__proto__`/`constructor` no rompen nada.
- Probar códigos de invitación tiene límite de intentos.
- Las llaves se guardan solo como hash; el hash no sirve para entrar.

## Prueba de punta a punta — `npm run test:e2e`

Usa **dos navegadores Chromium independientes** emulando un **iPhone 13** y un **Pixel 7** (pantalla táctil, tamaño y densidad reales) contra el servidor real, manejando la **interfaz** como una persona (tocando botones, el piso para decorar, el botón de acción y el minijuego de pesca). Recorre:

1. Crear la isla y ver el código · 2. Unirse con el **enlace** de invitación desde el otro celular; un tercero es rechazado · 3. Ver al otro moverse · 4. Juntar ramitas/piedras y **fabricar** desde el menú · 5. Talar un árbol **entre los dos** sin duplicar madera · 6. Preparar, plantar, que el otro riegue, cosechar · 7. **Pescar** con toques en pantalla · 8. Nombrar, mimar y alimentar al carpincho · 9. Entrar a la casa, **colocar muebles** tocando el piso (frente a la puerta no deja), que el otro los vea · 10. Dejar un **regalo con nota** mientras la otra persona está desconectada · 11. **Reconectar** desde "otro celular" con la llave: vuelve como sí misma, en la casa, con su inventario, y abre el regalo · 12. Reparar el **puente** aportando desde el menú los dos y sentarse juntos en el mirador · 13. Cueva con criaturas y combate · 14. **Desafío** propuesto y aceptado por la interfaz, con tiempo en pantalla, resultado, premio para los dos y sombrero al ganador · 15. **Apagar el servidor**: aparece el aviso de sin conexión; al volver se reconecta solo y todo sigue guardado · 16. Capturas de noche y en apaisado.

Las capturas quedan en la carpeta que indiques con `SHOTS=./capturas npm run test:e2e`.

## Lo que NO pude probar (pendiente con celulares de verdad)

- **Safari / iPhone real**: el motor WebKit no estaba disponible en el entorno; se probó con Chromium **emulando** un iPhone. Hay que confirmar en un iPhone real: sonido después del primer toque, instalación con "Agregar a inicio", áreas seguras (notch) y gestos.
- **Instalación como PWA en un dispositivo real** (el manifest, los íconos y el service worker están, y el service worker se registra en HTTPS/localhost).
- **Rendimiento en un celular de gama baja real**: el juego dibuja a ~200 px de resolución interna para ser liviano, pero no se midió en hardware real.
- **El sonido "de oído"**: la música y los efectos se generan sin errores, pero no los escuché.
- **Despliegue real en Render + Supabase**: el código de Supabase se probó contra una imitación de su API; falta confirmarlo con una cuenta real (si algo falla, el servidor lo dice claro en el registro al arrancar).
- **Partidas largas reales** de 10–20 minutos con dos personas: el balance (tiempos de cultivo, cantidades de los proyectos) es una primera versión y seguramente haya que ajustarlo jugando.

## Limitaciones conocidas

- Es una primera versión: un solo mapa chico, 3 cultivos, 5 peces, 2 criaturas, 3 proyectos.
- Requiere conexión todo el tiempo (por diseño: el mundo vive en el servidor). Sin internet se muestra el aviso y no se puede jugar hasta que vuelva.
- El servidor mantiene todas las islas en memoria: perfecto para una pareja o unas cuantas, no pensado para miles.
- La validación del movimiento es tolerante (para que se sienta fluido con mala señal): alguien con conocimientos podría moverse un poco más rápido que lo normal, pero no atravesar paredes ni teletransportarse.
- La pesca se verifica en el servidor, pero un programa automático que "toque perfecto" podría ganar siempre (es un juego cooperativo entre dos, no un torneo).
- En Render gratis el servidor se duerme a los 15 minutos sin uso (la primera entrada tarda ~1 minuto).
