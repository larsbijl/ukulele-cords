/* global svguitar */

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

}

function updateTuningLabel() {
  const { labels } = TUNINGS[currentTuning]
  document.getElementById('tuning-label').textContent = labels.join(' ')
}

function extractChords(allText, lines) {
  const found = new Set()

  const bracketRe = /[\[(]([^\]){]{1,12})[)\]]/g
  let m
  while ((m = bracketRe.exec(allText)) !== null) {
    const token = m[1].split(/[\s/]/)[0]
    if (CHORD_REGEX.test(token)) found.add(token)
  }

  for (const line of lines) {
    const tokens = line.trim().split(/\s+/).filter(Boolean)
      .map(t => t.replace(/^[\[(]|[)\]]$/g, ''))
    if (tokens.length >= 1 &&
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

  const IMPORTANCE_RANK = { 'Essential': 4, 'Frequently used': 3, 'Occasionally used': 2, 'Rarely used': 1 }

  const info = document.getElementById('song-info')
  const grid = document.getElementById('chord-grid')

  const entryMap = new Map(dict.map(c => [c.name, c]))
  const known = chords.filter(name => entryMap.has(name))
  info.textContent = `${title} — ${known.length} chord${known.length !== 1 ? 's' : ''}`
  grid.innerHTML = ''

  const sorted = [...known].sort((a, b) => {
    const ea = entryMap.get(a)
    const eb = entryMap.get(b)
    const da = ea?.difficulty ?? 0
    const db = eb?.difficulty ?? 0
    if (db !== da) return db - da
    const ia = IMPORTANCE_RANK[ea?.importance] ?? 0
    const ib = IMPORTANCE_RANK[eb?.importance] ?? 0
    return ia - ib
  })

  for (const name of sorted) {
    const entry = entryMap.get(name)
    const card = document.createElement('div')
    card.className = 'chord-card'

    const label = document.createElement('h3')
    label.textContent = name
    card.appendChild(label)

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    card.appendChild(svg)

    grid.appendChild(card)

    const fingers = entry.frets.map((f, i) => {
      const fingerNum = entry.fingers?.[i]
      return fingerNum ? [4 - i, f, String(fingerNum)] : [4 - i, f]
    })
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

    // iOS WebKit ignores dominant-baseline:central → finger numbers sit below circle center.
    // dy="-0.35em" pulls text up to compensate. Chrome doesn't need this (dominant-baseline works).
    if (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
      svg.querySelectorAll('text').forEach(t => t.setAttribute('dy', '-0.15em'))
    }

    svg.style.width = '100%'
    const w = svg.getBoundingClientRect().width
    if (w) svg.style.height = Math.round(w * preH / 200) + 'px'
  }
}

init().then(() => {
  const params = new URLSearchParams(location.search)

  // Read `text` from the raw search string so unencoded `&` inside the value
  // (e.g. from embedded URLs) don't truncate it. `text` must be the last param.
  const textKey = '&text='
  const textIdx = location.search.indexOf(textKey)
  const rawText = textIdx >= 0
    ? decodeURIComponent(location.search.slice(textIdx + textKey.length).replace(/\+/g, ' '))
    : params.get('text')

  if (rawText) {
    const lines = rawText.split('\n')
    const chords = extractChords(rawText, lines)
    renderChords('Photo', chords)
  }
})
