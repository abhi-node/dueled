import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { io, Socket } from 'socket.io-client';
import { MatchFoundNotification } from '../common/MatchFoundNotification';
import type { ClassType } from '@dueled/shared';

export function MainMenu() {
  const [isInQueue, setIsInQueue] = useState(false);
  const [selectedClass, setSelectedClass] = useState<ClassType>('berserker' as ClassType);
  const [queueStatus, setQueueStatus] = useState<{
    inQueue: boolean;
    estimatedWait: number;
    queuePosition?: number;
  }>({ inQueue: false, estimatedWait: 0 });
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [matchFound, setMatchFound] = useState(false);
  const [matchData, setMatchData] = useState<any>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'info' | 'success' | 'warning' | 'error' } | null>(null);
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();

  useEffect(() => {
    // Initialize socket connection
    if (isAuthenticated) {
      initializeSocket();
    } else {
      setConnectionStatus('disconnected');
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
    }
    
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [isAuthenticated]);

  const initializeSocket = () => {
    // Try multiple token sources
    let token = localStorage.getItem('authToken');
    
    // If no token in localStorage, try Zustand store
    if (!token) {
      try {
        const storeData = localStorage.getItem('dueled-auth');
        if (storeData) {
          const parsed = JSON.parse(storeData);
          token = parsed.state?.token;
        }
      } catch (error) {
        console.warn('Failed to parse auth store data:', error);
      }
    }
    
    if (!token) {
      console.warn('No authentication token found, cannot connect to WebSocket');
      setConnectionStatus('disconnected');
      return;
    }

    console.log('Connecting to WebSocket with token...');
    setConnectionStatus('connecting');
    
    const newSocket = io('http://localhost:3000/game', {
      auth: { token },
      autoConnect: true,
    });

    newSocket.on('connect', () => {
      console.log('WebSocket connected successfully');
      setConnectionStatus('connected');
    });

    newSocket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      setConnectionStatus('disconnected');
    });

    newSocket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      setConnectionStatus('disconnected');
    });

    newSocket.on('queue_joined', (data) => {
      setIsInQueue(true);
      setQueueStatus(prev => ({ ...prev, inQueue: true }));
    });

    newSocket.on('queue_left', (data) => {
      setIsInQueue(false);
      setQueueStatus({ inQueue: false, estimatedWait: 0 });
    });

    newSocket.on('queue_status', (data) => {
      setQueueStatus(data);
    });

    newSocket.on('match_found', (data) => {
      console.log('Match found!', data);
      setMatchFound(true);
      setMatchData(data);
      setIsInQueue(false);
    });

    newSocket.on('match_decline_confirmed', (data) => {
      console.log('Match decline confirmed:', data);
      setIsInQueue(false);
      setQueueStatus({ inQueue: false, estimatedWait: 0 });
      // Show notification to user
      setNotification({
        message: data.message || 'You have been removed from the queue.',
        type: 'info'
      });
      setTimeout(() => setNotification(null), 5000);
    });

    newSocket.on('back_in_queue', (data) => {
      console.log('Back in queue after opponent decline:', data);
      setMatchFound(false);
      setMatchData(null);
      setIsInQueue(true);
      setQueueStatus(prev => ({ ...prev, inQueue: true }));
      // Show notification to user
      setNotification({
        message: data.message || 'Your opponent declined the match. You have been returned to the queue.',
        type: 'warning'
      });
      setTimeout(() => setNotification(null), 5000);
    });

    newSocket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    setSocket(newSocket);
  };

  const handleQuickMatch = () => {
    if (!socket || !isAuthenticated) return;
    
    socket.emit('join_queue', { classType: selectedClass });
  };

  const handleCancelQueue = () => {
    if (!socket) return;
    
    socket.emit('leave_queue');
  };

  const handleAcceptMatch = () => {
    if (!matchData) return;
    
    setMatchFound(false);
    // Navigate to game with match ID and selected class
    navigate('/game', { 
      state: { 
        matchId: matchData.matchId, 
        matchData,
        selectedClass: selectedClass 
      } 
    });
  };

  const handleDeclineMatch = () => {
    if (!socket || !matchData) return;
    
    // Send decline to server
    socket.emit('match_declined', { matchId: matchData.matchId });
    
    // Clear the match popup immediately
    setMatchFound(false);
    setMatchData(null);
    
    // Don't automatically rejoin queue - user is completely removed
    console.log('Match declined, removed from queue');
  };

  const handleLoginClick = (e: React.MouseEvent) => {
    console.log('Login/Register button clicked!');
    e.preventDefault();
    navigate('/auth');
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh]">
      <div className="text-center mb-12">
        <h1 className="text-6xl font-bold text-dueled-500 mb-4 text-shadow font-game">
          DUELED
        </h1>
        <p className="text-xl text-arena-300 mb-8">
          Real-time 1v1 Combat Arena
        </p>
        {isAuthenticated && user && (
          <div className="bg-dueled-900 border border-dueled-600 text-dueled-300 px-6 py-3 rounded-lg mb-4">
            <p className="font-bold">
              Welcome back, {user.username}!
            </p>
            <p className="text-sm">
              Rating: {user.rating || 1000} • Ready to duel?
            </p>
          </div>
        )}
      </div>

      <div className={`grid gap-6 w-full max-w-2xl ${isAuthenticated ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'}`}>
        {!isInQueue ? (
          <>
            {isAuthenticated ? (
              <button
                onClick={handleQuickMatch}
                className="btn-primary text-xl py-4 px-8 rounded-lg glow hover:glow-intense transform hover:scale-105 transition-all duration-200"
                disabled={!socket || connectionStatus !== 'connected'}
              >
                Start Quick Match
              </button>
            ) : (
              <button
                onClick={() => navigate('/game')}
                className="btn-primary text-xl py-4 px-8 rounded-lg glow hover:glow-intense transform hover:scale-105 transition-all duration-200"
              >
                Play Demo
              </button>
            )}
            
            {!isAuthenticated && (
              <Link
                to="/auth"
                className="btn-secondary text-xl py-4 px-8 rounded-lg text-center transform hover:scale-105 transition-all duration-200"
                                 onClick={() => {
                   console.log('Link clicked! Navigating to /auth');
                 }}
              >
                Login / Register
              </Link>
            )}
          </>
        ) : (
          <div className="col-span-2 text-center">
            <div className="card p-8">
              <div className="animate-pulse-slow mb-4">
                <div className="w-12 h-12 border-4 border-dueled-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
              </div>
              <h3 className="text-xl font-bold text-dueled-500 mb-2">
                Finding Opponent...
              </h3>
              <div className="text-arena-300 mb-4">
                <p>Playing as: <span className="text-dueled-500 font-semibold capitalize">{selectedClass}</span></p>
                <p>Estimated wait time: {Math.round(queueStatus.estimatedWait / 1000)} seconds</p>
                {queueStatus.queuePosition && (
                  <p>Queue position: {queueStatus.queuePosition}</p>
                )}
              </div>
              
              {/* Queue progress visualization */}
              <div className="mb-4">
                <div className="w-full bg-arena-700 rounded-full h-2">
                  <div 
                    className="bg-dueled-500 h-2 rounded-full transition-all duration-1000"
                    style={{ 
                      width: `${Math.min(100, (30 - Math.round(queueStatus.estimatedWait / 1000)) / 30 * 100)}%` 
                    }}
                  />
                </div>
                <div className="text-xs text-arena-400 mt-1">
                  Searching for players...
                </div>
              </div>
              
              <button
                onClick={handleCancelQueue}
                className="btn-danger mt-4"
              >
                Cancel Queue
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-12 text-center">
        <h3 className="text-xl font-bold text-arena-300 mb-4">Choose Your Class</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl">
          {[
            { name: 'Berserker', icon: '⚔️', color: 'text-red-500', type: 'berserker' as ClassType },
            { name: 'Mage', icon: '🧙', color: 'text-blue-500', type: 'mage' as ClassType },
            { name: 'Bomber', icon: '💣', color: 'text-orange-500', type: 'bomber' as ClassType },
            { name: 'Archer', icon: '🏹', color: 'text-green-500', type: 'archer' as ClassType },
          ].map((classType) => (
            <div
              key={classType.name}
              className={`card p-4 text-center hover:bg-arena-700 transition-colors cursor-pointer ${
                selectedClass === classType.type ? 'ring-2 ring-dueled-500 bg-arena-700' : ''
              }`}
              onClick={() => setSelectedClass(classType.type)}
            >
              <div className={`text-4xl mb-2 ${classType.color}`}>
                {classType.icon}
              </div>
              <h4 className="font-bold">{classType.name}</h4>
              {selectedClass === classType.type && (
                <div className="mt-2 text-xs text-dueled-500">Selected</div>
              )}
            </div>
          ))}
        </div>
      </div>
      
      {/* Connection Status */}
      {isAuthenticated && (
        <div className="mt-6 text-center">
          <div className={`inline-flex items-center space-x-2 px-3 py-1 rounded-full text-sm ${
            connectionStatus === 'connected' ? 'bg-green-900 text-green-300' :
            connectionStatus === 'connecting' ? 'bg-yellow-900 text-yellow-300' :
            'bg-red-900 text-red-300'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              connectionStatus === 'connected' ? 'bg-green-500' :
              connectionStatus === 'connecting' ? 'bg-yellow-500' :
              'bg-red-500'
            }`} />
            <span>{connectionStatus === 'connected' ? 'Connected' : 
                   connectionStatus === 'connecting' ? 'Connecting...' : 'Disconnected'}</span>
          </div>
        </div>
      )}
      
      {/* Match Found Notification */}
      <MatchFoundNotification
        isVisible={matchFound}
        matchData={matchData}
        onAccept={handleAcceptMatch}
        onDecline={handleDeclineMatch}
        countdown={30}
      />
      
      {/* Status Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-sm animate-slideIn ${
          notification.type === 'info' ? 'bg-blue-900 border border-blue-600 text-blue-100' :
          notification.type === 'success' ? 'bg-green-900 border border-green-600 text-green-100' :
          notification.type === 'warning' ? 'bg-yellow-900 border border-yellow-600 text-yellow-100' :
          'bg-red-900 border border-red-600 text-red-100'
        }`}>
          <div className="flex items-start">
            <div className="flex-1">
              <p className="text-sm font-medium">{notification.message}</p>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="ml-2 text-current opacity-70 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}