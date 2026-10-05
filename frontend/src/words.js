// Writes a number in words the Pakistani way: Thousand, Lakh (100,000), Crore (10,000,000).
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function below100(n) {
  if (n < 20) return ONES[n]
  return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '')
}

function below1000(n) {
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  return [hundreds ? ONES[hundreds] + ' Hundred' : '', rest ? below100(rest) : ''].filter(Boolean).join(' ')
}

export function amountInWords(amount) {
  const n = Math.floor(Number(amount))
  if (!Number.isFinite(n) || n < 0 || n >= 1000000000) return String(amount) // too big or not a number: show the digits
  if (n === 0) return 'Zero'
  let rest = n
  const crore = Math.floor(rest / 10000000)
  rest %= 10000000
  const lakh = Math.floor(rest / 100000)
  rest %= 100000
  const thousand = Math.floor(rest / 1000)
  rest %= 1000
  return [
    crore ? below100(crore) + ' Crore' : '',
    lakh ? below100(lakh) + ' Lakh' : '',
    thousand ? below100(thousand) + ' Thousand' : '',
    rest ? below1000(rest) : '',
  ]
    .filter(Boolean)
    .join(' ')
}