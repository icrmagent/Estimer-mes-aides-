/**
 * ScreenSaver.test.jsx — déclenchement et sortie de l'écran de veille.
 *
 *  - apparaît après `delaiActivation` s sans toucher, pas avant ;
 *  - toute activité réarme la minuterie ;
 *  - un toucher le ferme sans atteindre la page d'accueil ;
 *  - respecte la plage horaire ;
 *  - enchaîne les diapositives selon leur durée.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { BorneContext } from '../context/BorneContext.jsx'

vi.mock('../services/mediaCacheService.js', () => ({
  syncMediaCache: vi.fn(async () => ({ cached: 0, failed: [] })),
  resolveMediaUrl: vi.fn(async (url) => ({ src: url, revoke: null })),
}))

const { default: ScreenSaver } = await import('./ScreenSaver.jsx')

const ECRAN = {
  id: 'e1',
  updatedAt: '2026-09-23T10:00:00Z',
  delaiActivation: 30,
  transition: 'aucune',
  ordreAleatoire: false,
  afficherCta: true,
  texteCta: { fr: 'Touchez l\'écran pour commencer', es: 'Toque la pantalla' },
  afficherLogo: true,
  afficherHorloge: false,
  heureDebut: null,
  heureFin: null,
  diapositives: [
    { id: 'd1', type: 'texte', duree: 6, titre: { fr: 'Première diapo' }, contenu: { fond: { type: 'couleur', couleur: '#5B2D8E' } } },
    { id: 'd2', type: 'texte', duree: 5, titre: { fr: 'Deuxième diapo' }, contenu: { fond: { type: 'couleur', couleur: '#1A56A0' } } },
  ],
}

let resetLangue

function renderSaver(ecranVeille = ECRAN, langue = 'fr') {
  return render(
    <BorneContext.Provider value={{ ecranVeille, langue, resetLangue }}>
      <button type="button">Commencer</button>
      <ScreenSaver />
    </BorneContext.Provider>,
  )
}

async function advance(ms) {
  await act(async () => { vi.advanceTimersByTime(ms) })
  await act(async () => {}) // résolution des médias (promesses)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 8, 23, 10, 0))
  resetLangue = vi.fn()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ScreenSaver', () => {
  it('apparaît après le délai d\'inactivité et réinitialise la langue', async () => {
    renderSaver()
    await advance(29_000)
    expect(screen.queryByTestId('ecran-veille')).toBeNull()

    await advance(1_000)
    expect(screen.getByTestId('ecran-veille')).toBeInTheDocument()
    expect(screen.getByText('Première diapo')).toBeInTheDocument()
    expect(screen.getByText('Touchez l\'écran pour commencer')).toBeInTheDocument()
    expect(resetLangue).toHaveBeenCalledTimes(1)
  })

  it('toute activité réarme la minuterie', async () => {
    renderSaver()
    await advance(25_000)
    fireEvent.touchStart(document.body)
    await advance(25_000)
    expect(screen.queryByTestId('ecran-veille')).toBeNull()
    await advance(5_000)
    expect(screen.getByTestId('ecran-veille')).toBeInTheDocument()
  })

  it('un toucher ferme la veille sans atteindre la page dessous, puis la minuterie repart', async () => {
    renderSaver()
    const onUnderlyingClick = vi.fn()
    screen.getByText('Commencer').addEventListener('click', onUnderlyingClick)
    await advance(30_000)

    const overlay = screen.getByTestId('ecran-veille')
    fireEvent.pointerDown(overlay)
    fireEvent.click(overlay)
    expect(onUnderlyingClick).not.toHaveBeenCalled()

    await advance(500)
    expect(screen.queryByTestId('ecran-veille')).toBeNull()

    await advance(30_000)
    expect(screen.getByTestId('ecran-veille')).toBeInTheDocument()
  })

  it('enchaîne les diapositives selon leur durée', async () => {
    renderSaver()
    await advance(30_000)
    expect(screen.getByText('Première diapo')).toBeInTheDocument()
    await advance(6_000)
    expect(screen.getByText('Deuxième diapo')).toBeInTheDocument()
    await advance(5_000)
    expect(screen.getByText('Première diapo')).toBeInTheDocument()
  })

  it('affiche les textes dans la langue de la borne, avec repli sur le français', async () => {
    renderSaver(ECRAN, 'es')
    await advance(30_000)
    expect(screen.getByText('Toque la pantalla')).toBeInTheDocument()
    expect(screen.getByText('Première diapo')).toBeInTheDocument()
  })

  it('hors plage horaire, ne se déclenche pas puis démarre quand la plage s\'ouvre', async () => {
    vi.setSystemTime(new Date(2026, 8, 23, 7, 58))
    renderSaver({ ...ECRAN, heureDebut: '08:00', heureFin: '20:00' })
    await advance(30_000)
    expect(screen.queryByTestId('ecran-veille')).toBeNull()

    await advance(120_000) // revérification chaque minute
    expect(screen.getByTestId('ecran-veille')).toBeInTheDocument()
  })

  it('ne fait rien sans écran de veille affecté', async () => {
    renderSaver(null)
    await advance(120_000)
    expect(screen.queryByTestId('ecran-veille')).toBeNull()
  })

  it('ne fait rien si aucune diapositive n\'est dans sa période de diffusion', async () => {
    renderSaver({ ...ECRAN, diapositives: [{ ...ECRAN.diapositives[0], dateDebut: '2027-01-01T00:00:00Z' }] })
    await advance(120_000)
    expect(screen.queryByTestId('ecran-veille')).toBeNull()
  })
})
