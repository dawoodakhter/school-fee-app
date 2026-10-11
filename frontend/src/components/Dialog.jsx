import { useEffect, useState } from 'react'

// A simple pop-up. If askReason is true, the person must type a reason before confirming.
export default function Dialog({ title, message, askReason, confirmText = 'OK', danger, onConfirm, onCancel }) {
  const [text, setText] = useState('')
  const [problem, setProblem] = useState('')

  useEffect(() => {
    const close = (e) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onCancel])

  function submit() {
    if (askReason && text.trim().length < 3) {
      setProblem('Please write a reason (at least 3 letters)')
      return
    }
    onConfirm(text.trim())
  }

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div className="dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>{message}</p>
        {askReason && (
          <>
            <label htmlFor="dialog-reason">Reason</label>
            <input
              id="dialog-reason"
              autoFocus
              value={text}
              placeholder="For example: entered the wrong amount"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </>
        )}
        {problem && <p className="error" role="alert">{problem}</p>}
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={onCancel}>Go back</button>
          <button type="button" className={danger ? 'danger' : ''} onClick={submit}>{confirmText}</button>
        </div>
      </div>
    </div>
  )
}