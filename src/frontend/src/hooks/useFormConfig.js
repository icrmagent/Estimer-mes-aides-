import { useState, useEffect } from 'react'
import { fetchConfiguration } from '../services/api'

export function useFormConfig() {
  const [config,  setConfig]  = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    fetchConfiguration()
      .then(setConfig)
      .catch(err => {
        const cached = localStorage.getItem('ema_config')
        if (cached) {
          setConfig(JSON.parse(cached))
        } else {
          setError(err.message || 'Impossible de charger la configuration')
        }
      })
      .finally(() => setLoading(false))
  }, [])

  return { config, loading, error }
}
