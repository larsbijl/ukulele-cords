/* global pdfjsLib, svguitar */

const WORKER_SRC = 'vendor/pdf.worker.min.js'
const CHORD_REGEX = /^[A-G](#|b)?(maj|min|madd|m\+|m|dim|aug|sus|add|M)?\d*(\/[A-G](#|b)?)?$/

const TUNINGS = {
  baritone: { labels: ['D', 'G', 'B', 'E'], file: 'chords.json' },
  standard: { labels: ['G', 'C', 'E', 'A'], file: 'chords_standard.json' },
}

let chordDicts = { baritone: [], standard: [] }
let currentTuning = 'baritone'
let lastTitle = ''
let lastChords = []

async function init() {
  pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_SRC

  const v = '?v=' + Date.now()
  ;[chordDicts.baritone, chordDicts.standard] = await Promise.all([
    fetch('chords.json' + v).then(r => r.json()),
    fetch('chords_standard.json' + v).then(r => r.json()),
  ])

  const params = new URLSearchParams(location.search)
  if (params.has('tuning') && TUNINGS[params.get('tuning')]) {
    currentTuning = params.get('tuning')
  }

  const selector = document.getElementById('tuning-selector')
  selector.value = currentTuning
  selector.addEventListener('change', () => {
    currentTuning = selector.value
    updateTuningLabel()
    if (lastChords.length) renderChords(lastTitle, lastChords)
  })

  updateTuningLabel()

  const dropZone = document.getElementById('drop-zone')
  const fileInput = document.getElementById('file-input')

  dropZone.addEventListener('dragover', e => {
    e.preventDefault()
    dropZone.classList.add('drag-over')
  })
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'))
  dropZone.addEventListener('drop', e => {
    e.preventDefault()
    dropZone.classList.remove('drag-over')
    const file = e.dataTransfer.files[0]
    if (file && file.type === 'application/pdf') loadPDF(file)
  })
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0]
    if (file) loadPDF(file)
  })

  document.getElementById('print-btn').addEventListener('click', () => window.print())
}

function updateTuningLabel() {
  const { labels } = TUNINGS[currentTuning]
  document.getElementById('tuning-label').textContent = labels.join(' ')
}

async function loadPDF(file) {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  const meta = await pdf.getMetadata().catch(() => null)
  let title = meta?.info?.Title || ''
  title = title.replace(/^Microsoft Word\s*-\s*/i, '').replace(/\.[a-z]{2,4}$/i, '').trim()
  if (!title) title = file.name.replace(/\.pdf$/i, '')

  let allText = ''
  const lines = []

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()

    allText += content.items.map(i => i.str).join('')

    const lineMap = new Map()
    for (const item of content.items) {
      const y = Math.round(item.transform[5])
      if (!lineMap.has(y)) lineMap.set(y, [])
      lineMap.get(y).push(item.str.trim())
    }
    for (const [, parts] of lineMap) {
      const line = parts.join(' ').trim()
      if (line) lines.push(line)
    }
  }

  const chords = extractChords(allText, lines)
  renderChords(title, chords)
}

function extractChords(allText, lines) {
  const found = new Set()

  const bracketRe = /\[([^\]]{1,12})\]/g
  let m
  while ((m = bracketRe.exec(allText)) !== null) {
    const token = m[1].split(/[\s/]/)[0]
    if (CHORD_REGEX.test(token)) found.add(token)
  }

  for (const line of lines) {
    const tokens = line.trim().split(/\s+/).filter(Boolean)
    if (tokens.length >= 1 && tokens.length <= 4 &&
        tokens.every(t => t.length <= 6 && CHORD_REGEX.test(t))) {
      tokens.forEach(t => found.add(t))
    }
  }

  return [...found].sort()
}

function renderChords(title, chords) {
  lastTitle = title
  lastChords = chords

  const dict = chordDicts[currentTuning]
  const tuningLabels = TUNINGS[currentTuning].labels

  const info = document.getElementById('song-info')
  const grid = document.getElementById('chord-grid')
  const printBtn = document.getElementById('print-btn')

  info.textContent = `${title} — ${chords.length} chord${chords.length !== 1 ? 's' : ''}`
  grid.innerHTML = ''
  printBtn.style.display = ''

  for (const name of chords) {
    const entry = dict.find(c => c.name === name)
    const card = document.createElement('div')
    card.className = 'chord-card' + (entry ? '' : ' unknown')

    const label = document.createElement('h3')
    label.textContent = name
    card.appendChild(label)

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    card.appendChild(svg)

    grid.appendChild(card)

    if (entry) {
      const fingers = entry.frets.map((f, i) => [4 - i, f])
      const nonZero = entry.frets.filter(f => f > 0)
      const maxFret = nonZero.length ? Math.max(...nonZero) : 0
      const minNonZero = nonZero.length ? Math.min(...nonZero) : 1
      const position = (minNonZero > 3) ? minNonZero : 1
      const fretCount = Math.max(4, maxFret - position + 2)

      const actualFrets = Math.min(fretCount, 6)
      const preH = Math.round(200 * (0.6 + actualFrets * 0.2))

      svg.setAttribute('width', '200')
      svg.setAttribute('height', String(preH))

      new svguitar.SVGuitarChord(svg)
        .configure({
          strings: 4,
          frets: actualFrets,
          position,
          tuning: tuningLabels,
          strokeColor: '#111',
          color: '#111',
          backgroundColor: 'transparent',
        })
        .chord({
          fingers,
          barres: entry.barres || [],
        })
        .draw()

      svg.style.width = '100%'
      const w = svg.getBoundingClientRect().width
      if (w) svg.style.height = Math.round(w * preH / 200) + 'px'
    } else {
      svg.setAttribute('viewBox', '0 0 100 120')
      svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      svg.innerHTML = `
        <rect x="5" y="5" width="90" height="110" rx="4" fill="#fff9ec" stroke="#f0a500" stroke-width="1.5"/>
        <text x="50" y="70" text-anchor="middle" font-size="36" fill="#f0a500">?</text>
      `
      const note = document.createElement('span')
      note.className = 'unknown-label'
      note.textContent = 'not in dictionary'
      card.appendChild(note)
    }
  }
}

init().then(() => {
  const params = new URLSearchParams(location.search)
  const rawText = params.get('text')
  if (rawText) {
    const lines = rawText.split('\n')
    const chords = extractChords(rawText, lines)
    renderChords('Photo', chords)
  }
})
