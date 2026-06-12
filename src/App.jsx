import { useState, useEffect, useRef } from 'react'
import { socket } from './socket'

// ─── helpers ───────────────────────────────────────────────────────────────

function phaseLabel(phase) {
  return { waiting: 'Lobby', preflop: 'Pre-Flop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown' }[phase] || phase
}

function phaseColor(phase) {
  return { preflop: '#6366f1', flop: '#0ea5e9', turn: '#f59e0b', river: '#ef4444', showdown: '#10b981' }[phase] || '#6b7280'
}

const LS_KEY = 'poker_session'

function saveSession(data) {
  localStorage.setItem(LS_KEY, JSON.stringify(data))
}

function loadSession() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) } catch { return null }
}

function clearSession() {
  localStorage.removeItem(LS_KEY)
}

// ─── PIN modal ──────────────────────────────────────────────────────────────

function PinModal({ pin, roomId, onClose }) {
  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-title">Il tuo PIN di accesso</div>
        <p className="modal-hint">Annotalo: ti serve per rientrare se aggiorni la pagina</p>
        <div className="pin-display">{pin}</div>
        <p className="modal-hint">Stanza: <strong>{roomId}</strong></p>
        <button className="btn-primary" onClick={onClose}>Ho salvato il PIN</button>
      </div>
    </div>
  )
}

// ─── Home screen ────────────────────────────────────────────────────────────

function Home({ error, onAction }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [pin, setPin] = useState('')
  const [tab, setTab] = useState('create')

  function handleCreate(e) {
    e.preventDefault()
    if (!name.trim()) return
    socket.emit('create_room', { name: name.trim() })
  }

  function handleJoin(e) {
    e.preventDefault()
    if (!name.trim() || code.length < 4) return
    socket.emit('join_room', { roomId: code.trim().toUpperCase(), name: name.trim() })
  }

  function handleRejoin(e) {
    e.preventDefault()
    const saved = loadSession()
    const roomIdToUse = saved?.roomId || code.trim().toUpperCase()
    if (!roomIdToUse || !pin.trim()) return
    socket.emit('rejoin_room', { roomId: roomIdToUse, playerId: saved?.playerId, pin: pin.trim() })
  }

  return (
    <div className="screen-center">
      <div className="logo">🃏 Poker Night</div>

      <div className="tab-bar">
        <button className={tab === 'create' ? 'tab active' : 'tab'} onClick={() => setTab('create')}>Crea</button>
        <button className={tab === 'join' ? 'tab active' : 'tab'} onClick={() => setTab('join')}>Entra</button>
        <button className={tab === 'rejoin' ? 'tab active' : 'tab'} onClick={() => setTab('rejoin')}>Rientra</button>
      </div>

      {tab === 'create' && (
        <form className="card" onSubmit={handleCreate}>
          <label>Il tuo nome</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Es. Mario" maxLength={16} autoFocus />
          <button type="submit" className="btn-primary" disabled={!name.trim()}>Crea stanza</button>
        </form>
      )}

      {tab === 'join' && (
        <form className="card" onSubmit={handleJoin}>
          <label>Il tuo nome</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Es. Luigi" maxLength={16} autoFocus />
          <label>Codice stanza</label>
          <input
            value={code} onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="Es. A3F2" maxLength={4}
            style={{ letterSpacing: '0.2em', fontSize: '1.4rem', textAlign: 'center' }}
          />
          <button type="submit" className="btn-primary" disabled={!name.trim() || code.length < 4}>Entra</button>
        </form>
      )}

      {tab === 'rejoin' && (
        <form className="card" onSubmit={handleRejoin}>
          <label>Codice stanza</label>
          <input
            value={code} onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="Es. A3F2" maxLength={4}
            style={{ letterSpacing: '0.2em', fontSize: '1.4rem', textAlign: 'center' }}
          />
          <label>Il tuo PIN (4 cifre)</label>
          <input
            value={pin} onChange={e => setPin(e.target.value)}
            placeholder="Es. 4821" maxLength={4} type="tel"
            style={{ letterSpacing: '0.3em', fontSize: '1.6rem', textAlign: 'center' }}
          />
          <button type="submit" className="btn-primary" disabled={code.length < 4 || pin.length < 4}>Rientra</button>
        </form>
      )}

      {error && <div className="error-banner">{error}</div>}
    </div>
  )
}

// ─── Lobby screen ───────────────────────────────────────────────────────────

function Lobby({ state, myPlayerId, error }) {
  const isAdmin = state.players.find(p => p.playerId === myPlayerId)?.isAdmin
  const [stack, setStack] = useState('1000')
  const [sb, setSb] = useState('10')
  const [bb, setBb] = useState('20')

  function start() {
    socket.emit('start_game', {
      roomId: state.roomId,
      startingStack: Number(stack),
      smallBlind: Number(sb),
      bigBlind: Number(bb)
    })
  }

  function move(fromIndex, dir) {
    const toIndex = fromIndex + dir
    if (toIndex < 0 || toIndex >= state.players.length) return
    socket.emit('reorder_seats', { roomId: state.roomId, fromIndex, toIndex })
  }

  function kick(playerId) {
    socket.emit('kick_player', { roomId: state.roomId, playerId })
  }

  return (
    <div className="screen">
      <div className="lobby-header">
        <div className="room-code-display">
          <span className="room-label">Codice stanza</span>
          <span className="room-code">{state.roomId}</span>
          <button className="btn-copy" onClick={() => navigator.clipboard?.writeText(state.roomId)}>Copia</button>
        </div>
        <p className="lobby-hint">Condividi il codice con i tuoi amici</p>
      </div>

      <div className="card">
        <h3>Sedute ({state.players.length}) {isAdmin && <span className="hint-inline">— trascina per riordinare</span>}</h3>
        {state.players.map((p, i) => (
          <div key={p.playerId} className="player-row">
            <span className="seat-num">{i + 1}</span>
            <span className="seat-name">
              {p.name}
              {p.isAdmin ? ' 👑' : ''}
              {p.playerId === myPlayerId ? ' (tu)' : ''}
            </span>
            {isAdmin && (
              <div className="seat-controls">
                <button className="btn-arrow" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                <button className="btn-arrow" onClick={() => move(i, 1)} disabled={i === state.players.length - 1}>↓</button>
                {p.playerId !== myPlayerId && (
                  <button className="btn-small btn-danger" onClick={() => kick(p.playerId)}>✕</button>
                )}
              </div>
            )}
          </div>
        ))}
        <p className="hint">L'ordine qui definisce la rotazione dealer/bui</p>
      </div>

      {isAdmin && (
        <div className="card">
          <h3>Impostazioni</h3>
          <div className="settings-grid">
            <div><label>Fiches</label><input type="number" value={stack} onChange={e => setStack(e.target.value)} min="10" /></div>
            <div><label>Small Blind</label><input type="number" value={sb} onChange={e => setSb(e.target.value)} min="1" /></div>
            <div><label>Big Blind</label><input type="number" value={bb} onChange={e => setBb(e.target.value)} min="2" /></div>
          </div>
          <button className="btn-primary" onClick={start} disabled={state.players.length < 2}>
            Inizia partita
          </button>
          {state.players.length < 2 && <p className="hint">Servono almeno 2 giocatori</p>}
        </div>
      )}

      {!isAdmin && (
        <div className="card center">
          <p className="hint">In attesa che l'admin avvii la partita...</p>
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}
    </div>
  )
}

// ─── Eliminated screen ───────────────────────────────────────────────────────

function EliminatedScreen({ state, myPlayerId }) {
  const me = state.players.find(p => p.playerId === myPlayerId)
  return (
    <div className="screen-center">
      <div style={{ fontSize: '4rem' }}>💀</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>Eliminato</div>
      <p className="hint">{me?.name}, hai finito le fiches.</p>
      <p className="hint">Aspetta che l'admin ti riammetta, poi aggiorna la pagina.</p>

      <div className="card" style={{ width: '100%' }}>
        <h3>Giocatori attivi</h3>
        {state.players.filter(p => !p.eliminated).map(p => (
          <div key={p.playerId} className="player-row">
            <span>{p.name}</span>
            <span style={{ color: '#f59e0b' }}>{p.stack}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Game screen ────────────────────────────────────────────────────────────

function Game({ state, myPlayerId, error }) {
  const me = state.players.find(p => p.playerId === myPlayerId)
  const isAdmin = me?.isAdmin
  const currentPlayer = state.currentPlayerIndex >= 0 ? state.players[state.currentPlayerIndex] : null
  const isMyTurn = currentPlayer?.playerId === myPlayerId
  const callAmount = me ? Math.min(state.currentBet - me.bet, me.stack) : 0
  const canCheck = me ? me.bet >= state.currentBet : false
  const logRef = useRef(null)

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [state.log])

  function action(type, amount) {
    socket.emit('player_action', { roomId: state.roomId, action: type, amount })
  }

  return (
    <div className="screen">
      {/* Header */}
      <div className="game-header" style={{ borderBottom: `3px solid ${phaseColor(state.phase)}` }}>
        <div className="game-header-left">
          <span className="phase-badge" style={{ background: phaseColor(state.phase) }}>{phaseLabel(state.phase)}</span>
          <span className="hand-num">Mano #{state.handNumber}</span>
        </div>
        <div className="pot-display">
          <span className="pot-label">Piatto</span>
          <span className="pot-amount">{state.pot}</span>
        </div>
      </div>

      {/* Table view */}
      <TableView state={state} myPlayerId={myPlayerId} />

      {/* My actions */}
      {me && !me.folded && !me.eliminated && state.phase !== 'waiting' && state.phase !== 'showdown' && (
        <div className="card action-area">
          <div className="my-stack-row">
            <span>Le tue fiches: <strong>{me.stack}</strong></span>
            {me.bet > 0 && <span>Hai puntato: <strong>{me.bet}</strong></span>}
          </div>
          {isMyTurn ? (
            <ActionButtons me={me} state={state} canCheck={canCheck} callAmount={callAmount} onAction={action} />
          ) : (
            <div className="waiting-msg">
              {currentPlayer ? `Turno di ${currentPlayer.name}...` : 'In attesa...'}
            </div>
          )}
        </div>
      )}

      {me?.folded && !me.eliminated && state.phase !== 'showdown' && (
        <div className="card center">
          <p className="hint">Hai passato questa mano</p>
          {currentPlayer && <p className="hint">Turno di {currentPlayer.name}</p>}
        </div>
      )}

      {/* Admin panel */}
      {isAdmin && <AdminPanel state={state} myPlayerId={myPlayerId} />}

      {/* Log */}
      <div className="card">
        <h3>Log mano</h3>
        <div className="log" ref={logRef}>
          {state.log.map((line, i) => (
            <div key={i} className={line.startsWith('---') ? 'log-header' : 'log-line'}>{line}</div>
          ))}
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
    </div>
  )
}

// ─── Table view (oval) ───────────────────────────────────────────────────────

function TableView({ state, myPlayerId }) {
  const players = state.players
  const n = players.length

  return (
    <div className="table-container">
      <div className="table-felt">
        <div className="table-center">
          {state.pot > 0 && <div className="table-pot">🪙 {state.pot}</div>}
          <div className="table-phase" style={{ color: phaseColor(state.phase) }}>
            {phaseLabel(state.phase)}
          </div>
        </div>

        {players.map((p, i) => {
          const angle = (2 * Math.PI * i) / n - Math.PI / 2
          const rx = 42, ry = 34
          const cx = 50 + rx * Math.cos(angle)
          const cy = 50 + ry * Math.sin(angle)
          const isDealer = i === state.dealerIndex
          const isSB = i === (state.dealerIndex + 1) % n
          const isBB = i === (state.dealerIndex + 2) % n
          const isCurrent = i === state.currentPlayerIndex
          const isMe = p.playerId === myPlayerId

          return (
            <div
              key={p.playerId}
              className={[
                'table-seat',
                p.folded || p.eliminated ? 'folded' : '',
                isCurrent ? 'current' : '',
                isMe ? 'me' : '',
                p.allIn ? 'all-in' : '',
                p.disconnected ? 'disconnected' : '',
                p.eliminated ? 'eliminated' : ''
              ].filter(Boolean).join(' ')}
              style={{ left: `${cx}%`, top: `${cy}%` }}
            >
              <div className="seat-badges">
                {isDealer && <span className="badge dealer">D</span>}
                {isSB && !isDealer && <span className="badge sb">SB</span>}
                {isBB && <span className="badge bb">BB</span>}
              </div>
              <div className="seat-name">{p.name}{isMe ? ' ★' : ''}</div>
              <div className="seat-stack">
                {p.eliminated ? '💀' : p.folded ? '—' : p.allIn ? `AI ${p.stack}` : p.stack}
              </div>
              {p.bet > 0 && !p.folded && !p.eliminated && (
                <div className="seat-bet">+{p.bet}</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Action buttons ──────────────────────────────────────────────────────────

function ActionButtons({ me, state, canCheck, callAmount, onAction }) {
  const [raiseAmount, setRaiseAmount] = useState('')
  const [showRaise, setShowRaise] = useState(false)

  const minRaise = state.currentBet + state.bigBlind
  const maxRaise = me.stack + me.bet

  function handleRaise() {
    const amt = Number(raiseAmount)
    if (!amt) return
    onAction('raise', amt)
    setShowRaise(false)
    setRaiseAmount('')
  }

  return (
    <div className="action-buttons">
      <button className="btn-action btn-fold" onClick={() => onAction('fold')}>Passa</button>

      {canCheck
        ? <button className="btn-action btn-check" onClick={() => onAction('check')}>Check</button>
        : <button className="btn-action btn-call" onClick={() => onAction('call')} disabled={callAmount === 0}>Chiama {callAmount}</button>
      }

      <button className="btn-action btn-raise" onClick={() => setShowRaise(!showRaise)}>
        {canCheck ? 'Punta' : 'Rilancia'}
      </button>

      <button className="btn-action btn-allin" onClick={() => onAction('all_in')}>
        All-in ({me.stack})
      </button>

      {showRaise && (
        <div className="raise-panel">
          <div className="raise-hint">Min: {Math.min(minRaise, maxRaise)} — Max: {maxRaise} | Attuale: {state.currentBet}</div>
          <div className="raise-input-row">
            <input
              type="number" value={raiseAmount}
              onChange={e => setRaiseAmount(e.target.value)}
              min={Math.min(minRaise, maxRaise)} max={maxRaise}
              placeholder={`Min ${Math.min(minRaise, maxRaise)}`} autoFocus
            />
            <button className="btn-primary" onClick={handleRaise}>OK</button>
          </div>
          <input
            type="range"
            min={Math.min(minRaise, maxRaise)} max={maxRaise} step={state.bigBlind}
            value={raiseAmount || Math.min(minRaise, maxRaise)}
            onChange={e => setRaiseAmount(e.target.value)}
          />
        </div>
      )}
    </div>
  )
}

// ─── Admin panel ─────────────────────────────────────────────────────────────

function AdminPanel({ state, myPlayerId }) {
  const [selectedWinners, setSelectedWinners] = useState([])
  const [showChips, setShowChips] = useState(false)
  const [chipsMode, setChipsMode] = useState('add')
  const [chipsPlayerId, setChipsPlayerId] = useState('')
  const [chipsAmount, setChipsAmount] = useState('1000')
  const [showReadmit, setShowReadmit] = useState(false)
  const [readmitPlayerId, setReadmitPlayerId] = useState('')
  const [readmitStack, setReadmitStack] = useState('1000')

  const roundOver = state.currentPlayerIndex === -1
  const canAdvance = roundOver && state.phase !== 'showdown' && state.phase !== 'waiting'
  const isShowdown = state.phase === 'showdown'
  const isActive = state.phase !== 'waiting' && state.phase !== 'showdown'
  const alivePlayers = state.players.filter(p => !p.folded && !p.eliminated)
  const foldedPlayers = state.players.filter(p => p.folded && !p.eliminated)
  const eliminatedPlayers = state.players.filter(p => p.eliminated)

  function toggleWinner(playerId) {
    setSelectedWinners(prev => prev.includes(playerId) ? prev.filter(x => x !== playerId) : [...prev, playerId])
  }

  function declareWinner() {
    if (!selectedWinners.length) return
    socket.emit('declare_winner', { roomId: state.roomId, winnerIds: selectedWinners })
    setSelectedWinners([])
  }

  function doChips() {
    if (!chipsPlayerId) return
    socket.emit(chipsMode === 'add' ? 'add_chips' : 'set_chips', {
      roomId: state.roomId, playerId: chipsPlayerId, amount: Number(chipsAmount)
    })
    setShowChips(false)
    setChipsPlayerId('')
  }

  function doReadmit() {
    if (!readmitPlayerId) return
    socket.emit('readmit_player', { roomId: state.roomId, playerId: readmitPlayerId, stack: Number(readmitStack) })
    setShowReadmit(false)
  }

  return (
    <div className="card admin-panel">
      <div className="admin-title">Pannello Admin 👑</div>

      {canAdvance && (
        <button className="btn-primary" onClick={() => socket.emit('next_street', { roomId: state.roomId })}>
          Avanza → {state.phase === 'preflop' ? 'Flop' : state.phase === 'flop' ? 'Turn' : state.phase === 'turn' ? 'River' : 'Showdown'}
        </button>
      )}

      {!roundOver && state.phase !== 'showdown' && state.phase !== 'waiting' && (
        <div className="hint">Aspetta che tutti agiscano</div>
      )}

      {isShowdown && state.pot > 0 && (
        <div className="winner-section">
          <div className="winner-title">Chi vince il piatto di {state.pot}?</div>
          <div className="winner-hint">Seleziona più giocatori per split pot</div>
          <div className="winner-list">
            {alivePlayers.map(p => (
              <button
                key={p.playerId}
                className={`winner-btn ${selectedWinners.includes(p.playerId) ? 'selected' : ''}`}
                onClick={() => toggleWinner(p.playerId)}
              >
                {p.name} ({p.stack})
              </button>
            ))}
          </div>
          <button className="btn-primary" onClick={declareWinner} disabled={!selectedWinners.length}>
            Assegna piatto
          </button>
        </div>
      )}

      {isShowdown && state.pot === 0 && (
        <button className="btn-primary" onClick={() => socket.emit('next_hand', { roomId: state.roomId })}>
          Mano successiva ▶
        </button>
      )}

      {/* Players who folded this hand — admin can undo */}
      {isActive && foldedPlayers.length > 0 && (
        <div className="eliminated-section">
          <div className="eliminated-title">Hanno passato 🃏</div>
          {foldedPlayers.map(p => (
            <div key={p.playerId} className="player-row">
              <span>{p.name}{p.disconnected ? ' ⚡' : ''} ({p.stack})</span>
              <button className="btn-small btn-success" onClick={() =>
                socket.emit('undo_fold', { roomId: state.roomId, playerId: p.playerId })
              }>Annulla fold</button>
            </div>
          ))}
        </div>
      )}

      {/* Eliminated players */}
      {eliminatedPlayers.length > 0 && (
        <div className="eliminated-section">
          <div className="eliminated-title">Eliminati 💀</div>
          {eliminatedPlayers.map(p => (
            <div key={p.playerId} className="player-row">
              <span>{p.name}</span>
              <button className="btn-small btn-success" onClick={() => {
                setReadmitPlayerId(p.playerId)
                setShowReadmit(true)
              }}>Riammetti</button>
            </div>
          ))}
        </div>
      )}

      {showReadmit && (
        <div className="rebuy-panel">
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Stack per {state.players.find(p => p.playerId === readmitPlayerId)?.name}:
          </div>
          <input type="number" value={readmitStack} onChange={e => setReadmitStack(e.target.value)} min="1" />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn-primary" onClick={doReadmit}>Riammetti</button>
            <button className="btn-secondary" onClick={() => setShowReadmit(false)}>Annulla</button>
          </div>
        </div>
      )}

      {/* Chips management: add or set exact amount */}
      <button className="btn-secondary" onClick={() => setShowChips(!showChips)}>
        Gestisci fiches
      </button>
      {showChips && (
        <div className="rebuy-panel">
          <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
            <button
              className={chipsMode === 'add' ? 'btn-primary' : 'btn-secondary'}
              style={{ flex: 1, padding: '4px 0' }}
              onClick={() => setChipsMode('add')}
            >+ Aggiungi</button>
            <button
              className={chipsMode === 'set' ? 'btn-primary' : 'btn-secondary'}
              style={{ flex: 1, padding: '4px 0' }}
              onClick={() => setChipsMode('set')}
            >= Imposta</button>
          </div>
          <select value={chipsPlayerId} onChange={e => setChipsPlayerId(e.target.value)}>
            <option value="">Seleziona giocatore</option>
            {state.players.filter(p => !p.eliminated).map(p => (
              <option key={p.playerId} value={p.playerId}>{p.name} ({p.stack})</option>
            ))}
          </select>
          <input
            type="number" value={chipsAmount}
            onChange={e => setChipsAmount(e.target.value)}
            min="0" placeholder="Importo"
          />
          <button className="btn-primary" onClick={doChips} disabled={!chipsPlayerId}>
            {chipsMode === 'add' ? 'Aggiungi' : 'Imposta'}
          </button>
        </div>
      )}

      <div className="admin-divider" />
      <button
        className="btn-destroy"
        onClick={() => {
          if (window.confirm('Eliminare il tavolo? Tutti i giocatori verranno disconnessi.')) {
            socket.emit('destroy_room', { roomId: state.roomId })
          }
        }}
      >
        Elimina tavolo
      </button>
    </div>
  )
}

// ─── Root App ────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState('home')
  const [gameState, setGameState] = useState(null)
  const [myPlayerId, setMyPlayerId] = useState(() => loadSession()?.playerId || '')
  const [pendingPin, setPendingPin] = useState(null)
  const [error, setError] = useState('')

  function showError(msg) {
    setError(msg)
    setTimeout(() => setError(''), 4000)
  }

  // Auto-reconnect on load
  useEffect(() => {
    const saved = loadSession()
    if (saved?.playerId && saved?.pin && saved?.roomId) {
      socket.emit('rejoin_room', { roomId: saved.roomId, playerId: saved.playerId, pin: saved.pin })
    }
  }, [])

  useEffect(() => {
    socket.on('connect', () => {})

    socket.on('room_created', ({ roomId, playerId, pin }) => {
      setMyPlayerId(playerId)
      saveSession({ roomId, playerId, pin })
      setPendingPin({ pin, roomId })
      setScreen('lobby')
    })

    socket.on('room_joined', ({ roomId, playerId, pin }) => {
      setMyPlayerId(playerId)
      saveSession({ roomId, playerId, pin })
      setPendingPin({ pin, roomId })
      setScreen('lobby')
    })

    socket.on('rejoin_success', ({ roomId, playerId }) => {
      setMyPlayerId(playerId)
      // game_state will follow and set the screen
    })

    socket.on('rejoin_failed', (reason) => {
      clearSession()
      showError(reason || 'Impossibile rientrare')
      setScreen('home')
    })

    socket.on('game_state', (state) => {
      setMyPlayerId(prev => prev || state.myPlayerId)
      setGameState(state)
      if (state.phase !== 'waiting') setScreen('game')
      else setScreen('lobby')
    })

    socket.on('error_msg', showError)

    socket.on('room_destroyed', () => {
      clearSession()
      setGameState(null)
      setMyPlayerId('')
      setScreen('home')
    })

    return () => {
      socket.off('connect')
      socket.off('room_created')
      socket.off('room_joined')
      socket.off('rejoin_success')
      socket.off('rejoin_failed')
      socket.off('game_state')
      socket.off('error_msg')
      socket.off('room_destroyed')
    }
  }, [])

  if (screen === 'home') {
    return <Home error={error} onAction={() => {}} />
  }

  if (!gameState) {
    return (
      <div className="screen-center">
        <div className="hint">Connessione in corso...</div>
      </div>
    )
  }

  // Check if current player is eliminated (admin is never shown the eliminated screen)
  const me = gameState.players.find(p => p.playerId === myPlayerId)
  if (me?.eliminated && !me?.isAdmin && screen === 'game') {
    return (
      <>
        {pendingPin && <PinModal pin={pendingPin.pin} roomId={pendingPin.roomId} onClose={() => setPendingPin(null)} />}
        <EliminatedScreen state={gameState} myPlayerId={myPlayerId} />
      </>
    )
  }

  return (
    <>
      {pendingPin && <PinModal pin={pendingPin.pin} roomId={pendingPin.roomId} onClose={() => setPendingPin(null)} />}
      {screen === 'lobby' || gameState.phase === 'waiting'
        ? <Lobby state={gameState} myPlayerId={myPlayerId} error={error} />
        : <Game state={gameState} myPlayerId={myPlayerId} error={error} />
      }
    </>
  )
}
