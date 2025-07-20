import { useState, useEffect } from 'react';
import { useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { io, Socket } from 'socket.io-client';
// Removed MatchFoundNotification import - now handled by socket events
import type { ClassType } from '@dueled/shared';

export function MainMenu() {
  const [isInQueue, setIsInQueue] = useState(false);
  // Default to gunslinger class
  const [selectedClass, setSelectedClass] = useState<ClassType>('gunslinger' as ClassType);
  // Keep the latest class in a ref so socket callbacks always use the up-to-date value
  const selectedClassRef = useRef<ClassType>('gunslinger' as ClassType);
  const [queueStatus, setQueueStatus] = useState<{
    inQueue: boolean;
    estimatedWait: number;
    queuePosition?: number;
  }>({ inQueue: false, estimatedWait: 0 });
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [matchFound, setMatchFound] = useState(false);
  const [matchData, setMatchData] = useState<any>(null);
  const hasNavigatedRef = useRef(false); // Prevent duplicate navigation in StrictMode
  const [notification, setNotification] = useState<{ message: string; type: 'info' | 'success' | 'warning' | 'error' } | null>(null);
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();

  useEffect(() => {
    try {
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
    } catch (error) {
      console.error('Error in auth effect:', error);
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
    
    const newSocket = io('http://localhost:3000', {
      auth: { token },
      autoConnect: true,
    });

    newSocket.on('connect', () => {
      console.log('WebSocket connected successfully');
      setConnectionStatus('connected');
      
      // Authenticate immediately after connection
      newSocket.emit('authenticate', { token });
    });

    newSocket.on('authenticated', (data) => {
      console.log('WebSocket authenticated successfully:', data);
    });

    newSocket.on('auth_error', (error) => {
      console.error('WebSocket authentication failed:', error);
      setConnectionStatus('disconnected');
    });

    newSocket.on('disconnect', (reason) => {
      console.log('WebSocket disconnected:', reason);
      setConnectionStatus('disconnected');
    });

    newSocket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      setConnectionStatus('disconnected');
    });

    newSocket.on('queue_joined', () => {
      setIsInQueue(true);
      setQueueStatus(prev => ({ ...prev, inQueue: true }));
    });

    newSocket.on('queue_left', () => {
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
      
      // Show opponent details for countdown period
      setNotification({
        message: `Match found! vs ${data.opponent.username} (${data.opponent.classType}) - ${data.opponent.rating} rating`,
        type: 'success'
      });
      
      // Auto-navigate to game after countdown
      setTimeout(() => {
        // Prevent duplicate navigation during StrictMode
        if (hasNavigatedRef.current) {
          console.log('⚠️ MainMenu: Already navigated, skipping duplicate navigation');
          return;
        }
        hasNavigatedRef.current = true;
        
        setMatchFound(false);
        console.log('🚀 MainMenu: Navigating to game with socket:', {
          hasSocket: !!newSocket,
          socketId: newSocket?.id,
          socketConnected: newSocket?.connected,
          matchId: data.matchId,
          selectedClass: selectedClassRef.current
        });
        // Store socket globally to avoid cloning issues
        (window as any).gameSocket = newSocket;
        console.log('🔗 MainMenu: Stored socket on window for game navigation:', {
          socketId: newSocket?.id,
          socketConnected: newSocket?.connected,
          windowGameSocketSet: !!(window as any).gameSocket
        });
        
        navigate('/game', { 
          state: { 
            matchId: data.matchId, 
            matchData: data,
            selectedClass: selectedClassRef.current,
            hasSocket: true // Just indicate that socket is available
          } 
        });
      }, data.countdown || 5000);
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

    // New events for match acceptance flow
    newSocket.on('match_accepted_confirmed', (data) => {
      console.log('Match acceptance confirmed:', data);
      if (data.status === 'WAITING_FOR_OPPONENT') {
        setNotification({
          message: data.message || 'Waiting for opponent to accept...',
          type: 'info'
        });
        setTimeout(() => setNotification(null), 5000);
      } else if (data.status === 'BOTH_ACCEPTED') {
        setNotification({
          message: data.message || 'Both players accepted! Preparing game...',
          type: 'success'
        });
        setTimeout(() => setNotification(null), 3000);
      }
    });

    newSocket.on('opponent_accepted', (data) => {
      console.log('Opponent accepted:', data);
      setNotification({
        message: data.message || 'Your opponent has accepted! Please accept to continue.',
        type: 'success'
      });
      setTimeout(() => setNotification(null), 5000);
    });

    newSocket.on('match_ready', (data) => {
      console.log('Match ready:', data);
      
      // Update match data for the game page
      setMatchData(data);
      
      // Show notification that match is starting
      setNotification({
        message: data.message || 'Match is ready! Joining game...',
        type: 'success'
      });
      setTimeout(() => setNotification(null), 3000);
    });

    newSocket.on('match_timeout', (data) => {
      console.log('Match timed out:', data);
      setMatchFound(false);
      setMatchData(null);
      setIsInQueue(true);
      setQueueStatus(prev => ({ ...prev, inQueue: true }));
      
      setNotification({
        message: data.message || 'Match acceptance timed out. You have been returned to the queue.',
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
    
    socket.emit('join_queue', { classType: selectedClassRef.current });
  };

  const handleCancelQueue = () => {
    if (!socket) return;
    
    socket.emit('leave_queue');
  };

  // Auto-acceptance logic - no manual accept/decline needed

  // Removed unused handleLoginClick function

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
                onClick={() => {
                  // Demo mode - pass current socket or redirect to matchmaking
                  if (socket) {
                    // Store socket globally to avoid cloning issues
                    (window as any).gameSocket = socket;
                    console.log('🔗 MainMenu: Stored socket on window for demo navigation:', {
                      socketId: socket?.id,
                      socketConnected: socket?.connected,
                      windowGameSocketSet: !!(window as any).gameSocket
                    });
                    
                    navigate('/game', { 
                      state: { 
                        matchId: 'demo-match', 
                        selectedClass: selectedClassRef.current,
                        hasSocket: true
                      } 
                    });
                  } else {
                    console.warn('No socket available for demo - redirecting to queue');
                    // Start quick match instead of direct demo
                    handleQuickMatch();
                  }
                }}
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
        <div className="grid grid-cols-3 gap-4 max-w-3xl">
          {[
            { name: 'Gunslinger', icon: '🔫', color: 'text-silver-500', type: 'gunslinger' as ClassType, available: true },
            { name: 'Demolitionist', icon: '💥', color: 'text-orange-500', type: 'demolitionist' as ClassType, available: false },
            { name: 'Buckshot', icon: '🔥', color: 'text-red-500', type: 'buckshot' as ClassType, available: false },
          ].map((classType) => (
            <div
              key={classType.name}
              className={`card p-4 text-center transition-colors ${
                classType.available 
                  ? `hover:bg-arena-700 cursor-pointer ${selectedClass === classType.type ? 'ring-2 ring-dueled-500 bg-arena-700' : ''}`
                  : 'opacity-50 cursor-not-allowed bg-arena-800'
              }`}
              onClick={() => {
                if (classType.available) {
                  setSelectedClass(classType.type);
                  selectedClassRef.current = classType.type;
                }
              }}
            >
              <div className={`text-4xl mb-2 ${classType.available ? classType.color : 'text-gray-500'}`}>
                {classType.icon}
              </div>
              <h4 className={`font-bold ${classType.available ? '' : 'text-gray-500'}`}>
                {classType.name}
              </h4>
              {!classType.available && (
                <div className="mt-2 text-xs text-gray-500">Coming Soon</div>
              )}
              {classType.available && selectedClass === classType.type && (
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
      {matchFound && matchData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-arena-800 border border-dueled-500 rounded-lg p-8 max-w-md text-center">
            <h3 className="text-2xl font-bold text-dueled-500 mb-4">Match Found!</h3>
            
            <div className="mb-6">
              <h4 className="text-lg font-semibold text-white mb-2">Your Opponent</h4>
              <div className="bg-arena-700 rounded-lg p-4">
                <p className="text-dueled-300 font-bold text-xl">{matchData.opponent?.username}</p>
                <p className="text-arena-300 capitalize">{matchData.opponent?.classType}</p>
                <p className="text-arena-300">Rating: {matchData.opponent?.rating}</p>
              </div>
            </div>
            
            <div className="text-arena-300 mb-4">
              <p>Preparing game lobby...</p>
              <div className="w-full bg-arena-700 rounded-full h-2 mt-2">
                <div className="bg-dueled-500 h-2 rounded-full animate-pulse" style={{ width: '100%' }} />
              </div>
            </div>
            
            <p className="text-sm text-arena-400">You will be automatically transported to the arena.</p>
          </div>
        </div>
      )}
      
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