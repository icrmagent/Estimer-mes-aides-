import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { FormProvider } from './context/FormContext'
import { WelcomePage } from './pages/WelcomePage'
import { FormPage } from './pages/FormPage'
import { ConfirmationPage } from './pages/ConfirmationPage'
import { PhoneInputDemo } from './pages/PhoneInputDemo'

export default function App() {
  return (
    <div className="app-container">
      <BrowserRouter>
        <FormProvider>
          <Routes>
            <Route path="/"             element={<WelcomePage />} />
            <Route path="/form"         element={<FormPage />} />
            <Route path="/confirmation" element={<ConfirmationPage />} />
            <Route path="/phone-demo"   element={<PhoneInputDemo />} />
          </Routes>
        </FormProvider>
      </BrowserRouter>
    </div>
  )
}
