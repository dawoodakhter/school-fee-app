import { useState } from 'react'
import { api } from '../api'
import { downloadFile } from '../csv'
import { today } from '../format'

const LAST_KEY = 'fee_last_backup'

export default function BackupPanel() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [last, setLast] = useState(() => localStorage.getItem(LAST_KEY) || '')

  async function download() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const data = await api('/backup')
      const name = `school-fee-backup-${today()}.json`
      downloadFile(name, JSON.stringify(data, null, 2), 'application/json')
      localStorage.setItem(LAST_KEY, today())
      setLast(today())
      setMessage(`Saved ${name}: ${data.counts.students} students, ${data.counts.payments} payments.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h3>Backup</h3>
      <div className="card">
        <p>
          Saves all your students, fees and payments in one file. If the computer breaks or something is deleted by
          mistake, this file brings everything back.
        </p>
        <p className="muted">
          Make a backup at least once a week, and after a busy fee day. Keep copies somewhere safe, like a USB stick or
          Google Drive. The file has no passwords in it, but it does have the students' names, so keep it private.
        </p>
        <button onClick={download} disabled={busy}>{busy ? 'Preparing...' : 'Download backup'}</button>
        <p className="muted" data-testid="last-backup">
          {last ? `Last backup made from this computer: ${last}` : 'No backup has been made from this computer yet.'}
        </p>
        {error && <p className="error" role="alert">{error}</p>}
        {message && <p className="success" role="status">{message}</p>}
      </div>
    </section>
  )
}