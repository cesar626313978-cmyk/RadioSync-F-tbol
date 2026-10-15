import React from 'react';

/**
 * Icono vectorial de Balón de Fútbol Clásico (32 paneles / Telstar)
 * Renderizado en SVG puro, ultra ligero y nítido a cualquier resolución.
 */
export function SoccerBall({
  className = 'w-5 h-5',
  primaryColor = '#ffffff',
  patchColor = '#0f172a',
  glow = false,
}: {
  className?: string;
  primaryColor?: string;
  patchColor?: string;
  glow?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={`${className} ${glow ? 'drop-shadow-[0_0_8px_rgba(52,211,153,0.7)]' : ''}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Sombreado 3D de esfera de balón */}
        <radialGradient id="ballShading" cx="35%" cy="32%" r="65%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="60%" stopColor="#e2e8f0" stopOpacity="0.9" />
          <stop offset="90%" stopColor="#94a3b8" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#475569" stopOpacity="1" />
        </radialGradient>
        <radialGradient id="patchShading" cx="40%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#334155" />
          <stop offset="100%" stopColor={patchColor} />
        </radialGradient>
      </defs>

      {/* Base esférica del balón */}
      <circle cx="50" cy="50" r="46" fill="url(#ballShading)" stroke="#1e293b" strokeWidth="2.5" />

      {/* Pentágono Central Clásico */}
      <polygon
        points="50,33 66,45 60,63 40,63 34,45"
        fill="url(#patchShading)"
        stroke="#0f172a"
        strokeWidth="2"
      />

      {/* Costuras y parches perimetrales del balón de fútbol */}
      {/* Superior */}
      <path
        d="M50 33 L50 14 M50 14 L36 6 M50 14 L64 6"
        stroke="#0f172a"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polygon points="50,14 42,5 58,5" fill="url(#patchShading)" stroke="#0f172a" strokeWidth="1.5" />

      {/* Superior Derecho */}
      <path
        d="M66 45 L84 41 M84 41 L94 28 M84 41 L92 54"
        stroke="#0f172a"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polygon points="84,41 93,31 96,48" fill="url(#patchShading)" stroke="#0f172a" strokeWidth="1.5" />

      {/* Inferior Derecho */}
      <path
        d="M60 63 L74 76 M74 76 L70 92 M74 76 L89 79"
        stroke="#0f172a"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polygon points="74,76 86,77 74,90" fill="url(#patchShading)" stroke="#0f172a" strokeWidth="1.5" />

      {/* Inferior Izquierdo */}
      <path
        d="M40 63 L26 76 M26 76 L11 79 M26 76 L30 92"
        stroke="#0f172a"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polygon points="26,76 14,77 26,90" fill="url(#patchShading)" stroke="#0f172a" strokeWidth="1.5" />

      {/* Superior Izquierdo */}
      <path
        d="M34 45 L16 41 M16 41 L8 54 M16 41 L6 28"
        stroke="#0f172a"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polygon points="16,41 7,31 4,48" fill="url(#patchShading)" stroke="#0f172a" strokeWidth="1.5" />

      {/* Brillo especular sutil en la parte superior izquierda */}
      <ellipse cx="36" cy="24" rx="14" ry="7" fill="#ffffff" fillOpacity="0.35" transform="rotate(-30 36 24)" />
    </svg>
  );
}

/**
 * Fondo reglamentario sutil de terreno de juego de fútbol (Pitch Geometry)
 * Dibuja líneas tenues y bandas de césped cortado de estadio
 */
export function SoccerFieldBackground() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none select-none overflow-hidden z-0"
    >
      {/* Bandas de corte de césped de estadio (Lawn mowing stripes) */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#05140d]/90 via-[#071911]/80 to-[#04100b]/95" />
      <div
        className="absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, transparent, transparent 40px, rgba(52, 211, 153, 0.4) 40px, rgba(52, 211, 153, 0.4) 80px)',
        }}
      />

      {/* Líneas de campo vectoriales SVG a escala */}
      <svg
        className="absolute inset-0 w-full h-full text-emerald-400 opacity-[0.07]"
        viewBox="0 0 400 900"
        preserveAspectRatio="none"
        fill="none"
        stroke="currentColor"
      >
        {/* Línea de banda exterior perimetral */}
        <rect x="12" y="16" width="376" height="868" rx="8" strokeWidth="2" />

        {/* Córners (arcos de esquina) */}
        <path d="M 12 36 A 20 20 0 0 0 32 16" strokeWidth="2" />
        <path d="M 388 36 A 20 20 0 0 1 368 16" strokeWidth="2" />
        <path d="M 12 864 A 20 20 0 0 1 32 884" strokeWidth="2" />
        <path d="M 388 864 A 20 20 0 0 0 368 884" strokeWidth="2" />

        {/* Medio campo: Línea central divisoria */}
        <line x1="12" y1="450" x2="388" y2="450" strokeWidth="2" strokeDasharray="6 4" />

        {/* Círculo Central y Punto de Saque de Centro */}
        <circle cx="200" cy="450" r="65" strokeWidth="2" />
        <circle cx="200" cy="450" r="4.5" fill="currentColor" />

        {/* Área Grande Superior (Portería 1) */}
        <rect x="100" y="16" width="200" height="110" strokeWidth="2" />
        {/* Área Pequeña Superior */}
        <rect x="145" y="16" width="110" height="42" strokeWidth="1.8" />
        {/* Punto de penalti superior */}
        <circle cx="200" cy="85" r="3.5" fill="currentColor" />
        {/* Medialuna del área superior */}
        <path d="M 160 126 A 48 48 0 0 0 240 126" strokeWidth="2" />

        {/* Área Grande Inferior (Portería 2) */}
        <rect x="100" y="774" width="200" height="110" strokeWidth="2" />
        {/* Área Pequeña Inferior */}
        <rect x="145" y="842" width="110" height="42" strokeWidth="1.8" />
        {/* Punto de penalti inferior */}
        <circle cx="200" cy="815" r="3.5" fill="currentColor" />
        {/* Medialuna del área inferior */}
        <path d="M 160 774 A 48 48 0 0 1 240 774" strokeWidth="2" />
      </svg>

      {/* Destellos de iluminación de estadio sutiles en las esquinas superiores */}
      <div className="absolute -top-12 -left-12 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -top-12 -right-12 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
    </div>
  );
}

/**
 * Esquina de campo para tarjetas (Detalle sutil de banderín de córner / área)
 */
export function PitchCardCorner({ className = 'text-emerald-400/20' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={`w-4 h-4 pointer-events-none absolute top-1 right-1 ${className}`}
    >
      <path d="M24 0 L24 16 A16 16 0 0 1 8 0 Z" fill="currentColor" opacity="0.4" />
      <path d="M24 0 L24 22 A22 22 0 0 1 2 0" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
