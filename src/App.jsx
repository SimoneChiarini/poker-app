import { useState, useEffect, useRef } from 'react'
import { socket } from './socket'

// ─── helpers ───────────────────────────────────────────────────────────────

function phaseLabel(phase) {
  return { waiting: 'Lobby', preflop: 'Pre-Flop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown' }[phase] || phase
}

function phaseColor(phase) {
  return { preflop: '#6366f1', flop: '#0ea5e9', turn: '#f59e0b', river: '#ef4444', showdown: '#10b981' }[phase] || '#6b7280'
}

// ─── Home screen ────────────────────────────────────────────────────────────

function Home({ onCreated, onJoined, error }) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [tab, setTab] = useState('create')

  function handleCreate(e) {
    e.preventDefault()
    if (!name.trim()) return
    socket.emit('create_room', { name: name.trim() })
    onCreated(name.trim())
  }

  function handleJoin(e) {
    e.preventDefault()
    if (!name.trim() || !code.trim()) return
    socket.emit('join_room', { roomId: code.trim().toUpperCase(), name: name.trim() })
    onJoined(name.trim())
  }

  return (
    <div className="screen-center">
      <div className="logo">🃏 Poker Night</div>

      <div className="tab-bar">
        <button className={tab === 'create' ? 'tab active' : 'tab'} onClick={() => setTab('create')}>Crea partita</button>
        <button className={tab === 'join' ? 'tab active' : 'tab'} onClick={() => setTab('join')}>Entra</button>
      </div>

      {tab === 'create' ? (
        <form className="card" onSubmit={handleCreate}>
          <label>Il tuo nome</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Es. Mario" maxLength={16} autoFocus />
          <button type="submit" className="btn-primary" disabled={!name.trim()}>Crea stanza</button>
        </form>
      ) : (
        <form className="card" onSubmit={handleJoin}>
          <label>Il tuo nome</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Es. Luigi" maxLength={16} autoFocus />
          <label>Codice stanza</label>
          <input
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="Es. A3F2"
            maxLength={4}
            style={{ letterSpacing: '0.2em', textTransform: 'uppercase', fontSize: '1.4rem', textAlign: 'center' }}
          />
          <button type="submit" className="btn-primary" disabled={!name.trim() || code.length < 4}>Entra</button>
        </form>
      )}

      {error && <div className="error-banner">{error}</div>}
    </div>
  )
}

// ─── Lobby screen ───────────────────────────────────────────────────────────

function Lobby({ state, myId, error }) {
  const isAdmin = state.adminId === myId
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
        <h3>Giocatori ({state.players.length})</h3>
        {state.players.map(p => (
          <div key={p.id} className="player-row">
            <span>{p.name} {p.isAdmin ? '👑' : ''} {p.id === myId ? '(tu)' : ''}</span>
            {isAdmin && p.id !== myId && (
              <button className="btn-small btn-danger" onClick={() => kick(p.id)}>Rimuovi</button>
            )}
          </div>
        ))}
      </div>

      {isAdmin && (
        <div className="card">
          <h3>Impostazioni</h3>
          <div className="settings-grid">
            <div>
              <label>Fiches iniziali</label>
              <input type="number" value={stack} onChange={e => setStack(e.target.value)} min="10" />
            </div>
            <div>
              <label>Small Blind</label>
              <input type="number" value={sb} onChange={e => setSb(e.target.value)} min="1" />
            </div>
            <div>
              <label>Big Blind</label>
              <input type="number" value={bb} onChange={e => setBb(e.target.value)} min="2" />
            </div>
          </div>
          <button
            className="btn-primary"
            onClick={start}
            disabled={state.players.length < 2}
          >
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

// ─── Game screen ────────────────────────────────────────────────────────────

function Game({ state, myId, error }) {
  const isAdmin = state.adminId === myId
  const me = state.players.find(p => p.id === myId)
  const currentPlayer = state.currentPlayerIndex >= 0 ? state.players[state.currentPlayerIndex] : null
  const isMyTurn = currentPlayer?.id === myId
  const logRef = useRef(null)

  const callAmount = me ? Math.min(state.currentBet - me.bet, me.stack) : 0
  const canCheck = me ? me.bet >= state.currentBet : false

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

      {/* Players */}
      <div className="players-grid">
        {state.players.map((p, i) => {
          const isDealer = i === state.dealerIndex
          const isSB = i === (state.dealerIndex + 1) % state.players.length
          const isBB = i === (state.dealerIndex + 2) % state.players.length
          const isCurrent = i === state.currentPlayerIndex
          const isMe = p.id === myId
          return (
            <div
              key={p.id}
              className={[
                'player-card',
                p.folded ? 'folded' : '',
                isCurrent ? 'current' : '',
                isMe ? 'me' : '',
                p.allIn ? 'all-in' : '',
                p.disconnected ? 'disconnected' : ''
              ].filter(Boolean).join(' ')}
            >
              <div className="player-name">
                {p.name}
                {isDealer && <span className="badge dealer">D</span>}
                {isSB && !isDealer && <span className="badge sb">SB</span>}
                {isBB && <span className="badge bb">BB</span>}
                {isMe && <span className="badge me">tu</span>}
              </div>
              <div className="player-stack">{p.folded ? 'Passato' : p.allIn ? `All-in` : `${p.stack}`}</div>
              {p.bet > 0 && !p.folded && <div className="player-bet">punta: {p.bet}</div>}
              {p.disconnected && <div className="dc-label">disconnesso</div>}
            </div>
          )
        })}
      </div>

      {/* My info + actions */}
      {me && !me.folded && state.phase !== 'waiting' && state.phase !== 'showdown' && (
        <div className="card action-area">
          <div className="my-stack-row">
            <span>Le tue fiches: <strong>{me.stack}</strong></span>
            {me.bet > 0 && <span>Hai puntato: <strong>{me.bet}</strong></span>}
          </div>

          {isMyTurn ? (
            <ActionButtons
              me={me}
              state={state}
              canCheck={canCheck}
              callAmount={callAmount}
              onAction={action}
            />
          ) : (
            <div className="waiting-msg">
              {currentPlayer
                ? `Turno di ${currentPlayer.name}...`
                : 'In attesa della prossima azione...'}
            </div>
          )}
        </div>
      )}

      {me?.folded && state.phase !== 'showdown' && (
        <div className="card center">
          <p className="hint">Hai passato questa mano</p>
          {currentPlayer && <p className="hint">Turno di {currentPlayer.name}</p>}
        </div>
      )}

      {/* Admin panel */}
      {isAdmin && (
        <AdminPanel state={state} myId={myId} />
      )}

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

// ─── Action buttons ─────────────────────────────────────────────────────────

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

  function handleAllIn() {
    onAction('all_in')
  }

  return (
    <div className="action-buttons">
      <button className="btn-action btn-fold" onClick={() => onAction('fold')}>Passa</button>

      {canCheck ? (
        <button className="btn-action btn-check" onClick={() => onAction('check')}>Check</button>
      ) : (
        <button className="btn-action btn-call" onClick={() => onAction('call')} disabled={callAmount === 0}>
          Chiama {callAmount}
        </button>
      )}

      <button className="btn-action btn-raise" onClick={() => setShowRaise(!showRaise)}>
        {canCheck ? 'Punta' : 'Rilancia'}
      </button>

      <button className="btn-action btn-allin" onClick={handleAllIn}>
        All-in ({me.stack})
      </button>

      {showRaise && (
        <div className="raise-panel">
          <div className="raise-hint">
            Min: {Math.min(minRaise, maxRaise)} — Max: {maxRaise}
          </div>
          <div className="raise-current">
            Puntata attuale: {state.currentBet}
          </div>
          <div className="raise-input-row">
            <input
              type="number"
              value={raiseAmount}
              onChange={e => setRaiseAmount(e.target.value)}
              min={Math.min(minRaise, maxRaise)}
              max={maxRaise}
              placeholder={`Min ${Math.min(minRaise, maxRaise)}`}
              autoFocus
            />
            <button className="btn-primary" onClick={handleRaise}>Conferma</button>
          </div>
          <input
            type="range"
            min={Math.min(minRaise, maxRaise)}
            max={maxRaise}
            step={state.bigBlind}
            value={raiseAmount || Math.min(minRaise, maxRaise)}
            onChange={e => setRaiseAmount(e.target.value)}
          />
        </div>
      )}
    </div>
  )
}

// ─── Admin panel ─────────────────────────────────────────────────────────────

function AdminPanel({ state, myId }) {
  const [selectedWinners, setSelectedWinners] = useState([])
  const [rebuyPlayerId, setRebuyPlayerId] = useState('')
  const [rebuyAmount, setRebuyAmount] = useState('1000')
  const [showRebuy, setShowRebuy] = useState(false)

  const roundOver = state.currentPlayerIndex === -1
  const canAdvance = roundOver && state.phase !== 'showdown' && state.phase !== 'waiting'
  const isShowdown = state.phase === 'showdown'
  const activePlayers = state.players.filter(p => !p.folded)

  function toggleWinner(id) {
    setSelectedWinners(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  function declareWinner() {
    if (selectedWinners.length === 0) return
    socket.emit('declare_winner', { roomId: state.roomId, winnerIds: selectedWinners })
    setSelectedWinners([])
  }

  function nextHand() {
    socket.emit('next_hand', { roomId: state.roomId })
    setSelectedWinners([])
  }

  function doRebuy() {
    if (!rebuyPlayerId || !rebuyAmount) return
    socket.emit('add_chips', { roomId: state.roomId, playerId: rebuyPlayerId, amount: Number(rebuyAmount) })
    setShowRebuy(false)
  }

  return (
    <div className="card admin-panel">
      <div className="admin-title">Pannello Admin 👑</div>

      {/* Street control */}
      {canAdvance && (
        <button
          className="btn-primary"
          onClick={() => socket.emit('next_street', { roomId: state.roomId })}
        >
          Avanza →{' '}
          {state.phase === 'preflop' ? 'Flop'
            : state.phase === 'flop' ? 'Turn'
            : state.phase === 'turn' ? 'River'
            : 'Showdown'}
        </button>
      )}

      {!roundOver && state.phase !== 'showdown' && state.phase !== 'waiting' && (
        <div className="hint">Aspetta che tutti i giocatori agiscano</div>
      )}

      {/* Winner selection */}
      {isShowdown && state.pot > 0 && (
        <div className="winner-section">
          <div className="winner-title">Chi vince il piatto di {state.pot}?</div>
          <div className="winner-hint">(Seleziona più giocatori per split pot)</div>
          <div className="winner-list">
            {activePlayers.map(p => (
              <button
                key={p.id}
                className={`winner-btn ${selectedWinners.includes(p.id) ? 'selected' : ''}`}
                onClick={() => toggleWinner(p.id)}
              >
                {p.name} ({p.stack})
              </button>
            ))}
          </div>
          <button
            className="btn-primary"
            onClick={declareWinner}
            disabled={selectedWinners.length === 0}
          >
            Assegna piatto
          </button>
        </div>
      )}

      {/* Next hand */}
      {isShowdown && state.pot === 0 && (
        <button className="btn-primary" onClick={nextHand}>
          Mano successiva ▶
        </button>
      )}

      {/* Rebuy */}
      <button className="btn-secondary" onClick={() => setShowRebuy(!showRebuy)}>
        Rebuy / Aggiungi fiches
      </button>
      {showRebuy && (
        <div className="rebuy-panel">
          <select value={rebuyPlayerId} onChange={e => setRebuyPlayerId(e.target.value)}>
            <option value="">Seleziona giocatore</option>
            {state.players.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.stack})</option>
            ))}
          </select>
          <input
            type="number"
            value={rebuyAmount}
            onChange={e => setRebuyAmount(e.target.value)}
            min="1"
            placeholder="Importo"
          />
          <button className="btn-primary" onClick={doRebuy} disabled={!rebuyPlayerId}>Aggiungi</button>
        </div>
      )}
    </div>
  )
}

// ─── Root App ────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState('home')
  const [myName, setMyName] = useState('')
  const [gameState, setGameState] = useState(null)
  const [myId, setMyId] = useState('')
  const [error, setError] = useState('')

  function showError(msg) {
    setError(msg)
    setTimeout(() => setError(''), 4000)
  }

  useEffect(() => {
    socket.on('connect', () => setMyId(socket.id))

    socket.on('room_created', () => setScreen('lobby'))
    socket.on('room_joined', () => setScreen('lobby'))

    socket.on('game_state', (state) => {
      setMyId(state.myId)
      setGameState(state)
      if (state.phase !== 'waiting' && screen !== 'game') setScreen('game')
    })

    socket.on('error_msg', showError)

    return () => {
      socket.off('connect')
      socket.off('room_created')
      socket.off('room_joined')
      socket.off('game_state')
      socket.off('error_msg')
    }
  }, [screen])

  if (screen === 'home') {
    return (
      <Home
        error={error}
        onCreated={name => setMyName(name)}
        onJoined={name => setMyName(name)}
      />
    )
  }

  if (!gameState) return <div className="screen-center"><p>Connessione...</p></div>

  if (screen === 'lobby' || gameState.phase === 'waiting') {
    return <Lobby state={gameState} myId={myId} error={error} />
  }

  return <Game state={gameState} myId={myId} error={error} />
}
