import { io, Socket } from 'socket.io-client';
import type { GameAction, Vector2, ClassType } from '@dueled/shared';

export class NetworkManager extends Phaser.Events.EventEmitter {
  private socket: Socket | null = null;
  private scene: Phaser.Scene;
  private playerId: string = '';
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 1000;
  private lastPingTime: number = 0;
  private latency: number = 0;
  private serverUrl: string = 'http://localhost:3000';
  private messageQueue: any[] = [];
  private isAuthenticated: boolean = false;

  constructor(scene: Phaser.Scene) {
    super();
    this.scene = scene;
  }

  public initialize(): void {
    this.setupConnection();
    this.setupEventHandlers();
  }

  private setupConnection(): void {
    const token = this.getAuthToken();
    if (!token) {
      console.error('No authentication token found');
      return;
    }

    this.socket = io(`${this.serverUrl}/game`, {
      auth: {
        token,
      },
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: this.reconnectDelay,
      reconnectionAttempts: this.maxReconnectAttempts,
    });

    this.setupSocketEvents();
  }

  private setupSocketEvents(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('Connected to game server');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.emit('connected');
      this.flushMessageQueue();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected from game server:', reason);
      this.isConnected = false;
      this.emit('disconnected', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      this.handleConnectionError(error);
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log(`Reconnected after ${attemptNumber} attempts`);
      this.reconnectAttempts = 0;
      this.emit('reconnected', attemptNumber);
    });

    this.socket.on('reconnect_error', (error) => {
      console.error('Reconnection error:', error);
      this.reconnectAttempts++;
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.emit('reconnection-failed');
      }
    });

    // Authentication events
    this.socket.on('connected', (data) => {
      console.log('Authentication successful:', data);
      this.isAuthenticated = true;
      this.playerId = data.playerId;
      this.emit('authenticated', data);
    });

    this.socket.on('authentication_required', (data) => {
      console.error('Authentication required:', data);
      this.emit('authentication-required', data);
    });

    // Game events
    this.socket.on('match_found', (data) => {
      console.log('Match found:', data);
      this.emit('match-found', data);
    });

    this.socket.on('match_joined', (data) => {
      console.log('Match joined:', data);
      this.emit('match-joined', data);
    });

    this.socket.on('player_joined', (data) => {
      console.log('Player joined:', data);
      this.emit('player-joined', data);
    });

    this.socket.on('player_left', (data) => {
      console.log('Player left:', data);
      this.emit('player-left', data);
    });

    this.socket.on('player_moved', (data) => {
      this.emit('player-moved', data);
    });

    this.socket.on('player_ready', (data) => {
      console.log('Player ready:', data);
      this.emit('player-ready', data);
    });

    this.socket.on('game_start', (data) => {
      console.log('Game started:', data);
      this.emit('game-start', data);
    });

    this.socket.on('game_update', (data) => {
      this.emit('game-update', data);
    });

    this.socket.on('action_acknowledged', (data) => {
      this.emit('action-acknowledged', data);
    });

    this.socket.on('action_rejected', (data) => {
      console.warn('Action rejected:', data);
      this.emit('action-rejected', data);
    });

    this.socket.on('move_acknowledged', (data) => {
      this.emit('move-acknowledged', data);
    });

    this.socket.on('move_rejected', (data) => {
      console.warn('Move rejected:', data);
      this.emit('move-rejected', data);
    });

    // Connection quality events
    this.socket.on('heartbeat', (data) => {
      this.handleHeartbeat(data);
    });

    this.socket.on('latency', (data) => {
      this.latency = data.latency;
      this.emit('latency-update', data);
    });

    // Error events
    this.socket.on('error', (data) => {
      console.error('Socket error:', data);
      this.emit('error', data);
    });

    // Reconnection events
    this.socket.on('reconnected', (data) => {
      console.log('Reconnected to match:', data);
      this.emit('reconnected-to-match', data);
    });

    this.socket.on('missed_events', (data) => {
      console.log('Received missed events:', data);
      this.emit('missed-events', data);
    });
  }

  private setupEventHandlers(): void {
    // Handle authentication required
    this.on('authentication-required', () => {
      this.handleAuthenticationRequired();
    });

    // Handle connection loss
    this.on('disconnected', (reason) => {
      this.handleDisconnection(reason);
    });

    // Handle reconnection
    this.on('reconnected', () => {
      this.handleReconnection();
    });
  }

  private handleConnectionError(error: any): void {
    console.error('Connection error:', error);
    this.emit('connection-error', error);
  }

  private handleAuthenticationRequired(): void {
    // Try to re-authenticate
    const token = this.getAuthToken();
    if (token && this.socket) {
      this.socket.auth = { token };
      this.socket.disconnect();
      this.socket.connect();
    } else {
      this.emit('authentication-failed');
    }
  }

  private handleDisconnection(reason: string): void {
    this.isConnected = false;
    this.isAuthenticated = false;
    
    // Show disconnection message
    this.emit('connection-lost', reason);
  }

  private handleReconnection(): void {
    // Flush any queued messages
    this.flushMessageQueue();
    
    // Request state synchronization
    this.requestStateSync();
  }

  private handleHeartbeat(data: any): void {
    // Respond to heartbeat
    if (this.socket) {
      this.socket.emit('heartbeat_response', {
        timestamp: data.timestamp,
        clientTime: Date.now(),
      });
    }
  }

  private getAuthToken(): string | null {
    // First try localStorage (primary source)
    const localToken = localStorage.getItem('authToken');
    if (localToken) {
      return localToken;
    }
    
    // Try to get from Zustand store if available
    try {
      const storeData = localStorage.getItem('dueled-auth');
      if (storeData) {
        const parsed = JSON.parse(storeData);
        if (parsed.state && parsed.state.token) {
          return parsed.state.token;
        }
      }
    } catch (error) {
      console.warn('Failed to parse auth store data:', error);
    }
    
    return null;
  }

  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (this.socket && this.isConnected) {
        this.socket.emit(message.event, message.data);
      }
    }
  }

  private queueMessage(event: string, data: any): void {
    if (this.messageQueue.length < 100) { // Limit queue size
      this.messageQueue.push({ event, data });
    }
  }

  private requestStateSync(): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('request_state_sync');
    }
  }

  // Public methods
  public joinQueue(classType: ClassType): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('join_queue', { classType });
    } else {
      this.queueMessage('join_queue', { classType });
    }
  }

  public leaveQueue(): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('leave_queue');
    } else {
      this.queueMessage('leave_queue', {});
    }
  }

  public getQueueStatus(): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('queue_status');
    } else {
      this.queueMessage('queue_status', {});
    }
  }

  public joinMatch(matchId: string, classType: ClassType): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('join_match', { matchId, classType });
    } else {
      this.queueMessage('join_match', { matchId, classType });
    }
  }

  public leaveMatch(matchId: string): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('leave_match', { matchId });
    } else {
      this.queueMessage('leave_match', { matchId });
    }
  }

  public sendGameReady(matchId: string): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('game_ready', { matchId });
    } else {
      this.queueMessage('game_ready', { matchId });
    }
  }

  public sendPlayerAction(action: GameAction): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('player_action', {
        ...action,
        timestamp: Date.now(),
      });
    } else {
      this.queueMessage('player_action', {
        ...action,
        timestamp: Date.now(),
      });
    }
  }

  public sendPlayerMove(position: Vector2, velocity: Vector2, rotation?: number, important: boolean = false): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('player_move', {
        position,
        velocity,
        rotation,
        important,
        timestamp: Date.now(),
      });
    } else if (important) {
      // Only queue important moves
      this.queueMessage('player_move', {
        position,
        velocity,
        rotation,
        important,
        timestamp: Date.now(),
      });
    }
  }

  public sendChatMessage(message: string, type: 'all' | 'team' = 'all'): void {
    if (this.socket && this.isConnected) {
      this.socket.emit('chat_message', {
        message,
        type,
        timestamp: Date.now(),
      });
    } else {
      this.queueMessage('chat_message', {
        message,
        type,
        timestamp: Date.now(),
      });
    }
  }

  public ping(): void {
    if (this.socket && this.isConnected) {
      this.lastPingTime = Date.now();
      this.socket.emit('ping', { timestamp: this.lastPingTime });
    }
  }

  // Getters
  public isConnectedToServer(): boolean {
    return this.isConnected;
  }

  public isUserAuthenticated(): boolean {
    return this.isAuthenticated;
  }

  public getPlayerId(): string {
    return this.playerId;
  }

  public getLatency(): number {
    return this.latency;
  }

  public getConnectionStatus(): string {
    if (!this.socket) return 'disconnected';
    if (this.isConnected && this.isAuthenticated) return 'connected';
    if (this.isConnected) return 'authenticating';
    return 'connecting';
  }

  // Cleanup
  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnected = false;
    this.isAuthenticated = false;
    this.playerId = '';
    this.messageQueue = [];
  }

  public destroy(): void {
    this.disconnect();
    this.removeAllListeners();
  }
}