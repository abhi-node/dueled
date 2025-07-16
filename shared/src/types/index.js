"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObstacleType = exports.ActionType = exports.MatchStatus = exports.DamageType = exports.ClassType = void 0;
var ClassType;
(function (ClassType) {
    ClassType["BERSERKER"] = "berserker";
    ClassType["MAGE"] = "mage";
    ClassType["BOMBER"] = "bomber";
    ClassType["ARCHER"] = "archer";
})(ClassType || (exports.ClassType = ClassType = {}));
var DamageType;
(function (DamageType) {
    DamageType["PHYSICAL"] = "physical";
    DamageType["FIRE"] = "fire";
    DamageType["ICE"] = "ice";
    DamageType["PIERCING"] = "piercing";
})(DamageType || (exports.DamageType = DamageType = {}));
var MatchStatus;
(function (MatchStatus) {
    MatchStatus["WAITING"] = "waiting";
    MatchStatus["IN_PROGRESS"] = "in_progress";
    MatchStatus["COMPLETED"] = "completed";
    MatchStatus["CANCELLED"] = "cancelled";
})(MatchStatus || (exports.MatchStatus = MatchStatus = {}));
var ActionType;
(function (ActionType) {
    ActionType["MOVE"] = "move";
    ActionType["ATTACK"] = "attack";
    ActionType["USE_ABILITY"] = "use_ability";
    ActionType["DISCONNECT"] = "disconnect";
})(ActionType || (exports.ActionType = ActionType = {}));
var ObstacleType;
(function (ObstacleType) {
    ObstacleType["WALL"] = "wall";
    ObstacleType["PILLAR"] = "pillar";
    ObstacleType["DESTRUCTIBLE"] = "destructible";
})(ObstacleType || (exports.ObstacleType = ObstacleType = {}));
//# sourceMappingURL=index.js.map