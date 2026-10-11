import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { downloadCsv, toCsv } from '../csv'
import { parseCsv } from '../csvParse'
import { COLUMNS, EXPORT_COLUMNS, LABELS, readTable } from '../studentColumns'
import { today } from '../format'
import useConfirm from '../useConfirm'

const MAX_ROWS = 3000
const SHOW = 100

const show = (v) => (v === null || v === undefined || v === '' ? '(empty)' : String(v))

export default function ImportStudents() {
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState(null)
  const [check, setCheck] = useState(null)
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState('')
  const [done, setDone] = useState(null)
    const [ask, dialog] = useConfirm()

  function reset() {
    setFileName('')
    setParsed(null)
    setCheck(null)
    setProblem('')
    setDone(null)
  }

  async function exportStudents() {
    setProblem('')
    setBusy('exporting')
    try {
      const data = await api('/students/export')
      downloadCsv(`students-${today()}.csv`, toCsv(EXPORT_COLUMNS, data.students))
    } catch (err) {
      setProblem(err.message)
    } finally {
      setBusy('')
    }
  }

  function downloadTemplate() {
    downloadCsv('students-template.csv', toCsv(EXPORT_COLUMNS, []))
  }

  async function runCheck(rows) {
    setBusy('checking')
    try {
      const answer = await api('/students/import', { method: 'POST', body: { rows, dryRun: true } })
      setCheck(answer)
    } catch (err) {
      setProblem(err.message)
    } finally {
      setBusy('')
    }
  }

  async function chooseFile(event) {
    const file = event.target.files[0]
    if (!file) return
    reset()
    setFileName(file.name)

    if (/\.xlsx?$/i.test(file.name)) {
      setProblem('This is an Excel file. In Excel choose File, Save As, then "CSV UTF-8 (Comma delimited)", and choose that new file here.')
      return
    }
    const text = await file.text()
    if (text.startsWith('PK')) {
      setProblem('This looks like an Excel file, not a CSV file. In Excel choose File, Save As, then "CSV UTF-8 (Comma delimited)".')
      return
    }
    const result = readTable(parseCsv(text))
    if (result.problem) {
      setProblem(result.problem)
      return
    }
    if (result.rows.length > MAX_ROWS) {
      setProblem(`The file has ${result.rows.length} rows. Import at most ${MAX_ROWS} at a time.`)
      return
    }
    setParsed(result)
    await runCheck(result.rows)
  }

  async function apply() {
    const { create, update } = check.summary
       const ok = await ask({
      title: 'Save these changes?',
      message:
        `Save ${create} new ${create === 1 ? 'student' : 'students'} and ${update} ${update === 1 ? 'update' : 'updates'}?\n\n` +
        'Tip: you can download a backup in Settings first.',
      confirmText: 'Save changes',
    })
    if (!ok) return
    setProblem('')
    setBusy('saving')
    try {
      const result = await api('/students/import', { method: 'POST', body: { rows: parsed.rows, dryRun: false } })
      setDone(result)
      setCheck(null)
      setParsed(null)
    } catch (err) {
      setProblem(err.message)
      await runCheck(parsed.rows) // show what is wrong now
    } finally {
      setBusy('')
    }
  }

  const summary = check ? check.summary : null
  const problems = check ? check.rows.filter((r) => r.action === 'error') : []
  const changes = check ? check.rows.filter((r) => r.action === 'create' || r.action === 'update') : []
  const canApply = summary && summary.errors === 0 && summary.create + summary.update > 0

  return (
    <main className="page">
      <p><Link to="/students">&larr; All students</Link></p>
      <h2>Import and export students</h2>

      <div className="card">
        <ol className="steps">
          <li>
            <strong>Download</strong> your students as a spreadsheet, or an empty template for new students.
            <div className="report-actions">
              <button onClick={exportStudents} disabled={busy === 'exporting'}>
                {busy === 'exporting' ? 'Preparing...' : 'Download all students'}
              </button>
              <button className="secondary" onClick={downloadTemplate}>Download empty template</button>
            </div>
          </li>
          <li>
            Open it in <strong>Excel</strong>, fill in or change what you need, and save it as{' '}
            <strong>CSV UTF-8 (Comma delimited)</strong>.
          </li>
          <li>
            <strong>Choose</strong> the saved file below. You see a preview first. Nothing is saved until you press Apply.
          </li>
        </ol>
        <ul className="muted tips">
          <li>An empty cell never changes anything. To change a value, type the new one.</li>
          <li>Don't change the ID column. A row without an ID is found by its Class and Roll number, or added as a new student.</li>
          <li>A new student needs a Name, a Class and a Roll number. Write the Status as Left to mark a student as left.</li>
          <li>Write dates like 2020-05-01. If Excel changes them, check the preview carefully.</li>
          <li>Column names: {COLUMNS.map((c) => c.label).join(', ')}.</li>
        </ul>
      </div>

      <h3>Your file</h3>
      <div className="card">
        <label htmlFor="import-file">Choose your file</label>
        <input id="import-file" type="file" accept=".csv,text/csv,text/plain" onChange={chooseFile} />
        {fileName && <p className="muted">File: {fileName}</p>}
      </div>

      {problem && <p className="error" role="alert">{problem}</p>}
      {busy === 'checking' && <p className="muted">Checking the file...</p>}
      {busy === 'saving' && <p className="muted">Saving... this can take a minute for many students.</p>}

      {done && (
        <p className="success" role="status">
          Done: {done.created} new {done.created === 1 ? 'student' : 'students'} added, {done.updated}{' '}
          {done.updated === 1 ? 'student' : 'students'} updated. <Link to="/students">See the students</Link>
        </p>
      )}

      {parsed && parsed.unknown.length > 0 && (
        <p className="muted">These columns are not used and were ignored: {parsed.unknown.join(', ')}.</p>
      )}

      {summary && (
        <>
          <div className="cards">
            <div className="card stat"><span className="muted">New students</span><strong>{summary.create}</strong></div>
            <div className="card stat"><span className="muted">Updates</span><strong>{summary.update}</strong></div>
            <div className="card stat"><span className="muted">Nothing to change</span><strong>{summary.unchanged}</strong></div>
            <div className="card stat"><span className="muted">Problems</span><strong className={summary.errors ? 'bad' : 'good'}>{summary.errors}</strong></div>
          </div>

          {summary.errors > 0 && (
            <>
              <h3>Problems to fix</h3>
              <p className="muted">Fix these in the spreadsheet, save it again, and choose the file again. Nothing has been changed.</p>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Row</th><th>Student</th><th>Problem</th></tr></thead>
                  <tbody>
                    {problems.slice(0, SHOW).map((r) => (
                      <tr key={r.line}>
                        <td>{r.line}</td>
                        <td>{r.name || '-'}</td>
                        <td>{r.errors.join('. ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {problems.length > SHOW && <p className="muted">...and {problems.length - SHOW} more.</p>}
            </>
          )}

          {changes.length > 0 && (
            <>
              <h3>What will change</h3>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Row</th><th>Student</th><th>Class</th><th>Change</th></tr></thead>
                  <tbody>
                    {changes.slice(0, SHOW).map((r) => (
                      <tr key={r.line}>
                        <td>{r.line}</td>
                        <td>{r.name}</td>
                        <td>{r.class}</td>
                        <td>
                          {r.action === 'create'
                            ? <span className="badge s-upcoming">New student</span>
                            : r.changes.map((c) => (
                                <div key={c.field}>{LABELS[c.field] || c.field}: {show(c.from)} &rarr; {show(c.to)}</div>
                              ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {changes.length > SHOW && <p className="muted">...and {changes.length - SHOW} more rows.</p>}
            </>
          )}

          <div className="report-actions">
            <button onClick={apply} disabled={!canApply || busy !== ''}>
              Apply {summary.create + summary.update} {summary.create + summary.update === 1 ? 'change' : 'changes'}
            </button>
            <button className="secondary" onClick={reset}>Choose another file</button>
          </div>
        </>
      )}

      {done && <button className="secondary" onClick={reset}>Import another file</button>}
         {dialog}
    </main>
  )
}