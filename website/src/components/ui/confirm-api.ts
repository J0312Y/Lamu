import { createContext, useContext } from 'react'

export interface ConfirmOptions {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

export const ConfirmContext = createContext<{ confirm: ConfirmFn }>({ confirm: () => Promise.resolve(false) })

let globalConfirm: ConfirmFn | null = null

/** Called by ConfirmProvider so `confirmDialog()` works outside React components. */
export function setConfirmHandler(fn: ConfirmFn | null) { globalConfirm = fn }

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  if (globalConfirm) return globalConfirm(options)
  return Promise.resolve(window.confirm(options.message))
}

export function useConfirm() { return useContext(ConfirmContext) }
