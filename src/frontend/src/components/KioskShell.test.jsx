/**
 * KioskShell.test.jsx
 *
 * Unit tests for KioskShell component (Task 14.11).
 *
 * Test coverage:
 *  - Browser path: enterKiosk called on mount
 *  - Android WebView path: enterKiosk called on mount
 *  - 5-second press-and-hold gesture reveals exit button
 *  - Exit modal opens and handles correct/wrong password
 *  - Exit lockout after 3 wrong attempts
 *  - F11/Escape prevention (browser only)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import KioskShell from './KioskShell'

// ─── Mock kioskService ────────────────────────────────────────────────────────

const mockEnterKiosk = vi.fn().mockResolvedValue(undefined)
const mockExitKiosk = vi.fn().mockResolvedValue(undefined)
const mockValidateExitPassword = vi.fn()
const mockIsAndroidWebView = vi.fn(() => false)

vi.mock('../services/kioskService', () => ({
  enterKiosk: () => mockEnterKiosk(),
  exitKiosk: () => mockExitKiosk(),
  validateExitPassword: (pwd) => mockValidateExitPassword(pwd),
  isAndroidWebView: () => mockIsAndroidWebView(),
}))

// ─── Test Wrapper ─────────────────────────────────────────────────────────────

function TestWrapper({ children }) {
  return <BrowserRouter>{children}</BrowserRouter>
}

// ─── Helper: trigger 5-second hold to reveal exit button ─────────────────────

function triggerHoldGesture() {
  const holdZone = screen.getByTestId('kiosk-hold-zone')
  act(() => {
    fireEvent.mouseDown(holdZone)
    vi.advanceTimersByTime(5000)
  })
}

// ─── Helper: open the exit modal ─────────────────────────────────────────────

function openExitModal() {
  triggerHoldGesture()
  act(() => {
    fireEvent.click(screen.getByTestId('kiosk-exit-button'))
  })
}

// ─── Helper: submit password ──────────────────────────────────────────────────

async function submitPassword(password) {
  const input = screen.getByTestId('exit-modal-password-input')
  act(() => {
    fireEvent.change(input, { target: { value: password } })
  })
  await act(async () => {
    fireEvent.submit(input.closest('form'))
  })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('KioskShell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  // ── Test 1: Browser path — enterKiosk called on mount ────────────────────────

  it('calls enterKiosk on mount (browser path)', () => {
    mockIsAndroidWebView.mockReturnValue(false)

    render(
      <TestWrapper>
        <KioskShell>
          <div>Test Content</div>
        </KioskShell>
      </TestWrapper>
    )

    expect(mockEnterKiosk).toHaveBeenCalledTimes(1)
  })

  // ── Test 2: Android WebView path — enterKiosk called on mount ────────────────

  it('calls enterKiosk on mount (Android WebView path)', () => {
    mockIsAndroidWebView.mockReturnValue(true)

    render(
      <TestWrapper>
        <KioskShell>
          <div>Test Content</div>
        </KioskShell>
      </TestWrapper>
    )

    expect(mockEnterKiosk).toHaveBeenCalledTimes(1)
  })

  // ── Test 3: 5-second press-and-hold reveals exit button ──────────────────────

  it('reveals exit button after 5-second hold on hidden corner', () => {
    mockIsAndroidWebView.mockReturnValue(false)

    render(
      <TestWrapper>
        <KioskShell>
          <div>Test Content</div>
        </KioskShell>
      </TestWrapper>
    )

    // Exit button should not be visible before hold
    expect(screen.queryByTestId('kiosk-exit-button')).not.toBeInTheDocument()

    triggerHoldGesture()

    // Exit button should now be visible
    expect(screen.getByTestId('kiosk-exit-button')).toBeInTheDocument()
  })

  // ── Test 4: Hold released before 5s — exit button NOT revealed ───────────────

  it('does NOT reveal exit button if hold is released before 5 seconds', () => {
    mockIsAndroidWebView.mockReturnValue(false)

    render(
      <TestWrapper>
        <KioskShell>
          <div>Test Content</div>
        </KioskShell>
      </TestWrapper>
    )

    const holdZone = screen.getByTestId('kiosk-hold-zone')
    act(() => {
      fireEvent.mouseDown(holdZone)
      vi.advanceTimersByTime(2000)
      fireEvent.mouseUp(holdZone)
      vi.advanceTimersByTime(5000)
    })

    expect(screen.queryByTestId('kiosk-exit-button')).not.toBeInTheDocument()
  })

  // ── Test 5: Exit button opens modal ───────────────────────────────────────────

  it('opens exit modal when exit button is clicked', () => {
    mockIsAndroidWebView.mockReturnValue(false)

    render(
      <TestWrapper>
        <KioskShell>
          <div>Test Content</div>
        </KioskShell>
      </TestWrapper>
    )

    openExitModal()

    expect(screen.getByTestId('kiosk-exit-modal')).toBeInTheDocument()
  })

  // ── Test 6: Correct password → exitKiosk called ──────────────────────────────

  it('calls exitKiosk on correct password', async () => {
    mockIsAndroidWebView.mockReturnValue(false)
    mockValidateExitPassword.mockResolvedValue(true)

    render(
      <TestWrapper>
        <KioskShell>
          <div>Test Content</div>
        </KioskShell>
      </TestWrapper>
    )

    openExitModal()
    await submitPassword('correct-password')

    expect(mockValidateExitPassword).toHaveBeenCalledWith('correct-password')
    expect(mockExitKiosk).toHaveBeenCalledTimes(1)
  })

  // ── Test 7: Wrong password → error message shown ─────────────────────────────

  it('shows error message on wrong password', async () => {
    mockIsAndroidWebView.mockReturnValue(false)
    mockValidateExitPassword.mockResolvedValue(false)

    render(
      <TestWrapper>
        <KioskShell>
          <div>Test Content</div>
        </KioskShell>
      </TestWrapper>
    )

    openExitModal()
    await submitPassword('wrong-password')

    expect(screen.getByTestId('exit-modal-error')).toBeInTheDocument()
    expect(screen.getByText(/Mot de passe incorrect/i)).toBeInTheDocument()
  })

  // ── Test 8: Exit lockout after 3 wrong attempts ──────────────────────────────

  it('locks out after 3 wrong password attempts', async () => {
    mockIsAndroidWebView.mockReturnValue(false)
    mockValidateExitPassword.mockResolvedValue(false)

    render(
      <TestWrapper>
        <KioskShell>
          <div>Test Content</div>
        </KioskShell>
      </TestWrapper>
    )

    openExitModal()

    // Attempt 1
    await submitPassword('wrong1')
    expect(screen.getByText(/2 tentative\(s\) restante\(s\)/i)).toBeInTheDocument()

    // Attempt 2
    await submitPassword('wrong2')
    expect(screen.getByText(/1 tentative\(s\) restante\(s\)/i)).toBeInTheDocument()

    // Attempt 3 — triggers lockout
    await submitPassword('wrong3')

    expect(screen.getByText(/Trop de tentatives/i)).toBeInTheDocument()
    expect(screen.getByTestId('exit-modal-countdown')).toBeInTheDocument()
    expect(screen.getByTestId('exit-modal-submit')).toBeDisabled()
  })

  // ── Test 9: Lockout unlocks after 5 minutes ───────────────────────────────────

  it('unlocks after 5-minute lockout period', async () => {
    mockIsAndroidWebView.mockReturnValue(false)
    mockValidateExitPassword.mockResolvedValue(false)

    render(
      <TestWrapper>
        <KioskShell>
          <div>Test Content</div>
        </KioskShell>
      </TestWrapper>
    )

    openExitModal()

    // Trigger 3 wrong attempts to lock
    await submitPassword('wrong1')
    await submitPassword('wrong2')
    await submitPassword('wrong3')

    // Verify locked
    expect(screen.getByTestId('exit-modal-submit')).toBeDisabled()

    // Advance 5 minutes + 1 second
    act(() => {
      vi.advanceTimersByTime(5 * 60 * 1000 + 1000)
    })

    // Should be unlocked
    expect(screen.getByTestId('exit-modal-submit')).not.toBeDisabled()
    expect(screen.queryByTestId('exit-modal-countdown')).not.toBeInTheDocument()
  })

  // ── Test 10: F11 and Escape prevention (browser only) ────────────────────────

  it('prevents F11 and Escape key default behavior in browser', () => {
    mockIsAndroidWebView.mockReturnValue(false)

    render(
      <TestWrapper>
        <KioskShell>
          <div>Test Content</div>
        </KioskShell>
      </TestWrapper>
    )

    const f11Event = new KeyboardEvent('keydown', { key: 'F11', bubbles: true, cancelable: true })
    const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })

    const f11Spy = vi.spyOn(f11Event, 'preventDefault')
    const escapeSpy = vi.spyOn(escapeEvent, 'preventDefault')

    document.dispatchEvent(f11Event)
    document.dispatchEvent(escapeEvent)

    expect(f11Spy).toHaveBeenCalled()
    expect(escapeSpy).toHaveBeenCalled()
  })

  // ── Test 11: No keydown listener in Android WebView ──────────────────────────

  it('does not add keydown listener in Android WebView', () => {
    mockIsAndroidWebView.mockReturnValue(true)

    const addEventListenerSpy = vi.spyOn(document, 'addEventListener')

    render(
      <TestWrapper>
        <KioskShell>
          <div>Test Content</div>
        </KioskShell>
      </TestWrapper>
    )

    // Should not add keydown listener in Android WebView
    const keydownCalls = addEventListenerSpy.mock.calls.filter(
      ([event, , capture]) => event === 'keydown' && capture === true
    )
    expect(keydownCalls).toHaveLength(0)
  })
})
