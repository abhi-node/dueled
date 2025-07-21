/**
 * GameSocket - Socket.IO communication with game server
 * 
 * Handles connection, authentication, and message routing
 * between client and server during gameplay.
 */

import { io, Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  ConnectionState,
  ConnectionInfo,
  NetworkError,
  DeltaUpdate,
  MatchStartData,
  MatchEndData,
  RoundStartData,
  RoundEndData
} from '../types/NetworkTypes.js';
import type { InputBatch } from '../types/InputTypes.js';
import { NETWORK_CONSTANTS, ERROR_CODES } from '../types/NetworkTypes.js';

export class GameSocket {
  private socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
  private connectionInfo: ConnectionInfo = { state: 'disconnected' };
  private reconnectAttempts = 0;
  private heartbeatTimer: number | null = null;
  private pingStartTime = 0;
  
  // Event callbacks
  private callbacks = {
    onConnectionChange: (info: ConnectionInfo) => {},
    onDeltaUpdate: (delta: DeltaUpdate) => {},
    onMatchStart: (data: MatchStartData) => {},
    onMatchEnd: (data: MatchEndData) => {},
    onRoundStart: (data: RoundStartData) => {},
    onRoundEnd: (data: RoundEndData) => {},
    onCountdownTick: (roundNumber: number, countdown: number) => {},
    onCountdownComplete: (roundNumber: number) => {},
    onReturnToLobby: (matchId: string) => {},
    onError: (error: NetworkError) => {}
  };
  
  constructor() {
    // Initialize connection info
    this.updateConnectionState('disconnected');
    
    // Setup explicit disconnect detection
    this.setupDisconnectDetection();
  }
  
  // ============================================================================
  // EXPLICIT DISCONNECT DETECTION
  // ============================================================================

  /**
   * Setup detection for intentional disconnects (browser close, etc.)
   */
  private setupDisconnectDetection(): void {
    // Detect browser/tab close
    window.addEventListener('beforeunload', () => {
      this.sendExplicitDisconnect('browser_close');
    });

    // Detect when page becomes hidden (tab switch, minimize)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.isConnected() && this.connectionInfo.matchId) {
        // Don't disconnect immediately on tab switch, but notify server
        console.log('🔍 Tab hidden during match - potential disconnect');
        // Could add logic here to handle tab switches during matches
      }
    });

    // Handle page refresh/navigation
    window.addEventListener('pagehide', () => {
      this.sendExplicitDisconnect('page_navigation');
    });
  }

  // ============================================================================
  // CONNECTION MANAGEMENT
  // ============================================================================
  
  /**
   * Connect to the game server
   */
  async connect(serverUrl: string, authToken: string): Promise<void> {
    if (this.socket?.connected) {
      console.warn('Already connected to game server');
      return;
    }
    
    this.updateConnectionState('connecting');
    
    try {
      // Create socket connection
      this.socket = io(serverUrl, {
        auth: { token: authToken },
        timeout: NETWORK_CONSTANTS.CONNECTION_TIMEOUT,
        retries: NETWORK_CONSTANTS.RECONNECT_ATTEMPTS
      });
      
      // Setup event listeners
      this.setupEventListeners();
      
      // Wait for connection
      await this.waitForConnection();
      
      console.log('Connected to game server');
      
    } catch (error) {
      this.handleConnectionError(error as Error);
      throw error;
    }
  }
  
  /**
   * Connect using existing socket from matchmaking
   */
  async connectWithExistingSocket(existingSocket: any): Promise<void> {
    if (this.socket?.connected) {
      console.warn('[DEBUG] Already connected to game server');
      return;
    }
    
    console.log('🔗 [DEBUG] GameSocket.connectWithExistingSocket START');
    
    this.updateConnectionState('connecting');
    console.log('📝 [DEBUG] Updated connection state to connecting');
    
    try {
      // Use the existing socket
      console.log('🔄 [DEBUG] Assigning existing socket to this.socket');
      this.socket = existingSocket;
      
      // Setup game-specific event listeners
      console.log('👂 [DEBUG] Setting up event listeners');
      this.setupEventListeners();
      console.log('✅ [DEBUG] Event listeners setup complete');
      
      // Update connection state
      if (this.socket.connected) {
        console.log('🟢 [DEBUG] Socket is connected, updating state');
        this.updateConnectionState('connected');
        // COMMENTED OUT FOR DEBUGGING
        // this.startHeartbeat();
        console.log('💓 [DEBUG] Heartbeat started');
        console.log('✅ [DEBUG] GameSocket.connectWithExistingSocket COMPLETE');
      } else {
        console.error('❌ [DEBUG] Existing socket is not connected!');
        throw new Error('Existing socket is not connected');
      }
      
    } catch (error) {
      console.error('💥 [DEBUG] Error in connectWithExistingSocket:', error);
      this.handleConnectionError(error as Error);
      throw error;
    }
  }
  
  /**
   * Disconnect from the game server
   */
  disconnect(reason = 'user_disconnect'): void {
    if (this.socket) {
      // Send disconnect message
      this.socket.emit('player_disconnect', { reason });
      
      // Clean up
      this.cleanup();
    }
    
    this.updateConnectionState('disconnected');
    console.log('Disconnected from game server:', reason);
  }
  
  private async waitForConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket not initialized'));
        return;
      }
      
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, NETWORK_CONSTANTS.CONNECTION_TIMEOUT);
      
      this.socket.on('connect', () => {
        clearTimeout(timeout);
        this.updateConnectionState('connected');
        resolve();
      });
      
      this.socket.on('connect_error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }
  
  // ============================================================================
  // EVENT LISTENERS
  // ============================================================================
  
  private setupEventListeners(): void {
    if (!this.socket) return;
    
    // Connection events
    this.socket.on('connect', this.onConnect);
    this.socket.on('disconnect', this.onDisconnect);
    this.socket.on('connect_error', this.onConnectError);
    
    // Authentication
    this.socket.on('connection_confirmed', this.onConnectionConfirmed);
    
    // Game events
    this.socket.on('game_state_delta', this.onGameStateDelta);
    this.socket.on('match_start', this.onMatchStart);
    this.socket.on('match_end', this.onMatchEnd);
    this.socket.on('round_start', this.onRoundStart);
    this.socket.on('round_end', this.onRoundEnd);
    
    // Round system events
    this.socket.on('countdown_tick', this.onCountdownTick);
    this.socket.on('countdown_complete', this.onCountdownComplete);
    this.socket.on('return_to_lobby', this.onReturnToLobby);
    
    // Error handling
    this.socket.on('error', this.onServerError);
    
    // Ping/pong for latency measurement
    this.socket.on('pong', this.onPong);
  }
  
  private onConnect = (): void => {
    console.log('Socket connected');
    this.updateConnectionState('connected');
    this.reconnectAttempts = 0;
    // COMMENTED OUT FOR DEBUGGING
    // this.startHeartbeat();
  };
  
  private onDisconnect = (reason: string): void => {
    console.log('Socket disconnected:', reason);
    this.updateConnectionState('disconnected');
    // COMMENTED OUT FOR DEBUGGING
    // this.stopHeartbeat();
    
    // Attempt reconnection if not intentional
    if (reason !== 'io client disconnect') {
      this.attemptReconnect();
    }
  };
  
  private onConnectError = (error: Error): void => {
    console.error('Connection error:', error);
    this.handleConnectionError(error);
  };
  
  private onConnectionConfirmed = (data: { playerId: string; serverTime: number }): void => {
    console.log('Connection confirmed, player ID:', data.playerId);
    
    this.connectionInfo.playerId = data.playerId;
    this.connectionInfo.serverTimeDelta = Date.now() - data.serverTime;
    this.updateConnectionState('authenticated');
  };
  
  /**
   * Handle incoming game state delta from server
   * 
   * Forwards delta updates to the GameEngine for processing.
   * 
   * @param delta - Server delta update
   */
  private onGameStateDelta = (delta: DeltaUpdate): void => {
    this.callbacks.onDeltaUpdate(delta);
  };
  
  private onMatchStart = (data: MatchStartData): void => {
    console.log('Match started:', data.matchId);
    this.connectionInfo.matchId = data.matchId;
    this.updateConnectionState('in_match');
    this.callbacks.onMatchStart(data);
  };
  
  private onMatchEnd = (data: MatchEndData): void => {
    console.log('Match ended, winner:', data.winnerId);
    // Keep connection alive - don't clear matchId yet
    // Wait for return_to_lobby event for final cleanup
    this.callbacks.onMatchEnd(data);
  };
  
  private onRoundStart = (data: RoundStartData): void => {
    this.callbacks.onRoundStart(data);
  };
  
  private onRoundEnd = (data: RoundEndData): void => {
    this.callbacks.onRoundEnd(data);
  };
  
  private onCountdownTick = (data: { roundNumber: number; countdown: number }): void => {
    console.log(`Countdown: ${data.countdown}`);
    this.callbacks.onCountdownTick(data.roundNumber, data.countdown);
  };
  
  private onCountdownComplete = (data: { roundNumber: number }): void => {
    console.log(`Round ${data.roundNumber} starting!`);
    this.callbacks.onCountdownComplete(data.roundNumber);
  };
  
  private onReturnToLobby = (data: { matchId: string }): void => {
    console.log('Returning to lobby from match:', data.matchId);
    
    // Now it's safe to clear match state and return to lobby
    this.connectionInfo.matchId = undefined;
    this.updateConnectionState('authenticated');
    
    this.callbacks.onReturnToLobby(data.matchId);
  };
  
  private onServerError = (data: { message: string; code?: string }): void => {
    const error: NetworkError = {
      code: data.code || 'SERVER_ERROR',
      message: data.message,
      timestamp: Date.now(),
      recoverable: true // Most server errors are recoverable
    };
    
    this.callbacks.onError(error);
  };
  
  private onPong = (data: { timestamp: number; serverTime: number }): void => {
    const ping = Date.now() - this.pingStartTime;
    this.connectionInfo.ping = ping;
    this.connectionInfo.lastHeartbeat = Date.now();
    
    // Update server time delta
    if (data.serverTime) {
      this.connectionInfo.serverTimeDelta = Date.now() - data.serverTime;
    }
  };
  
  // ============================================================================
  // MESSAGE SENDING
  // ============================================================================
  
  /**
   * Send input batch to server
   */
  sendInputBatch(batch: InputBatch): void {
    if (!this.isConnected()) {
      console.warn('Cannot send input batch: not connected');
      return;
    }

    // Always tag the batch with the active match so the server can route it
    const payload = {
      matchId: this.connectionInfo.matchId,
      ...batch                    // { commands, clientTime }
    };

    this.socket!.emit('input_batch', payload);
  }
  
  /**
   * Signal that player is ready
   */
  sendPlayerReady(): void {
    if (!this.isConnected() || !this.connectionInfo.playerId) {
      console.warn('Cannot send player ready: not authenticated');
      return;
    }
    
    this.socket!.emit('player_ready', { playerId: this.connectionInfo.playerId });
  }

  /**
   * Send exit match event to server (before disconnecting)
   */
  sendExitMatch(): void {
    if (!this.isConnected() || !this.connectionInfo.playerId) {
      console.warn('Cannot send exit match: not authenticated');
      return;
    }

    console.log('📤 Sending exit_match event to server');
    this.socket!.emit('exit_match', { 
      playerId: this.connectionInfo.playerId 
    });
  }
  
  /**
   * Send ping to measure latency
   */
  sendPing(): void {
    if (!this.isConnected()) return;
    
    this.pingStartTime = Date.now();
    this.socket!.emit('ping', { timestamp: this.pingStartTime });
  }

  /**
   * Send explicit disconnect notification to server
   */
  sendExplicitDisconnect(reason: string = 'user_action'): void {
    if (!this.isConnected()) return;
    
    console.log(`🚪 Sending explicit disconnect: ${reason}`);
    this.socket!.emit('explicit_disconnect', { reason });
  }
  
  // ============================================================================
  // CONNECTION STATE
  // ============================================================================
  
  private updateConnectionState(state: ConnectionState): void {
    if (this.connectionInfo.state !== state) {
      this.connectionInfo.state = state;
      this.callbacks.onConnectionChange({ ...this.connectionInfo });
    }
  }
  
  /**
   * Check if socket is connected and authenticated
   */
  isConnected(): boolean {
    return this.socket?.connected === true && 
           ['authenticated', 'in_match'].includes(this.connectionInfo.state);
  }
  
  /**
   * Check if currently in a match
   */
  isInMatch(): boolean {
    return this.connectionInfo.state === 'in_match';
  }
  
  /**
   * Get current connection info
   */
  getConnectionInfo(): Readonly<ConnectionInfo> {
    return { ...this.connectionInfo };
  }
  
  // ============================================================================
  // HEARTBEAT AND PING
  // ============================================================================
  
  private startHeartbeat(): void {
    this.heartbeatTimer = window.setInterval(() => {
      this.sendPing();
    }, NETWORK_CONSTANTS.HEARTBEAT_INTERVAL);
  }
  
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
  
  // ============================================================================
  // ERROR HANDLING AND RECONNECTION
  // ============================================================================
  
  private handleConnectionError(error: Error): void {
    const networkError: NetworkError = {
      code: ERROR_CODES.CONNECTION_LOST,
      message: error.message,
      timestamp: Date.now(),
      recoverable: this.reconnectAttempts < NETWORK_CONSTANTS.RECONNECT_ATTEMPTS
    };
    
    this.callbacks.onError(networkError);
  }
  
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= NETWORK_CONSTANTS.RECONNECT_ATTEMPTS) {
      console.error('Max reconnection attempts reached');
      return;
    }
    
    this.reconnectAttempts++;
    console.log(`Attempting reconnection ${this.reconnectAttempts}/${NETWORK_CONSTANTS.RECONNECT_ATTEMPTS}`);
    
    setTimeout(() => {
      if (this.socket && !this.socket.connected) {
        this.socket.connect();
      }
    }, NETWORK_CONSTANTS.RECONNECT_DELAY);
  }
  
  // ============================================================================
  // CLEANUP
  // ============================================================================
  
  private cleanup(): void {
    // COMMENTED OUT FOR DEBUGGING
    // this.stopHeartbeat();
    
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    
    this.reconnectAttempts = 0;
  }
  
  // ============================================================================
  // CALLBACK MANAGEMENT
  // ============================================================================
  
  /**
   * Set event callbacks
   */
  setCallbacks(callbacks: Partial<typeof this.callbacks>): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }
  
  /**
   * Remove all callbacks
   */
  clearCallbacks(): void {
    this.callbacks = {
      onConnectionChange: () => {},
      onDeltaUpdate: () => {},
      onMatchStart: () => {},
      onMatchEnd: () => {},
      onRoundStart: () => {},
      onRoundEnd: () => {},
      onCountdownTick: () => {},
      onCountdownComplete: () => {},
      onReturnToLobby: () => {},
      onError: () => {}
    };
  }
  
  /**
   * Cleanup all resources
   */
  destroy(): void {
    this.disconnect('client_shutdown');
    this.clearCallbacks();
  }
}