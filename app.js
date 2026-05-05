/* global svguitar, Sortable */

const CHORD_REGEX = /^[A-G](#|b)?(maj|min|madd|m\+|m|dim|aug|sus|add|M)?\d*(\/[A-G](#|b)?)?$/

const FINGER_COLORS = { 1: '#3B82F6', 2: '#22C55E', 3: '#F59E0B', 4: '#A855F7' }

const FREQUENCIES = {
  baritone: [146.83, 196.00, 246.94, 329.63],
  standard: [392.00, 261.63, 329.63, 440.00],
}

let audioCtx = null

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume()
  }
  return audioCtx
}

function playChord(entry) {
  const ctx = getAudioContext()
  const frets = entry.frets
  const freqs = FREQUENCIES[currentTuning]
  const now = ctx.currentTime

  frets.forEach((fret, i) => {
    if (fret == null) return

    const frequency = freqs[i] * Math.pow(2, fret / 12)
    const start = now + i * 0.04

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const filter = ctx.createBiquadFilter()

    osc.type = 'triangle'
    osc.frequency.value = frequency

    filter.type = 'lowpass'
    filter.frequency.value = 1200
    filter.Q.value = 1

    const vol = 0.25 / frets.length
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(vol, start + 0.006)
    gain.gain.exponentialRampToValueAtTime(vol * 0.15, start + 0.3)
    gain.gain.exponentialRampToValueAtTime(0.001, start + 2.5)

    osc.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)

    osc.start(start)
    osc.stop(start + 2.5)
  })
}

const LEGEND_ITEMS = [
  { num: 1, label: 'Index', color: FINGER_COLORS[1] },
  { num: 2, label: 'Middle', color: FINGER_COLORS[2] },
  { num: 3, label: 'Ring', color: FINGER_COLORS[3] },
  { num: 4, label: 'Pinky', color: FINGER_COLORS[4] },
]

const SHORTCUT_NAME = 'Ukulele'

const TUNINGS = {
  baritone: { labels: ['D', 'G', 'B', 'E'], file: 'chords_baritone.json' },
  standard: { labels: ['G', 'C', 'E', 'A'], file: 'chords_standard.json' },
}

let chordDicts = { baritone: [], standard: [] }
let currentTuning = 'standard'
let lastTitle = ''
let lastChords = []
let manualChords = []
let sortable = null

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

async function init() {
  const v = '?v=' + Date.now()
  ;[chordDicts.baritone, chordDicts.standard] = await Promise.all([
    fetch('chords_baritone.json' + v).then(r => r.json()),
    fetch('chords_standard.json' + v).then(r => r.json()),
  ])

  const saved = localStorage.getItem('ukulele-tuning')
  if (saved && TUNINGS[saved]) currentTuning = saved

  const selector = document.getElementById('tuning-selector')
  selector.value = currentTuning
  selector.addEventListener('change', () => {
    currentTuning = selector.value
    localStorage.setItem('ukulele-tuning', currentTuning)
    updateTuningLabel()
    if (lastChords.length) renderChords(lastTitle, lastChords)
  })

  updateTuningLabel()
  document.getElementById('fab-camera').removeAttribute('hidden')
  if (isIOS) {
    document.getElementById('menu-ios-section').removeAttribute('hidden')
    const shortcutEl = document.getElementById('menu-get-shortcut')
    if (shortcutEl) {
      shortcutEl.removeAttribute('hidden')
      shortcutEl.href = 'https://www.icloud.com/shortcuts/3d15801f293a48c89a72f79806968258'
    }
  }
  initModal()
  initMenu()
  document.getElementById('menu-add-home').addEventListener('click', () => {
    alert(
      'To add the Shortcut to your Home Screen:\n\n' +
      '1. Open the Shortcuts app\n' +
      '2. Find the "Ukulele" shortcut\n' +
      '3. Tap ••• and choose "Add to Home Screen"\n' +
      '4. Set a custom icon if you like\n' +
      '5. Tap Done in the top-right\n\n' +
      'Your Ukulele shortcut will now appear on your Home Screen like any other app.'
    )
  })
}

function updateTuningLabel() {
  const labels = TUNINGS[currentTuning].labels
  document.getElementById('tuning-label').textContent = labels.join(' ')
  const fab = document.getElementById('fab-camera')
  if (fab) fab.href = 'shortcuts://run-shortcut?name=' + encodeURIComponent(SHORTCUT_NAME)
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

function buildChordCard(name, entry, tuningLabels) {
  const card = document.createElement('div')
  card.className = 'chord-card'

  const header = document.createElement('div')
  header.className = 'chord-card-header'

  const label = document.createElement('h3')
  label.textContent = name
  header.appendChild(label)

  const playBtn = document.createElement('button')
  playBtn.className = 'play-btn'
  playBtn.setAttribute('aria-label', 'Play ' + name)
  playBtn.innerHTML =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="6,3 20,12 6,21"/></svg>'
  playBtn.addEventListener('click', e => {
    e.stopPropagation()
    playChord(entry)
  })
  header.appendChild(playBtn)
  card.appendChild(header)

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  card.appendChild(svg)

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
  // dy="-0.15em" pulls text up to compensate. Chrome doesn't need this (dominant-baseline works).
  if (isIOS) {
    svg.querySelectorAll('text').forEach(t => t.setAttribute('dy', '-0.15em'))
  }

  // Color-code dots by finger
  for (const t of svg.querySelectorAll('text')) {
    const num = t.textContent.trim()
    if (FINGER_COLORS[num] && t.previousElementSibling?.tagName === 'circle') {
      t.previousElementSibling.setAttribute('fill', FINGER_COLORS[num])
    }
  }

  // Responsive sizing: viewBox provides intrinsic aspect ratio, 
  // width:100% fills container, no explicit height needed.
  svg.setAttribute('viewBox', `0 0 200 ${preH}`)
  svg.style.width = '100%'
  svg.removeAttribute('height')

  return card
}

function renderLegend() {
  const el = document.getElementById('finger-legend')
  el.innerHTML = LEGEND_ITEMS.map(item =>
    `<span class="legend-item" style="--dot-color:${item.color}">${item.label}</span>`
  ).join('')
}

function buildUnknownCard(name) {
  const card = document.createElement('div')
  card.className = 'chord-card unknown'
  const label = document.createElement('h3')
  label.textContent = name
  card.appendChild(label)
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 100 120')
  svg.innerHTML = `<rect x="5" y="5" width="90" height="110" rx="4" fill="#fff9ec" stroke="#f0a500" stroke-width="1.5"/><text x="50" y="70" text-anchor="middle" font-size="36" fill="#f0a500">?</text>`
  card.appendChild(svg)
  const note = document.createElement('span')
  note.className = 'unknown-label'
  note.textContent = 'not in dictionary'
  card.appendChild(note)
  return card
}

function renderChords(title, chords) {
  lastTitle = title
  lastChords = chords
  renderLegend()

  const dict = chordDicts[currentTuning]
  const tuningLabels = TUNINGS[currentTuning].labels
  const IMPORTANCE_RANK = { 'Essential': 4, 'Frequently used': 3, 'Occasionally used': 2, 'Rarely used': 1 }

  const info = document.getElementById('song-info')
  const grid = document.getElementById('chord-grid')

  const entryMap = new Map(dict.map(c => [c.name, c]))
  const manualSet = new Set(manualChords)
  const known = chords.filter(name => entryMap.has(name) && !manualSet.has(name))
  info.textContent = `${title} — ${known.length + manualChords.filter(n => entryMap.has(n)).length} chord${known.length !== 1 ? 's' : ''}`
  grid.innerHTML = ''

  for (const name of manualChords) {
    const entry = entryMap.get(name)
    grid.appendChild(entry ? buildChordCard(name, entry, tuningLabels) : buildUnknownCard(name))
  }

  const sorted = [...known].sort((a, b) => {
    const ea = entryMap.get(a)
    const eb = entryMap.get(b)
    const ia = IMPORTANCE_RANK[ea?.importance] ?? 0
    const ib = IMPORTANCE_RANK[eb?.importance] ?? 0
    if (ia !== ib) return ia - ib
    const da = ea?.difficulty ?? 0
    const db = eb?.difficulty ?? 0
    return db - da
  })

  for (const name of sorted) {
    grid.appendChild(buildChordCard(name, entryMap.get(name), tuningLabels))
  }

  const unknown = chords.filter(name => !entryMap.has(name) && !manualSet.has(name))
  for (const name of unknown) {
    grid.appendChild(buildUnknownCard(name))
  }

  if (sortable) { sortable.destroy(); sortable = null }
  sortable = Sortable.create(grid, {
    animation: 150,
    delay: 100,
    delayOnTouchOnly: true,
  })
}

function initModal() {
  const btn = document.getElementById('menu-add-chord')
  const modal = document.getElementById('chord-modal')
  const input = document.getElementById('chord-input')
  const addBtn = document.getElementById('modal-add')
  const cancelBtn = document.getElementById('modal-cancel')
  const suggestions = document.getElementById('chord-suggestions')

  btn.addEventListener('click', openModal)
  cancelBtn.addEventListener('click', closeModal)
  modal.addEventListener('click', e => { if (e.target === modal) closeModal() })

  addBtn.addEventListener('click', submitChord)
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') submitChord()
    if (e.key === 'Escape') closeModal()
  })

  function openModal() {
    const dict = chordDicts[currentTuning]
    suggestions.innerHTML = ''
    dict.forEach(c => {
      const opt = document.createElement('option')
      opt.value = c.name
      suggestions.appendChild(opt)
    })
    input.value = ''
    modal.removeAttribute('hidden')
    setTimeout(() => input.focus(), 50)
  }

  function closeModal() {
    modal.setAttribute('hidden', '')
    input.value = ''
  }

  function submitChord() {
    const name = input.value.trim()
    if (!name) return
    if (!manualChords.includes(name)) {
      manualChords.unshift(name)
    }
    closeModal()
    if (lastChords.length) {
      renderChords(lastTitle, lastChords)
    } else {
      renderChords('', manualChords)
    }
  }
}

function initMenu() {
  const btn = document.getElementById('menu-btn')
  const dropdown = document.getElementById('menu-dropdown')

  btn.addEventListener('click', e => {
    e.stopPropagation()
    const isOpen = !dropdown.hasAttribute('hidden')
    dropdown.toggleAttribute('hidden')
    btn.setAttribute('aria-expanded', !isOpen)
  })

  dropdown.addEventListener('click', () => {
    dropdown.setAttribute('hidden', '')
    btn.setAttribute('aria-expanded', 'false')
  })

  document.addEventListener('click', e => {
    if (!dropdown.hasAttribute('hidden') &&
        !dropdown.contains(e.target) &&
        e.target !== btn) {
      dropdown.setAttribute('hidden', '')
      btn.setAttribute('aria-expanded', 'false')
    }
  })
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
    const commaTokens = rawText.split(',').map(t => t.trim()).filter(Boolean)
    const isCommaList = commaTokens.length > 0 && commaTokens.every(t => CHORD_REGEX.test(t))
    if (isCommaList) {
      renderChords('Manual', commaTokens)
    } else {
      const lines = rawText.split('\n')
      const chords = extractChords(rawText, lines)
      renderChords('Photo', chords)
    }
  }
})
