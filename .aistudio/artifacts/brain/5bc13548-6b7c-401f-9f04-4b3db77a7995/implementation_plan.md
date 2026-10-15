# Decoración Temática de Fútbol (Estilo Sutil y Deportivo)

Incorporación de elementos ornamentales de fútbol con diseño premium y elegante —textura sutil de césped de estadio, líneas reglamentarias de campo de juego y balones clásicos de cuero— distribuidos armónicamente en el fondo general y en los componentes clave sin comprometer la velocidad ni la claridad visual.

### User Review & Critical Decisions

> [!IMPORTANT]
> Decisiones confirmadas a través del cuestionario inicial:
> - **Estilo estético:** Diseño sutil con líneas de campo de fútbol, tonalidades de césped de estadio y balones de cuero clásicos (en lugar de luces de estadio estridentes o marcadores recargados).
> - **Ubicación:** Fondo general envolvente y detalles integrados con finura en las tarjetas de emisoras y el panel de sincronización de retardo.
> - **Sin impacto funcional:** Es exclusivamente una capa cosmética/decorativa; ningún control, lógica de retardo, memoria por emisora ni reproductor de audio se verá alterado.

---

### 1. Overview & Core Concept

- **Qué hace:** Enriquece la identidad visual de la aplicación para que transmita inmediatamente la atmósfera de estar siguiendo la jornada de fútbol en directo con la radio sincronizada a la televisión, mediante grafismo deportivo sutil y estilizado.
- **Público objetivo:** Aficionados al fútbol que escuchan la narración de sus emisoras favoritas mientras ven el partido en pantalla, buscando una experiencia inmersiva y limpia.
- **Valor clave:** Personalidad deportiva reconocible sin caer en sobrecarga gráfica ("anti-slop"), manteniendo el contraste WCAG AA, la velocidad táctil instantánea y la facilidad de uso a una mano.

---

### 2. User Experience & Visual Design

#### A. Dirección Estética y Paleta
- **Atmósfera:** Verde césped de noche deportiva (`#061a12` / `#0b291d`) combinado con el gris pizarra oscuro actual (`slate-950` / `slate-900`) para preservar la elegancia y el descanso visual.
- **Líneas de Campo (Pitch Geometry):** Trazos vectoriales ultra sutiles en baja opacidad (blanco/esmeralda al 6%-10%) que dibujan el círculo central del terreno de juego, las líneas de banda, la medialuna del área y los cuadrantes de córner en el fondo de la pantalla.
- **Textura de Césped (Pitch Turf Mowing Lines):** Sutil gradiente de bandas alternadas en el fondo que evoca el corte de césped profesional de los estadios europeos.

#### B. Detalles en Componentes y Tarjetas
- **Cabecera Principal:** Icono de balón de fútbol clásico de 32 paneles en el encabezado junto al título "Sincronizador Radio", con acabado metálico o esmeralda refinado.
- **Tarjetas de Emisoras:**
  - Micro-esquinas con patrón de red de portería o líneas de córner en las esquinas superiores de cada botón de emisora.
  - Indicador visual sutil de "En Juego / Sintonizada" con detalle de balón para la emisora activa.
- **Panel de Sincronización:**
  - El deslizador de retardo seguro ahora incorpora una referencia deportiva: la bolita verde arrastrable incluirá una micro-textura o silueta de balón de fútbol pentagonal de alta precisión que gira levemente o destaca al arrastrarla.
  - El fondo del contenedor de retardo tendrá un sutil marco de área de penalti / campo de juego.

#### C. Disciplina Anti-Slop y Legibilidad
- Nada de animaciones pesadas ni luces de neón agresivas que distraigan de los números de sincronización.
- Mantenimiento estricto del contraste tipográfico de los segundos, nombres de emisoras y frecuencias.

---

### 3. Key Product Decisions & Trade-Offs

- **Decisión 1: Gráficos vectoriales SVG puros y CSS en vez de imágenes pesadas de mapa de bits**
  - *Enfoque elegido:* Crear la decoración mediante SVGs matemáticos ligeros incrustados directamente y capas de gradientes CSS con patrón geométrico.
  - *Por qué:* Cero impacto en el peso de la app (0 KB de peticiones externas de red), compatibilidad 100% offline para PWA y nitidez vectorial perfecta en cualquier resolución de pantalla de smartphone.
  - *Alternativas descartadas:* Cargar fotos JPEG/PNG de estadios reales de internet (ralentiza la carga, puede fallar sin conexión y satura la pantalla restando legibilidad a los botones).

- **Decisión 2: Jerarquía no intrusiva con `pointer-events-none`**
  - *Enfoque elegido:* Toda la ornamentación del fondo y las marcas de campo se situarán en capas con `pointer-events: none` y `z-index: 0`.
  - *Por qué:* Garantiza que ningún toque con el dedo se pierda o sea interceptado por la decoración; la pulsación de emisoras y el arrastre de la bola de retardo se mantendrán 100% reactivos.

---

### 4. Technical Architecture & Data Strategy

```
┌──────────────────────────────────────────────────────────────┐
│                    VIEWPORT PRINCIPAL                        │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ [CAPA 0: FONDO DE ESTADIO] (pointer-events-none)      │  │
│  │ - Bandas de césped cortado (CSS subtle striping)       │  │
│  │ - Vector SVG: Círculo central + áreas + punto penalti  │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ [CAPA 10: CABECERA & BADGES]                           │  │
│  │ - Balón clásico bordado junto al título                │  │
│  │ - Botón de instalación / menú con borde deportivo      │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ [CAPA 20: REJILLA DE EMISORAS]                         │  │
│  │ - Tarjetas con filigrana de red / líneas de córner     │  │
│  │ - Emisora activa con mini-balón de sintonía            │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ [CAPA 30: CONTROL DE SINCRONIZACIÓN]                   │  │
│  │ - Carril con aspecto de banda de campo reglamentaria   │  │
│  │ - Bola de arrastre táctil con diseño de balón clásico  │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

#### Plan de Tareas para la Ejecución:
1. Diseñar el componente vectorial de fondo (`SoccerFieldBackground`) con líneas de campo reglamentarias en opacidad tenue (círculo central, área grande y bandas).
2. Añadir la sutil textura de césped con gradiente radial y bandas diagonales en el contenedor raíz de `App.tsx` y `index.css`.
3. Incorporar el icono de balón de fútbol clásico en la cabecera y el detalle de sintonía en la tarjeta de emisora seleccionada.
4. Dotar al deslizador de retardo táctil de un aspecto de balón de fútbol en la bola arrastrable manteniendo intacta la protección contra toques accidentales.
5. Verificar el renderizado en móvil y ejecutar validaciones de compilación y linting.
