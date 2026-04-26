import { createContext, useContext, useReducer, useMemo } from 'react'

const FormContext = createContext(null)

const initial = {
  config:      null,   // full API response { version, formDefinition }
  values:      {},     // { [fieldId]: string | string[] }
  currentStep: 0,
  submitting:  false,
  result:      null,   // { ok, data?, offline?, error? }
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_CONFIG':
      return { ...state, config: action.config }
    case 'SET_VALUE':
      return { ...state, values: { ...state.values, [action.fieldId]: action.value } }
    case 'SET_STEP':
      return { ...state, currentStep: Math.max(0, action.step) }
    case 'SET_SUBMITTING':
      return { ...state, submitting: action.value }
    case 'SET_RESULT':
      return { ...state, result: action.result }
    case 'RESET':
      return { ...initial }
    default:
      return state
  }
}

export function FormProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initial)

  const allSteps = useMemo(() => {
    if (!state.config?.formDefinition?.categories) return []
    return state.config.formDefinition.categories.flatMap(cat =>
      cat.subcategories.map(sub => ({
        ...sub,
        categoryName: cat.name,
        categoryId:   cat.id,
        totalInCat:   cat.subcategories.length,
      }))
    )
  }, [state.config])

  const currentSub = allSteps[state.currentStep] ?? null

  const isStepValid = useMemo(() => {
    if (!currentSub) return true
    return currentSub.fields.every(f => {
      if (!f.required) return true
      const v = state.values[f.id]
      if (v === undefined || v === null || v === '') return false
      if (Array.isArray(v) && v.length === 0) return false
      return true
    })
  }, [currentSub, state.values])

  const ctx = {
    ...state,
    allSteps,
    currentSub,
    isStepValid,
    totalSteps: allSteps.length,
    setValue:  (fieldId, value) => dispatch({ type: 'SET_VALUE', fieldId, value }),
    nextStep:  ()               => dispatch({ type: 'SET_STEP',  step: state.currentStep + 1 }),
    prevStep:  ()               => dispatch({ type: 'SET_STEP',  step: state.currentStep - 1 }),
    setConfig: (config)         => dispatch({ type: 'SET_CONFIG', config }),
    setResult: (result)         => dispatch({ type: 'SET_RESULT', result }),
    setSubmitting: (v)          => dispatch({ type: 'SET_SUBMITTING', value: v }),
    reset:     ()               => dispatch({ type: 'RESET' }),
  }

  return <FormContext.Provider value={ctx}>{children}</FormContext.Provider>
}

export function useForm() {
  const ctx = useContext(FormContext)
  if (!ctx) throw new Error('useForm must be inside FormProvider')
  return ctx
}
