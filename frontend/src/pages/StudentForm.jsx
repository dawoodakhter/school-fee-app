import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'

const EMPTY = {
  name: '',
  rollNumber: '',
  classId: '',
  section: '',
  guardianName: '',
  contactNumber: '',
  gender: '',
  dateOfBirth: '',
  admissionDate: '',
  concession: '0',
  customFee: '',
}

// turn a student from the backend into text for the form boxes
function toForm(s) {
  return {
    name: s.name || '',
    rollNumber: s.rollNumber || '',
    classId: String(s.classId),
    section: s.section || '',
    guardianName: s.guardianName || '',
    contactNumber: s.contactNumber || '',
    gender: s.gender || '',
    dateOfBirth: s.dateOfBirth || '',
    admissionDate: s.admissionDate || '',
    concession: String(s.concession ?? 0),
    customFee: s.customFee ? String(s.customFee) : '',
  }
}

// turn the form text into what the backend expects (empty boxes become null)
function toBody(form) {
  const blank = (v) => (v.trim() === '' ? null : v.trim())
  return {
    name: form.name.trim(),
    rollNumber: form.rollNumber.trim(),
    classId: Number(form.classId),
    section: blank(form.section),
    guardianName: blank(form.guardianName),
    contactNumber: blank(form.contactNumber),
    gender: blank(form.gender),
    dateOfBirth: blank(form.dateOfBirth),
    admissionDate: blank(form.admissionDate),
    concession: Number(form.concession || 0),
    customFee: form.customFee.trim() === '' ? null : Number(form.customFee),
  }
}

// returns a message if something is wrong, or '' if the form is fine
function check(form) {
  if (!form.name.trim()) return 'Name is required'
  if (!form.rollNumber.trim()) return 'Roll number is required'
  if (!form.classId) return 'Choose a class'
  const concession = Number(form.concession || 0)
  if (!Number.isInteger(concession) || concession < 0) return 'Concession must be a whole number, 0 or more'
  if (form.customFee.trim() !== '') {
    const fee = Number(form.customFee)
    if (!Number.isInteger(fee) || fee <= 0) return 'Custom fee must be a whole number above 0, or leave it empty'
  }
  return ''
}

export default function StudentForm() {
  const { id } = useParams()
  return <FormView key={id || 'new'} id={id} />
}

function FormView({ id }) {
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const [classes, setClasses] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [original, setOriginal] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [c, s] = await Promise.all([api('/classes'), isEdit ? api(`/students/${id}`) : null])
        if (cancelled) return
        setClasses(c.classes)
        if (s) {
          setOriginal(toBody(toForm(s)))
          setForm(toForm(s))
        }
      } catch (err) {
        if (!cancelled) setLoadError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [id, isEdit])

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    const problem = check(form)
    if (problem) {
      setError(problem)
      return
    }
    const body = toBody(form)
    setBusy(true)
    try {
      if (isEdit) {
        // send only what you changed
        const changes = {}
        for (const key of Object.keys(body)) {
          if (body[key] !== original[key]) changes[key] = body[key]
        }
        if (Object.keys(changes).length === 0) {
          setError('Nothing was changed')
          return
        }
        await api(`/students/${id}`, { method: 'PUT', body: changes })
        navigate(`/students/${id}`)
      } else {
        const created = await api('/students', { method: 'POST', body })
        navigate(`/students/${created.id}`)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <main className="page"><p className="muted">Loading...</p></main>
  if (loadError) {
    return (
      <main className="page">
        <p className="error" role="alert">{loadError}</p>
        <p><Link to="/students">Back to all students</Link></p>
      </main>
    )
  }

  return (
    <main className="page">
      <p><Link to={isEdit ? `/students/${id}` : '/students'}>&larr; Back</Link></p>
      <h2>{isEdit ? 'Edit student' : 'Add student'}</h2>

      <form className="card form-grid" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="f-name">Name</label>
          <input id="f-name" value={form.name} onChange={set('name')} autoFocus />
        </div>
        <div>
          <label htmlFor="f-roll">Roll number</label>
          <input id="f-roll" value={form.rollNumber} onChange={set('rollNumber')} />
        </div>
        <div>
          <label htmlFor="f-class">Class</label>
          <select id="f-class" value={form.classId} onChange={set('classId')}>
            <option value="">Choose a class</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-section">Section</label>
          <input id="f-section" value={form.section} onChange={set('section')} />
        </div>
        <div>
          <label htmlFor="f-guardian">Guardian name</label>
          <input id="f-guardian" value={form.guardianName} onChange={set('guardianName')} />
        </div>
        <div>
          <label htmlFor="f-contact">Contact number</label>
          <input id="f-contact" value={form.contactNumber} onChange={set('contactNumber')} />
        </div>
        <div>
          <label htmlFor="f-gender">Gender</label>
          <select id="f-gender" value={form.gender} onChange={set('gender')}>
            <option value="">Not set</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>
        </div>
        <div>
          <label htmlFor="f-dob">Date of birth</label>
          <input id="f-dob" type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} />
        </div>
        <div>
          <label htmlFor="f-admission">Admission date</label>
          <input id="f-admission" type="date" value={form.admissionDate} onChange={set('admissionDate')} />
        </div>
        <div>
          <label htmlFor="f-concession">Concession (PKR off each month)</label>
          <input id="f-concession" inputMode="numeric" value={form.concession} onChange={set('concession')} />
        </div>
        <div>
          <label htmlFor="f-custom">Custom monthly fee (PKR)</label>
          <input
            id="f-custom"
            inputMode="numeric"
            placeholder="Leave empty to use the class fee"
            value={form.customFee}
            onChange={set('customFee')}
          />
        </div>

        {error && <p className="error form-wide" role="alert">{error}</p>}

        <div className="form-wide">
          <button type="submit" disabled={busy}>{busy ? 'Saving...' : isEdit ? 'Save changes' : 'Add student'}</button>
        </div>
      </form>
    </main>
  )
}