import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FieldRenderer from './FieldRenderer.jsx'
import { PhoneInput } from './PhoneInput.jsx'

/**
 * Règle projet n°9 côté client : le message de format doit être visible et
 * traduit, et le téléphone doit être remonté au format E.164.
 */

const questionCp = {
  id: 'q-cp',
  typeOption: 'texte_court',
  crmFieldIds: [2089],
  libelleQuestion: { fr: 'Code Postal', es: 'Código postal', en: 'Postal code' },
  options: null,
}

const questionTel = {
  id: 'q-tel',
  typeOption: 'telephone',
  crmFieldIds: [2015],
  libelleQuestion: { fr: 'Num. de Téléphone', es: 'Núm. de Teléfono', en: 'Phone number' },
  options: null,
}

describe('FieldRenderer — affichage du message de format', () => {
  it("n'affiche aucune alerte quand il n'y a pas d'erreur", () => {
    render(
      <FieldRenderer question={questionCp} value="75001" onChange={() => {}} langue="fr" />
    )
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByLabelText('Code Postal')).not.toHaveAttribute('aria-invalid')
  })

  it("affiche le message d'erreur et marque le champ aria-invalid", () => {
    render(
      <FieldRenderer
        question={questionCp}
        value="TEST AUDIT"
        onChange={() => {}}
        langue="fr"
        error="Code postal invalide (format attendu : 12345)"
      />
    )
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Code postal invalide (format attendu : 12345)')

    const input = screen.getByLabelText('Code Postal')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAttribute('aria-describedby', 'err-q-cp')
    expect(alert).toHaveAttribute('id', 'err-q-cp')
  })

  it('ne modifie pas la taille de saisie mobile-first (classe pf-input conservée)', () => {
    render(
      <FieldRenderer
        question={questionCp}
        value="TEST AUDIT"
        onChange={() => {}}
        langue="fr"
        error="Code postal invalide"
      />
    )
    expect(screen.getByLabelText('Code Postal')).toHaveClass('pf-input')
  })

  it('le champ téléphone reçoit le pays de la borne comme indicatif par défaut', () => {
    render(
      <FieldRenderer
        question={questionTel}
        value=""
        onChange={() => {}}
        langue="fr"
        countryCode="ES"
      />
    )
    expect(screen.getByRole('button', { name: /Espagne/ })).toBeInTheDocument()
  })
})

describe('PhoneInput — remontée au format E.164', () => {
  it('remonte "+33612345678" et non "+33 0612345678"', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<PhoneInput onChange={onChange} defaultCountry="FR" />)

    const input = document.querySelector('input[type="tel"]')
    await user.type(input, '0612345678')

    expect(onChange).toHaveBeenLastCalledWith('+33612345678')
    // Aucun appel ne doit avoir laissé passer le 0 national derrière l'indicatif.
    expect(onChange.mock.calls.some(([v]) => v === '+33 0612345678')).toBe(false)
  })

  it('remonte la valeur brute tant que la saisie est incomplète', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<PhoneInput onChange={onChange} defaultCountry="FR" />)

    const input = document.querySelector('input[type="tel"]')
    await user.type(input, '06')

    expect(onChange).toHaveBeenLastCalledWith('+33 06')
  })
})
