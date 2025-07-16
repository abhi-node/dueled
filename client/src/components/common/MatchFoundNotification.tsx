import { useState, useEffect } from 'react';

interface MatchFoundNotificationProps {
  isVisible: boolean;
  matchData: any | null;
  onAccept: () => void;
  onDecline: () => void;
  countdown: number;
}

export function MatchFoundNotification({ 
  isVisible, 
  matchData,
  onAccept, 
  onDecline, 
  countdown 
}: MatchFoundNotificationProps) {
  const [timeLeft, setTimeLeft] = useState(countdown);
  const [notificationPermission, setNotificationPermission] = useState(Notification.permission);

  const requestNotificationPermission = async () => {
    try {
      // Only request if we're in a user gesture context
      if (document.hasStorageAccess && typeof document.hasStorageAccess === 'function') {
        const permission = await Notification.requestPermission();
        setNotificationPermission(permission);
      }
    } catch (error) {
      console.warn('Failed to request notification permission:', error);
    }
  };

  useEffect(() => {
    if (!isVisible) return;

    setTimeLeft(countdown);
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          onDecline(); // Auto-decline when time runs out
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isVisible, countdown, onDecline]);

  useEffect(() => {
    if (isVisible) {
      // Play notification sound
      playNotificationSound();
      
      // Create desktop notification if supported and permission granted
      if (notificationPermission === 'granted') {
        try {
          new Notification('Match Found!', {
            body: 'A match has been found. Click to accept.',
            icon: '/favicon.ico',
            tag: 'match-found',
          });
        } catch (error) {
          console.warn('Failed to show notification:', error);
        }
      }
    }
  }, [isVisible]);

  const playNotificationSound = () => {
    // Create audio context for notification sound
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Create a simple beep sound
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
    oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime + 0.2);
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 animate-fadeIn">
      <div className="bg-arena-800 border-2 border-dueled-500 rounded-lg p-8 max-w-md w-full mx-4 animate-slideIn">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="text-4xl mb-2 animate-pulse">🎯</div>
          <h2 className="text-2xl font-bold text-dueled-500 mb-2">Match Found!</h2>
          <p className="text-arena-300">
            An opponent has been found. Accept to join the match.
          </p>
        </div>

        {/* Opponent Info */}
        {matchData?.opponent && (
          <div className="mb-6 p-4 bg-arena-700 rounded-lg">
            <div className="text-center">
              <p className="text-sm text-arena-400 mb-1">Opponent</p>
              <p className="text-xl font-bold text-white">{matchData.opponent.username}</p>
              <p className="text-sm text-arena-300">
                Rating: {matchData.opponent.rating} | 
                Class: <span className="capitalize">{matchData.opponent.classType}</span>
              </p>
            </div>
          </div>
        )}

        {/* Countdown Timer */}
        <div className="mb-6">
          <div className="text-center mb-4">
            <div className="text-3xl font-bold text-white mb-2">{timeLeft}</div>
            <div className="text-sm text-arena-400">seconds remaining</div>
          </div>
          
          {/* Progress bar */}
          <div className="w-full bg-arena-700 rounded-full h-2">
            <div 
              className="bg-dueled-500 h-2 rounded-full transition-all duration-1000"
              style={{ 
                width: `${(timeLeft / countdown) * 100}%` 
              }}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-4">
          <button
            onClick={onAccept}
            className="flex-1 btn-primary py-3 text-lg font-semibold hover:scale-105 transform transition-all duration-200"
          >
            Accept Match
          </button>
          <button
            onClick={onDecline}
            className="flex-1 btn-secondary py-3 text-lg font-semibold hover:scale-105 transform transition-all duration-200"
          >
            Decline
          </button>
        </div>

        {/* Notification Permission */}
        {notificationPermission === 'default' && (
          <div className="mt-4 text-center">
            <button
              onClick={requestNotificationPermission}
              className="text-xs text-dueled-400 hover:text-dueled-300 underline"
            >
              Enable notifications for future matches
            </button>
          </div>
        )}
        
        {/* Warning Text */}
        <div className="mt-2 text-center text-xs text-arena-400">
          Declining will remove you from the queue completely. Your opponent will be returned to the queue.
        </div>
      </div>
    </div>
  );
}

// Note: Notification permission will be requested when user interacts with match found notification