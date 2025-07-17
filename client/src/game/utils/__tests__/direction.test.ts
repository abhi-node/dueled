/**
 * Unit tests for direction utilities
 */

import { describe, it, expect } from 'vitest';
import { angleToDirection } from '../direction';
import { WalkDirection } from '../../renderer/SpriteSheet';

describe('angleToDirection', () => {
  // Helper to convert degrees to radians
  const deg = (degrees: number) => (degrees * Math.PI) / 180;

  describe('BACKWARD direction (315° to 45°)', () => {
    it('should return BACKWARD for 0° (facing away)', () => {
      expect(angleToDirection(deg(0))).toBe(WalkDirection.BACKWARD);
    });

    it('should return BACKWARD for 30° (facing away-right)', () => {
      expect(angleToDirection(deg(30))).toBe(WalkDirection.BACKWARD);
    });

    it('should return BACKWARD for 330° (facing away-left)', () => {
      expect(angleToDirection(deg(330))).toBe(WalkDirection.BACKWARD);
    });

    it('should return BACKWARD for 359° (almost complete circle)', () => {
      expect(angleToDirection(deg(359))).toBe(WalkDirection.BACKWARD);
    });
  });

  describe('RIGHT direction (45° to 135°)', () => {
    it('should return RIGHT for 45° (boundary)', () => {
      expect(angleToDirection(deg(45))).toBe(WalkDirection.RIGHT);
    });

    it('should return RIGHT for 90° (facing right)', () => {
      expect(angleToDirection(deg(90))).toBe(WalkDirection.RIGHT);
    });

    it('should return RIGHT for 120° (facing right-forward)', () => {
      expect(angleToDirection(deg(120))).toBe(WalkDirection.RIGHT);
    });

    it('should return RIGHT for 134° (just before boundary)', () => {
      expect(angleToDirection(deg(134))).toBe(WalkDirection.RIGHT);
    });
  });

  describe('FORWARD direction (135° to 225°)', () => {
    it('should return FORWARD for 135° (boundary)', () => {
      expect(angleToDirection(deg(135))).toBe(WalkDirection.FORWARD);
    });

    it('should return FORWARD for 180° (facing towards viewer)', () => {
      expect(angleToDirection(deg(180))).toBe(WalkDirection.FORWARD);
    });

    it('should return FORWARD for 200° (facing forward-left)', () => {
      expect(angleToDirection(deg(200))).toBe(WalkDirection.FORWARD);
    });

    it('should return FORWARD for 224° (just before boundary)', () => {
      expect(angleToDirection(deg(224))).toBe(WalkDirection.FORWARD);
    });
  });

  describe('LEFT direction (225° to 315°)', () => {
    it('should return LEFT for 225° (boundary)', () => {
      expect(angleToDirection(deg(225))).toBe(WalkDirection.LEFT);
    });

    it('should return LEFT for 270° (facing left)', () => {
      expect(angleToDirection(deg(270))).toBe(WalkDirection.LEFT);
    });

    it('should return LEFT for 300° (facing left-away)', () => {
      expect(angleToDirection(deg(300))).toBe(WalkDirection.LEFT);
    });

    it('should return LEFT for 314° (just before boundary)', () => {
      expect(angleToDirection(deg(314))).toBe(WalkDirection.LEFT);
    });
  });

  describe('negative angles', () => {
    it('should handle negative angles correctly', () => {
      expect(angleToDirection(deg(-30))).toBe(WalkDirection.BACKWARD); // -30° = 330°
      expect(angleToDirection(deg(-90))).toBe(WalkDirection.LEFT); // -90° = 270°
      expect(angleToDirection(deg(-180))).toBe(WalkDirection.FORWARD); // -180° = 180°
    });
  });

  describe('angles beyond 360°', () => {
    it('should handle angles beyond 360° correctly', () => {
      expect(angleToDirection(deg(360))).toBe(WalkDirection.BACKWARD); // 360° = 0°
      expect(angleToDirection(deg(450))).toBe(WalkDirection.RIGHT); // 450° = 90°
      expect(angleToDirection(deg(540))).toBe(WalkDirection.FORWARD); // 540° = 180°
    });
  });

  describe('edge cases', () => {
    it('should handle very small angles', () => {
      expect(angleToDirection(deg(0.1))).toBe(WalkDirection.BACKWARD);
    });

    it('should handle angles very close to boundaries', () => {
      expect(angleToDirection(deg(44.9))).toBe(WalkDirection.BACKWARD);
      expect(angleToDirection(deg(45.1))).toBe(WalkDirection.RIGHT);
      expect(angleToDirection(deg(134.9))).toBe(WalkDirection.RIGHT);
      expect(angleToDirection(deg(135.1))).toBe(WalkDirection.FORWARD);
    });
  });
});