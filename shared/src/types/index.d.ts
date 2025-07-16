export interface Player {
    id: string;
    username?: string;
    isAnonymous: boolean;
    rating: number;
    classType?: ClassType;
    position?: Vector2;
    health?: number;
    armor?: number;
}
export interface Vector2 {
    x: number;
    y: number;
}
export declare enum ClassType {
    BERSERKER = "berserker",
    MAGE = "mage",
    BOMBER = "bomber",
    ARCHER = "archer"
}
export declare enum DamageType {
    PHYSICAL = "physical",
    FIRE = "fire",
    ICE = "ice",
    PIERCING = "piercing"
}
export interface AuthRequest {
    username?: string;
    email?: string;
    password?: string;
}
export interface AuthResponse {
    success: boolean;
    token?: string;
    player?: Player;
    error?: string;
}
export interface Match {
    id: string;
    player1Id: string;
    player2Id: string;
    player1Class: ClassType;
    player2Class: ClassType;
    status: MatchStatus;
    createdAt: Date;
    endedAt?: Date;
    winnerId?: string;
}
export declare enum MatchStatus {
    WAITING = "waiting",
    IN_PROGRESS = "in_progress",
    COMPLETED = "completed",
    CANCELLED = "cancelled"
}
export interface QueueEntry {
    playerId: string;
    classType: ClassType;
    rating: number;
    timestamp: number;
}
export interface MatchmakingStatus {
    inQueue: boolean;
    estimatedWait: number;
    queuePosition?: number;
}
export interface GameAction {
    type: ActionType;
    playerId: string;
    data: any;
    timestamp: number;
}
export declare enum ActionType {
    MOVE = "move",
    ATTACK = "attack",
    USE_ABILITY = "use_ability",
    DISCONNECT = "disconnect"
}
export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    timestamp: number;
}
export interface GameState {
    matchId: string;
    players: Map<string, Player>;
    arena: Arena;
    gameTime: number;
    status: MatchStatus;
}
export interface Arena {
    width: number;
    height: number;
    obstacles: Obstacle[];
    spawnPoints: Vector2[];
}
export interface Obstacle {
    id: string;
    position: Vector2;
    size: Vector2;
    type: ObstacleType;
}
export declare enum ObstacleType {
    WALL = "wall",
    PILLAR = "pillar",
    DESTRUCTIBLE = "destructible"
}
//# sourceMappingURL=index.d.ts.map