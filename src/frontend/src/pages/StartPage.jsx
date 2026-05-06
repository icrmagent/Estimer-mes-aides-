import { useNavigate } from 'react-router-dom'
import { useBorne } from '../context/BorneContext.jsx'
import { t } from '../utils/i18n.js'
import LanguageSelector from '../components/LanguageSelector.jsx'

/**
 * Page de début visiteur — affiche page_debut_config dans la langue active.
 * Sélecteur de langue FR/ES/EN en haut à droite.
 * Bouton démarrer lance une nouvelle session visiteur (R3.3).
 */
export default function StartPage() {
  const navigate = useNavigate()
  const { formulaire, langue, resetLangue } = useBorne()

  const config = formulaire?.pageDebutConfig || {}
  const titre = t(config.titre, langue) || 'Estimez vos aides à la rénovation'
  const sousTitre = t(config.sousTitre, langue) || 'Répondez à quelques questions pour découvrir vos aides'
  const labelBouton = t(config.labelBouton, langue) || 'Commencer'

  function handleStart() {
    // Réinitialiser la langue à la langue par défaut de la borne pour la nouvelle session
    // (la langue choisie sur cette page est conservée pour la session)
    navigate('/form')
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'linear-gradient(135deg, #5B2D8E 0%, #1A56A0 100%)' }}
    >
      {/* Barre info borne */}
      <BorneInfoBar />

      {/* Header avec sélecteur de langue */}
      <header
        className="flex items-center justify-between px-6 py-4"
        style={{ background: 'linear-gradient(90deg, #5B2D8E 0%, #1A56A0 100%)' }}
      >
        <div className="text-white font-bold text-lg">ila26</div>
        <LanguageSelector />
      </header>

      {/* Contenu principal */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
        <div className="w-full max-w-md">
          {/* Icône */}
          <div
            className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8"
            style={{ background: 'rgba(255,255,255,0.15)' }}
          >
            <span className="text-white text-4xl">🏠</span>
          </div>

          <h1 className="text-3xl font-bold text-white mb-4 leading-tight">
            {titre}
          </h1>

          <p className="text-white/80 text-lg mb-10 leading-relaxed">
            {sousTitre}
          </p>

          <button
            onClick={handleStart}
            className="w-full max-w-xs mx-auto block text-white font-bold rounded-2xl py-5 text-xl transition-transform active:scale-95"
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: '2px solid rgba(255,255,255,0.5)',
              minHeight: '64px',
              fontSize: '18px',
            }}
          >
            {labelBouton} →
          </button>
        </div>
      </main>
    </div>
  )
}

function BorneInfoBar() {
  const { borne, langue } = useBorne()
  if (!borne) return null

  const labels = {
    fr: { master: 'Master Filiale', regie: 'régie', installateur: 'installateur' },
    es: { master: 'Filial Master', regie: 'agencia', installateur: 'instalador' },
    en: { master: 'Master Branch', regie: 'agency', installateur: 'installer' },
  }
  const l = labels[langue] || labels.fr

  return (
    <div
      className="flex items-center justify-between px-4 py-2 text-white text-xs font-medium"
      style={{ background: '#1A1A2E', minHeight: '36px' }}
    >
      <span className="font-bold">ila26</span>
      <span className="truncate mx-4">
        {borne.commercant && `${l.master}: ${borne.commercant}`}
        {borne.regie && ` · ${l.regie}: ${borne.regie}`}
        {borne.installateur && ` · ${l.installateur}: ${borne.installateur}`}
      </span>
      <span className="text-white/60 shrink-0">{borne.adresse}</span>
    </div>
  )
}
