/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { GameScreen, Character, UserProfile } from './types';
import MainMenu from './components/MainMenu';
import CharacterSelect from './components/CharacterSelect';
import BattleBoard from './components/BattleBoard';
import AdminDashboard from './components/AdminDashboard';
import AuthScreen from './components/AuthScreen';
import { fetchCharactersFromServer } from './lib/characterStorage';

export default function App() {
  const [screen, setScreen] = useState<GameScreen>('main-menu');
  const [playerTeam, setPlayerTeam] = useState<Character[]>([]);
  const [enemyTeam, setEnemyTeam] = useState<Character[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isSandbox, setIsSandbox] = useState(false);
  const [onlineParams, setOnlineParams] = useState<{
    isOnline: boolean;
    roomId: string;
    playerIndex: number;
    opponentProfile: UserProfile;
  } | null>(null);
  
  // User Profile state
  const [user, setUser] = useState<UserProfile | null>(() => {
    const stored = localStorage.getItem('naruto_user_profile');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        return null;
      }
    }
    return null;
  });

  // Sync characters from database server on startup
  useEffect(() => {
    fetchCharactersFromServer().catch(err => {
      console.error('Failed initial character sync:', err);
    });
  }, []);

  // Global sound effect triggers
  const playSound = (soundName: string) => {
    if (isMuted) return;
    try {
      const audio = new Audio(`/static/audio/${soundName}.ogg`);
      audio.volume = 0.45;
      audio.play().catch(e => {
        console.log('Audio autoplay prevented:', e);
      });
    } catch (err) {
      console.error('Audio playback error:', err);
    }
  };

  const playClickSound = () => playSound('Click');
  const playScrollSound = () => playSound('Scroll');
  const playWinSound = () => playSound('Win');
  const playLoseSound = () => playSound('Lose');

  const handleStartGame = () => {
    setScreen('character-select');
  };

  const handleConfirmTeams = (
    playerSquad: Character[],
    enemySquad: Character[],
    online?: { isOnline: boolean; roomId: string; playerIndex: number; opponentProfile: UserProfile },
    sandbox?: boolean
  ) => {
    setPlayerTeam(playerSquad);
    setEnemyTeam(enemySquad);
    setOnlineParams(online || null);
    setIsSandbox(!!sandbox);
    setScreen('battle');
  };

  const handleQuit = () => {
    setPlayerTeam([]);
    setEnemyTeam([]);
    setOnlineParams(null);
    setIsSandbox(false);
    setScreen('main-menu');
  };

  const handleLoginSuccess = (profile: UserProfile) => {
    setUser(profile);
    localStorage.setItem('naruto_user_profile', JSON.stringify(profile));
  };

  const handleLogout = () => {
    playClickSound();
    setUser(null);
    localStorage.removeItem('naruto_user_profile');
    setScreen('main-menu');
  };

  // If not logged in, show Auth Screen
  if (!user) {
    return (
      <AuthScreen
        onLoginSuccess={handleLoginSuccess}
        playClickSound={playClickSound}
      />
    );
  }

  return (
    <div className={`relative z-10 min-h-screen text-slate-100 flex flex-col justify-between selection:bg-orange-600 selection:text-white ${screen === 'battle' ? '' : 'bg-slate-950'}`}>
      {screen === 'main-menu' && (
        <MainMenu
          onStartGame={handleStartGame}
          isMuted={isMuted}
          onToggleMute={() => setIsMuted(!isMuted)}
          playClickSound={playClickSound}
          onOpenAdmin={() => setScreen('admin')}
          user={user}
          onLogout={handleLogout}
        />
      )}

      {screen === 'character-select' && (
        <CharacterSelect
          onConfirmTeams={handleConfirmTeams}
          playClickSound={playClickSound}
          playScrollSound={playScrollSound}
          user={user}
        />
      )}

      {screen === 'battle' && (
        <BattleBoard
          playerTeam={playerTeam}
          enemyTeam={enemyTeam}
          isMuted={isMuted}
          onToggleMute={() => setIsMuted(!isMuted)}
          onQuit={handleQuit}
          playClickSound={playClickSound}
          playScrollSound={playScrollSound}
          playWinSound={playWinSound}
          playLoseSound={playLoseSound}
          user={user}
          onlineParams={onlineParams}
          isSandbox={isSandbox}
        />
      )}

      {screen === 'admin' && (
        <AdminDashboard
          onBack={handleQuit}
          playClickSound={playClickSound}
        />
      )}
    </div>
  );
}

