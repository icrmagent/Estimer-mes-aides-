import { useState } from 'react'
import { PhoneInput } from '../components/PhoneInput'

export function PhoneInputDemo() {
  const [value, setValue] = useState('')

  return (
    <div style={{ minHeight: '100vh', background: '#f5f0ff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: 32, maxWidth: 420, width: '100%', boxShadow: '0 8px 32px rgba(92,45,211,.12)' }}>
        <h2 style={{ fontFamily: 'Nunito, sans-serif', color: '#5c2dd3', marginTop: 0, marginBottom: 24 }}>
          Démo — PhoneInput
        </h2>

        <label style={{ fontFamily: 'Nunito, sans-serif', fontSize: 14, fontWeight: 700, color: '#1a1230', display: 'block', marginBottom: 8 }}>
          Numéro de téléphone
        </label>

        {/* Usage basique */}
        <PhoneInput
          defaultCountry="FR"
          placeholder="06 00 00 00 00"
          onChange={setValue}
        />

        {value && (
          <p style={{ fontFamily: 'Nunito, sans-serif', fontSize: 13, color: '#8b7dae', marginTop: 12 }}>
            Valeur : <strong style={{ color: '#5c2dd3' }}>{value}</strong>
          </p>
        )}

        <hr style={{ margin: '28px 0', borderColor: '#e2dff0' }} />

        <label style={{ fontFamily: 'Nunito, sans-serif', fontSize: 14, fontWeight: 700, color: '#1a1230', display: 'block', marginBottom: 8 }}>
          Avec pays par défaut US
        </label>

        <PhoneInput
          defaultCountry="US"
          placeholder="(555) 000-0000"
          onChange={() => {}}
        />
      </div>
    </div>
  )
}
