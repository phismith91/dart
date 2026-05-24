import { useState } from "react";

const INITIAL_TEAMS = [
  "Team 1", "Team 2", "Team 3", "Team 4",
  "Team 5", "Team 6", "Team 7", "Team 8"
];

const ROUND_LABELS = [
  { name: "Viertelfinale", mode: "501 Single Out", best: "Best of 3" },
  { name: "Halbfinale", mode: "501 Single Out", best: "Best of 3" },
  { name: "Finale", mode: "501 Double Out", best: "Best of 3" },
];

function createBracket(teams) {
  return {
    teams: [...teams],
    matches: {
      qf: [
        { id: "qf1", team1: 0, team2: 1, score1: 0, score2: 0, winner: null },
        { id: "qf2", team1: 2, team2: 3, score1: 0, score2: 0, winner: null },
        { id: "qf3", team1: 4, team2: 5, score1: 0, score2: 0, winner: null },
        { id: "qf4", team1: 6, team2: 7, score1: 0, score2: 0, winner: null },
      ],
      sf: [
        { id: "sf1", team1: null, team2: null, score1: 0, score2: 0, winner: null },
        { id: "sf2", team1: null, team2: null, score1: 0, score2: 0, winner: null },
      ],
      final: [
        { id: "f1", team1: null, team2: null, score1: 0, score2: 0, winner: null },
      ],
    },
  };
}

function MatchCard({ match, teams, roundIdx, onScore, onReset, highlight }) {
  const t1 = match.team1 !== null ? teams[match.team1] : "—";
  const t2 = match.team2 !== null ? teams[match.team2] : "—";
  const canPlay = match.team1 !== null && match.team2 !== null && match.winner === null;
  const done = match.winner !== null;

  return (
    <div style={{
      background: done ? "#1a2e1a" : highlight ? "#1a1a2e" : "#141414",
      border: `1px solid ${done ? "#2d5a2d" : highlight ? "#2d2d5a" : "#2a2a2a"}`,
      borderRadius: 10,
      padding: "10px 14px",
      minWidth: 210,
      position: "relative",
      transition: "all 0.3s ease",
    }}>
      {done && (
        <button onClick={() => onReset(match.id)} style={{
          position: "absolute", top: 4, right: 6, background: "none",
          border: "none", color: "#666", cursor: "pointer", fontSize: 11,
          fontFamily: "'JetBrains Mono', monospace",
        }}>↺</button>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{
          color: match.winner === match.team1 ? "#6fcf6f" : "#ccc",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 13,
          fontWeight: match.winner === match.team1 ? 700 : 400,
          maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{t1}</span>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {canPlay && (
            <button onClick={() => onScore(match.id, 1)} style={{
              background: "#2a2a2a", border: "1px solid #444", color: "#aee86f",
              borderRadius: 4, width: 22, height: 22, cursor: "pointer",
              fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "'JetBrains Mono', monospace",
            }}>+</button>
          )}
          <span style={{
            color: match.winner === match.team1 ? "#6fcf6f" : "#888",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 16, fontWeight: 700, minWidth: 14, textAlign: "center",
          }}>{match.score1}</span>
        </div>
      </div>

      <div style={{ height: 1, background: "#2a2a2a", margin: "2px 0" }} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
        <span style={{
          color: match.winner === match.team2 ? "#6fcf6f" : "#ccc",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 13,
          fontWeight: match.winner === match.team2 ? 700 : 400,
          maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{t2}</span>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {canPlay && (
            <button onClick={() => onScore(match.id, 2)} style={{
              background: "#2a2a2a", border: "1px solid #444", color: "#aee86f",
              borderRadius: 4, width: 22, height: 22, cursor: "pointer",
              fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "'JetBrains Mono', monospace",
            }}>+</button>
          )}
          <span style={{
            color: match.winner === match.team2 ? "#6fcf6f" : "#888",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 16, fontWeight: 700, minWidth: 14, textAlign: "center",
          }}>{match.score2}</span>
        </div>
      </div>
    </div>
  );
}

export default function DartTurnier() {
  const [editMode, setEditMode] = useState(true);
  const [teamNames, setTeamNames] = useState([...INITIAL_TEAMS]);
  const [bracket, setBracket] = useState(null);
  const [champion, setChampion] = useState(null);

  const startTournament = () => {
    setBracket(createBracket(teamNames));
    setEditMode(false);
    setChampion(null);
  };

  const resetTournament = () => {
    setEditMode(true);
    setBracket(null);
    setChampion(null);
  };

  const propagateWinners = (b) => {
    const qf = b.matches.qf;
    const sf = b.matches.sf;
    const fin = b.matches.final;

    if (qf[0].winner !== null) sf[0].team1 = qf[0].winner;
    if (qf[1].winner !== null) sf[0].team2 = qf[1].winner;
    if (qf[2].winner !== null) sf[1].team1 = qf[2].winner;
    if (qf[3].winner !== null) sf[1].team2 = qf[3].winner;

    if (sf[0].winner !== null) fin[0].team1 = sf[0].winner;
    if (sf[1].winner !== null) fin[0].team2 = sf[1].winner;

    if (fin[0].winner !== null) {
      setChampion(b.teams[fin[0].winner]);
    } else {
      setChampion(null);
    }
  };

  const handleScore = (matchId, player) => {
    setBracket(prev => {
      const b = JSON.parse(JSON.stringify(prev));
      const allMatches = [...b.matches.qf, ...b.matches.sf, ...b.matches.final];
      const match = allMatches.find(m => m.id === matchId);
      if (!match || match.winner) return prev;

      if (player === 1) match.score1++;
      else match.score2++;

      if (match.score1 >= 2) {
        match.winner = match.team1;
      } else if (match.score2 >= 2) {
        match.winner = match.team2;
      }

      // Write back
      for (const key of ["qf", "sf", "final"]) {
        for (let i = 0; i < b.matches[key].length; i++) {
          if (b.matches[key][i].id === matchId) {
            b.matches[key][i] = match;
          }
        }
      }

      propagateWinners(b);
      return b;
    });
  };

  const handleReset = (matchId) => {
    setBracket(prev => {
      const b = JSON.parse(JSON.stringify(prev));

      const resetDownstream = (mid) => {
        const allMatches = [...b.matches.qf, ...b.matches.sf, ...b.matches.final];
        const match = allMatches.find(m => m.id === mid);
        if (!match) return;

        match.score1 = 0;
        match.score2 = 0;
        match.winner = null;

        for (const key of ["qf", "sf", "final"]) {
          for (let i = 0; i < b.matches[key].length; i++) {
            if (b.matches[key][i].id === mid) {
              b.matches[key][i] = match;
            }
          }
        }
      };

      // Find which round
      const qfIds = b.matches.qf.map(m => m.id);
      const sfIds = b.matches.sf.map(m => m.id);

      if (qfIds.includes(matchId)) {
        resetDownstream(matchId);
        // Reset dependent SF
        const qfIdx = qfIds.indexOf(matchId);
        const sfIdx = Math.floor(qfIdx / 2);
        const sfMatch = b.matches.sf[sfIdx];
        if (qfIdx % 2 === 0) sfMatch.team1 = null;
        else sfMatch.team2 = null;
        sfMatch.score1 = 0; sfMatch.score2 = 0; sfMatch.winner = null;
        // Reset final
        const finIdx = sfIdx < 1 ? "team1" : "team2";
        b.matches.final[0][finIdx] = null;
        b.matches.final[0].score1 = 0;
        b.matches.final[0].score2 = 0;
        b.matches.final[0].winner = null;
      } else if (sfIds.includes(matchId)) {
        resetDownstream(matchId);
        const sfIdx = sfIds.indexOf(matchId);
        const finKey = sfIdx === 0 ? "team1" : "team2";
        b.matches.final[0][finKey] = null;
        b.matches.final[0].score1 = 0;
        b.matches.final[0].score2 = 0;
        b.matches.final[0].winner = null;
      } else {
        resetDownstream(matchId);
      }

      setChampion(null);
      return b;
    });
  };

  // EDIT MODE
  if (editMode) {
    return (
      <div style={{
        minHeight: "100vh", background: "#0a0a0a", color: "#eee",
        fontFamily: "'JetBrains Mono', monospace",
        display: "flex", flexDirection: "column", alignItems: "center",
        padding: "30px 16px",
      }}>
        <div style={{ textAlign: "center", marginBottom: 30 }}>
          <div style={{ fontSize: 40, marginBottom: 6 }}>🎯</div>
          <h1 style={{
            fontSize: 20, fontWeight: 800, letterSpacing: "-0.5px",
            color: "#fff", margin: 0,
          }}>1. Dart Turnier</h1>
          <p style={{ color: "#6fcf6f", fontSize: 13, margin: "4px 0 0" }}>
            Feuerwehr Aidlingen · 19.09.2026
          </p>
        </div>

        <div style={{
          background: "#141414", border: "1px solid #2a2a2a",
          borderRadius: 12, padding: 20, width: "100%", maxWidth: 360,
        }}>
          <p style={{ color: "#888", fontSize: 12, margin: "0 0 14px", textAlign: "center" }}>
            Teamnamen eingeben (8 Teams à 2 Spieler)
          </p>
          {teamNames.map((name, i) => (
            <div key={i} style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#555", fontSize: 11, width: 16, textAlign: "right" }}>{i + 1}</span>
              <input
                value={name}
                onChange={e => {
                  const n = [...teamNames];
                  n[i] = e.target.value;
                  setTeamNames(n);
                }}
                style={{
                  flex: 1, background: "#1a1a1a", border: "1px solid #333",
                  borderRadius: 6, padding: "8px 10px", color: "#eee",
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
                  outline: "none",
                }}
                placeholder={`Team ${i + 1}`}
              />
            </div>
          ))}
          <button onClick={startTournament} style={{
            width: "100%", marginTop: 14, padding: "12px 0",
            background: "#6fcf6f", color: "#0a0a0a", border: "none",
            borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer",
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: "-0.3px",
          }}>
            Turnier starten 🎯
          </button>
        </div>

        <div style={{
          marginTop: 20, background: "#141414", border: "1px solid #2a2a2a",
          borderRadius: 12, padding: 16, width: "100%", maxWidth: 360,
        }}>
          <p style={{ color: "#888", fontSize: 11, margin: 0, lineHeight: 1.6 }}>
            <span style={{ color: "#aee86f" }}>Vorrunde:</span> 501 Single Out · Best of 3<br/>
            <span style={{ color: "#f0a050" }}>Finale:</span> 501 Double Out · Best of 3
          </p>
        </div>
      </div>
    );
  }

  // BRACKET VIEW
  const rounds = [
    { label: ROUND_LABELS[0], matches: bracket.matches.qf },
    { label: ROUND_LABELS[1], matches: bracket.matches.sf },
    { label: ROUND_LABELS[2], matches: bracket.matches.final },
  ];

  return (
    <div style={{
      minHeight: "100vh", background: "#0a0a0a", color: "#eee",
      fontFamily: "'JetBrains Mono', monospace",
      padding: "20px 16px", overflowX: "auto",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 20, flexWrap: "wrap", gap: 8,
      }}>
        <div>
          <span style={{ fontSize: 13, color: "#888" }}>🎯 1. Dart Turnier · Feuerwehr Aidlingen</span>
        </div>
        <button onClick={resetTournament} style={{
          background: "#1a1a1a", border: "1px solid #333", color: "#888",
          borderRadius: 6, padding: "6px 12px", cursor: "pointer",
          fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
        }}>
          Neu starten
        </button>
      </div>

      {champion && (
        <div style={{
          textAlign: "center", padding: "20px 16px", marginBottom: 20,
          background: "linear-gradient(135deg, #1a2e1a 0%, #2d4a1a 100%)",
          border: "1px solid #4a7a2a", borderRadius: 12,
        }}>
          <div style={{ fontSize: 36, marginBottom: 4 }}>🏆</div>
          <div style={{ fontSize: 11, color: "#aee86f", letterSpacing: 2, marginBottom: 4 }}>
            WANDERPOKAL-GEWINNER
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>
            {champion}
          </div>
        </div>
      )}

      <div style={{
        display: "flex", gap: 20, alignItems: "flex-start",
        minWidth: "fit-content",
      }}>
        {rounds.map((round, rIdx) => (
          <div key={rIdx} style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 230 }}>
            <div style={{ textAlign: "center", marginBottom: 4 }}>
              <div style={{
                fontSize: 13, fontWeight: 700,
                color: rIdx === 2 ? "#f0a050" : "#aee86f",
              }}>{round.label.name}</div>
              <div style={{ fontSize: 10, color: "#666" }}>
                {round.label.mode} · {round.label.best}
              </div>
            </div>

            <div style={{
              display: "flex", flexDirection: "column",
              gap: 12,
              justifyContent: "space-around",
              minHeight: rIdx === 0 ? "auto" : rIdx === 1 ? 280 : 300,
            }}>
              {round.matches.map(match => (
                <MatchCard
                  key={match.id}
                  match={match}
                  teams={bracket.teams}
                  roundIdx={rIdx}
                  onScore={handleScore}
                  onReset={handleReset}
                  highlight={rIdx === 2}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{
        marginTop: 24, padding: 12, background: "#141414",
        border: "1px solid #2a2a2a", borderRadius: 8, fontSize: 11, color: "#555",
        textAlign: "center",
      }}>
        + drücken wenn ein Team ein Leg gewinnt · bei 2 Legs wird automatisch weitergeschaltet · ↺ zum Zurücksetzen
      </div>
    </div>
  );
}
