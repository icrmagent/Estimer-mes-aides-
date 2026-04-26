import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { FormProvider } from './context/FormContext'
import { WelcomePage } from './pages/WelcomePage'
import { FormPage } from './pages/FormPage'
import { ConfirmationPage } from './pages/ConfirmationPage'

export default function App() {
  return (
    <BrowserRouter>
      <FormProvider>
        <Routes>
          <Route path="/"             element={<WelcomePage />} />
          <Route path="/form"         element={<FormPage />} />
          <Route path="/confirmation" element={<ConfirmationPage />} />
        </Routes>
      </FormProvider>
    </BrowserRouter>
  )
}
