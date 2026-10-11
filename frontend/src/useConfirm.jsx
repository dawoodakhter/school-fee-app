import { useCallback, useRef, useState } from 'react'
import Dialog from './components/Dialog'

// Use it like this:
//   const [ask, dialog] = useConfirm()
//   if (!(await ask({ message: 'Are you sure?' }))) return
// and put {dialog} once inside the page's returned JSX.
export default function useConfirm() {
  const [state, setState] = useState(null)
  const resolver = useRef(null)

  const ask = useCallback(
    (options) =>
      new Promise((resolve) => {
        resolver.current = resolve
        setState(options)
      }),
    [],
  )

  function finish(value) {
    setState(null)
    if (resolver.current) resolver.current(value)
    resolver.current = null
  }

  const dialog = state ? (
    <Dialog
      title={state.title || 'Are you sure?'}
      message={state.message}
      confirmText={state.confirmText || 'Yes'}
      danger={state.danger}
      onConfirm={() => finish(true)}
      onCancel={() => finish(false)}
    />
  ) : null

  return [ask, dialog]
}