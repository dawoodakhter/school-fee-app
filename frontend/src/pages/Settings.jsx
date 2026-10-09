import SchoolPanel from '../components/SchoolPanel'
import ClassesPanel from '../components/ClassesPanel'
import BillingPanel from '../components/BillingPanel'
import PasswordPanel from '../components/PasswordPanel'
import BackupPanel from '../components/BackupPanel'
import NewSessionPanel from '../components/NewSessionPanel'

export default function Settings() {
  return (
    <main className="page">
      <h2>Settings</h2>
      <SchoolPanel />
      <ClassesPanel />
      <BillingPanel />
      <PasswordPanel />
      <BackupPanel />
      <NewSessionPanel />
    </main>
  )
}