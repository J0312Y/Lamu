import { createContext, useContext } from 'react'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

type ToastFn = (message: string, type?: ToastType) => void

export const ToastContext = createContext<{ toast: ToastFn }>({ toast: () => {} })

let globalToast: ToastFn | null = null

/** Called by ToastProvider so `toast()` works outside React components. */
export function setToastHandler(fn: ToastFn | null) { globalToast = fn }

export function toast(message: string, type: ToastType = 'info') {
  globalToast?.(message, type)
}

export function useToast() { return useContext(ToastContext) }
