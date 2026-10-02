import { useState } from 'react'
import OwedReport from '../components/OwedReport'
import ReceivedReport from '../components/ReceivedReport'

export default function Reports() {
  const [tab, setTab] = useState('owed')

  return (
    <main className="page">
      <h2 className="no-print">Reports</h2>

      <div className="tabs no-print" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'owed'}
          className={tab === 'owed' ? 'tab active' : 'tab'}
          onClick={() => setTab('owed')}
        >
          Fees owed
        </button>
        <button
          role="tab"
          aria-selected={tab === 'received'}
          className={tab === 'received' ? 'tab active' : 'tab'}
          onClick={() => setTab('received')}
        >
          Payments received
        </button>
      </div>

      {tab === 'owed' ? <OwedReport /> : <ReceivedReport />}
    </main>
  )
}