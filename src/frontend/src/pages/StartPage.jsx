import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useBorne } from '../context/BorneContext.jsx'
import { t } from '../utils/i18n.js'
import LanguageSelector from '../components/LanguageSelector.jsx'
import ilaLogo from '../assets/logo.png'
import houseIcon from '../assets/homeenv.png'

const SparkleIcon = ({ size = 16, style = {}, className = '' }) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="white"
    xmlns="http://www.w3.org/2000/svg"
    style={{ opacity: 0.6, ...style }}
  >
    <path d="M12 2 L13.5 10.5 L22 12 L13.5 13.5 L12 22 L10.5 13.5 L2 12 L10.5 10.5 Z" />
  </svg>
)

const HexPattern = () => (
  <svg
    style={{
      position: 'absolute',
      right: 0,
      bottom: 0,
      width: '220px',
      height: '180px',
      opacity: 0.15,
    }}
    viewBox="0 0 220 180"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    {[
      [40, 30], [100, 30], [160, 30],
      [70, 80], [130, 80], [190, 80],
      [40, 130], [100, 130], [160, 130],
    ].map(([cx, cy], i) => (
      <polygon
        key={i}
        points={`${cx},${cy - 28} ${cx + 24},${cy - 14} ${cx + 24},${cy + 14} ${cx},${cy + 28} ${cx - 24},${cy + 14} ${cx - 24},${cy - 14}`}
        stroke="white"
        strokeWidth="1.2"
        fill="none"
      />
    ))}
  </svg>
)

const SolarPanelBg = () => (
  <div
    style={{
      position: 'absolute',
      left: 0,
      top: 0,
      width: '260px',
      height: '100%',
      background:
        'repeating-linear-gradient(135deg, rgba(0,80,180,0.18) 0px, rgba(0,80,180,0.18) 1px, transparent 1px, transparent 28px), repeating-linear-gradient(45deg, rgba(0,80,180,0.18) 0px, rgba(0,80,180,0.18) 1px, transparent 1px, transparent 28px)',
      maskImage: 'linear-gradient(to right, black 50%, transparent 100%)',
      WebkitMaskImage: 'linear-gradient(to right, black 50%, transparent 100%)',
    }}
  />
)

export default function StartPage() {
  const navigate = useNavigate()
  const { formulaire, langue, setLangue } = useBorne()
  const [isExiting, setIsExiting] = useState(false)

  const config = formulaire?.pageDebutConfig || {}

  const defaultTexts = {
    titre: {
      fr: 'Estimez vos aides à la rénovation',
      en: 'Estimate your renovation grants',
      es: 'Calcula tus ayudas para la renovación',
    },
    sousTitre: {
      fr: 'Pour la rénovation énergétique de votre maison',
      en: 'For the energy renovation of your home',
      es: 'Para la renovación energética de tu hogar',
    },

    labelBouton: {
      fr: 'Commencer',
      en: 'Start',
      es: 'Empezar',
    }
  }

  const titre = t(config.titre, langue) || t(defaultTexts.titre, langue)
  const sousTitre = t(config.sousTitre, langue) || t(defaultTexts.sousTitre, langue)

  const labelBouton = t(config.labelBouton, langue) || t(defaultTexts.labelBouton, langue)

  function handleStart() {
    setIsExiting(true)
    setTimeout(() => {
      navigate('/form')
    }, 800)
  }

  return (
    <div
      className={isExiting ? 'is-exiting' : ''}
      style={{
        position: 'relative',
        width: '100%',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a1a6e 0%, #1a3aaa 30%, #2a3fb5 50%, #3b2fa0 70%, #6a3fb5 100%)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 32px 40px',
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        boxSizing: 'border-box',
      }}
    >
      {/* Background layers */}
      <SolarPanelBg />
      <HexPattern />

      {/* Radial glow center */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '500px',
          height: '400px',
          background: 'radial-gradient(ellipse at center, rgba(100,120,255,0.18) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Logo — top left */}
      <div
        className="fade-out"
        style={{
          position: 'absolute',
          top: '16px',
          left: '16px',
          background: 'rgba(10,26,110,0.7)',
          borderRadius: '10px',
          padding: '8px 12px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          border: '1px solid rgba(255,255,255,0.15)',
          zIndex: 20,
        }}
      >
        <img src={ilaLogo} alt="ila 26" style={{ height: '32px', width: 'auto', objectFit: 'contain' }} />
        <span
          style={{
            color: 'rgba(255,255,255,0.75)',
            fontSize: '8px',
            letterSpacing: '3px',
            textTransform: 'uppercase',
            marginTop: '2px',
            fontWeight: 600,
          }}
        >

        </span>
      </div>

      {/* Language selector — top right */}
      <div
        className="fade-out"
        style={{
          position: 'absolute',
          top: '14px',
          right: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          zIndex: 20,
        }}
      >
        <LanguageSelector currentLang={langue} onChange={setLangue} />
      </div>

      {/* Sparkle decorations */}
      <SparkleIcon className="fade-out" size={20} style={{ position: 'absolute', top: '60px', left: '55%', opacity: 0.5 }} />
      <SparkleIcon className="fade-out" size={12} style={{ position: 'absolute', bottom: '50px', right: '70px', opacity: 0.4 }} />
      <SparkleIcon className="fade-out" size={28} style={{ position: 'absolute', bottom: '30px', right: '30px', opacity: 0.55 }} />

      <div className="hero-wrapper">
        {/* Glassmorphism house icon */}
        <div className="hero-icon">
          <img src={houseIcon} alt="Maison" />
        </div>

        <div className="hero-text">
          {/* Main heading */}
          <h1 className="hero-title">
            {titre}
          </h1>

          {/* Subtitle */}
          <p className="hero-subtitle">
            {sousTitre}
          </p>
        </div>
      </div>


      {/* CTA button */}
      <style>
        {`
          .fade-out {
            transition: opacity 0.4s ease-out, transform 0.4s ease-out;
            opacity: 1;
            transform: translateY(0);
          }
          .is-exiting .fade-out {
            opacity: 0;
            transform: translateY(20px);
            pointer-events: none;
          }

          .hero-wrapper {
            position: relative;
            width: 100%;
            height: 250px;
            margin-bottom: 16px;
            transition: transform 0.8s cubic-bezier(0.4, 0, 0.2, 1);
            z-index: 10;
          }
          .is-exiting .hero-wrapper {
            transform: translateY(-25vh);
          }

          .hero-icon {
            position: absolute;
            top: 0;
            left: 50%;
            transform: translateX(-50%);
            width: 110px;
            height: 110px;
            border-radius: 50%;
            background: rgba(140,160,255,0.22);
            border: 1.5px solid rgba(255,255,255,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            box-shadow: 0 4px 32px rgba(80,100,255,0.2);
            transition: all 0.8s cubic-bezier(0.4, 0, 0.2, 1);
          }
          .hero-icon img {
            width: 70px;
            height: 70px;
            object-fit: contain;
          }
          .is-exiting .hero-icon {
            transform: translateX(-140px) scale(0.65);
            top: 50px;
            background: transparent;
            border-color: transparent;
            box-shadow: none;
            backdrop-filter: none;
            -webkit-backdrop-filter: none;
          }

          .hero-text {
            position: absolute;
            top: 134px;
            left: 50%;
            transform: translateX(-50%);
            display: flex;
            flex-direction: column;
            align-items: center;
            width: max-content;
            max-width: 90vw;
            transition: all 0.8s cubic-bezier(0.4, 0, 0.2, 1);
          }
          .is-exiting .hero-text {
            transform: translateX(-20px);
            top: 50px;
            align-items: flex-start;
          }

          .hero-title {
            color: white;
            font-size: clamp(22px, 4vw, 36px);
            font-weight: 800;
            margin: 0 0 8px;
            letter-spacing: -0.3px;
            line-height: 1.15;
            transition: all 0.8s cubic-bezier(0.4, 0, 0.2, 1);
          }
          .is-exiting .hero-title {
            font-size: 28px;
            margin: 0 0 4px;
          }

          .hero-subtitle {
            color: rgba(255,255,255,0.95);
            font-size: clamp(14px, 2vw, 17px);
            font-weight: 700;
            margin: 0 0 6px;
            transition: all 0.8s cubic-bezier(0.4, 0, 0.2, 1);
          }
          .is-exiting .hero-subtitle {
            font-size: 16px;
            font-style: italic;
          }

          @keyframes floatAndPulse {
            0% { 
              transform: translateY(0) scale(1); 
              box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.4), 0 4px 15px rgba(0,0,0,0.2);
            }
            50% { 
              transform: translateY(-4px) scale(1.02); 
              box-shadow: 0 0 0 10px rgba(255, 255, 255, 0), 0 10px 25px rgba(0,0,0,0.3);
            }
            100% { 
              transform: translateY(0) scale(1); 
              box-shadow: 0 0 0 0 rgba(255, 255, 255, 0), 0 4px 15px rgba(0,0,0,0.2);
            }
          }
          
          @keyframes shimmer {
            0% { left: -100%; opacity: 0; }
            20% { opacity: 1; }
            80% { left: 200%; opacity: 0; }
            100% { left: 200%; opacity: 0; }
          }

          .start-btn {
            animation: floatAndPulse 3s infinite ease-in-out;
            transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
            overflow: hidden;
            background: linear-gradient(135deg, #ffffff 0%, #f0f0f5 100%) !important;
          }

          .start-btn::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 50%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(100, 150, 255, 0.4), transparent);
            transform: skewX(-25deg);
            animation: shimmer 3s infinite ease-in-out;
            pointer-events: none;
          }

          .start-btn:hover {
            animation: none;
            transform: translateY(-6px) scale(1.06) !important;
            box-shadow: 0 15px 35px rgba(0,0,0,0.4), 0 0 20px rgba(255,255,255,0.6) !important;
          }
          
          .start-btn-icon {
            transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
          }
          .start-btn:hover .start-btn-icon {
            transform: translateX(6px);
          }
        `}
      </style>
      <button
        className="start-btn fade-out"
        onClick={handleStart}
        style={{
          color: '#1a1a2e',
          border: 'none',
          borderRadius: '50px',
          padding: '16px 42px',
          fontSize: '17px',
          fontWeight: 800,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          letterSpacing: '0.5px',
          position: 'relative',
          zIndex: 10,
        }}
      >
        {labelBouton} <span className="start-btn-icon" style={{ fontSize: '20px' }}>→</span>
      </button>
    </div>
  )
}
