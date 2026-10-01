import { statusLabel } from '../format'

export default function Badge({ status }) {
  return <span className={'badge s-' + String(status).replace('/', '')}>{statusLabel(status)}</span>
}