// Inline SVG icons — xmlns="http://www.w3.org/2000/svg"
// Style : stroke, strokeWidth 2, strokeLinecap round

const base = {
  xmlns: 'http://www.w3.org/2000/svg',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

export function IconHome({ size = 24, className = '' }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24" className={className}>
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

export function IconUser({ size = 24, className = '' }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24" className={className}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

export function IconMapPin({ size = 24, className = '' }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24" className={className}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

export function IconWrench({ size = 24, className = '' }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24" className={className}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  )
}

export function IconCheckCircle({ size = 24, className = '' }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24" className={className}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}

export function IconXCircle({ size = 24, className = '' }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24" className={className}>
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  )
}

export function IconArrowRight({ size = 24, className = '' }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24" className={className}>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  )
}

export function IconArrowLeft({ size = 24, className = '' }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24" className={className}>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  )
}

export function IconShield({ size = 24, className = '' }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24" className={className}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}

export function IconBolt({ size = 24, className = '' }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24" className={className}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  )
}

export function IconClipboard({ size = 24, className = '' }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24" className={className}>
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    </svg>
  )
}

export function IconSun({ size = 24, className = '' }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24" className={className}>
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  )
}

export function IconEuro({ size = 24, className = '' }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24" className={className}>
      <path d="M4 10h12" />
      <path d="M4 14h9" />
      <path d="M19 6a7.7 7.7 0 0 0-5.2-2A7.9 7.9 0 0 0 6 12c0 4.4 3.5 8 7.8 8 2 0 3.8-.8 5.2-2" />
    </svg>
  )
}

export function IconCalendar({ size = 24, className = '' }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24" className={className}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

export function IconFlame({ size = 24, className = '' }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24" className={className}>
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  )
}

export function IconRuler({ size = 24, className = '' }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24" className={className}>
      <path d="M21.3 8.7 8.7 21.3c-1 1-2.5 1-3.4 0l-2.6-2.6c-1-1-1-2.5 0-3.4L15.3 2.7c1-1 2.5-1 3.4 0l2.6 2.6c1 1 1 2.5 0 3.4Z" />
      <path d="m7.5 10.5 2 2" />
      <path d="m10.5 7.5 2 2" />
      <path d="m13.5 4.5 2 2" />
      <path d="m4.5 13.5 2 2" />
    </svg>
  )
}

export function IconSend({ size = 24, className = '' }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24" className={className}>
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}

export function IconRefresh({ size = 24, className = '' }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24" className={className}>
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  )
}

export function IconPhone({ size = 24, className = '' }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24" className={className}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.11h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.69a16 16 0 0 0 6 6l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.73 16z" />
    </svg>
  )
}

export function IconMail({ size = 24, className = '' }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24" className={className}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  )
}

export function IconLoader({ size = 24, className = '' }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24" className={className}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

export function IconBuilding({ size = 24, className = '' }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24" className={className}>
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
      <path d="M9 22v-4h6v4" />
      <path d="M8 6h.01" /><path d="M16 6h.01" />
      <path d="M12 6h.01" /><path d="M12 10h.01" />
      <path d="M12 14h.01" /><path d="M16 10h.01" />
      <path d="M16 14h.01" /><path d="M8 10h.01" />
      <path d="M8 14h.01" />
    </svg>
  )
}

export function IconDroplet({ size = 24, className = '' }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24" className={className}>
      <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5S12.5 6 12 3c-.5 3-2 5.4-4 7C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" />
    </svg>
  )
}

export function IconWind({ size = 24, className = '' }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24" className={className}>
      <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" />
      <path d="M9.6 4.6A2 2 0 1 1 11 8H2" />
      <path d="M12.6 19.4A2 2 0 1 0 14 16H2" />
    </svg>
  )
}

export function IconMoon({ size = 24, className = '' }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24" className={className}>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  )
}

export function IconThermometer({ size = 24, className = '' }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24" className={className}>
      <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
    </svg>
  )
}

export function IconTree({ size = 24, className = '' }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24" className={className}>
      <path d="m17 14 3 3.1a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14h-.3a1 1 0 0 1-.7-1.7L9 9h-.2A1 1 0 0 1 8 7.3L12 3l4 4.3A1 1 0 0 1 15.2 9H15l3 3.3a1 1 0 0 1-.7 1.7H17z" />
      <path d="M12 22v-3" />
    </svg>
  )
}

export function IconKey({ size = 24, className = '' }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24" className={className}>
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="m21 2-9.6 9.6" />
      <path d="m15.5 7.5 3 3L22 7l-3-3" />
    </svg>
  )
}

export function IconHelpCircle({ size = 24, className = '' }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24" className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

export function IconSunrise({ size = 24, className = '' }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24" className={className}>
      <path d="M12 2v4" />
      <path d="m4.93 10.93 1.41 1.41" />
      <path d="M2 18h2" />
      <path d="M20 18h2" />
      <path d="m19.07 10.93-1.41 1.41" />
      <path d="M22 22H2" />
      <path d="m16 6-4 4-4-4" />
      <path d="M16 18a4 4 0 0 0-8 0" />
    </svg>
  )
}

export function IconClock({ size = 24, className = '' }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24" className={className}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

export function IconUsers({ size = 24, className = '' }) {
  return (
    <svg {...base} width={size} height={size} viewBox="0 0 24 24" className={className}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}
