import type { State } from "../model";

export interface GameStateStore {
  state: State;
  save(): void;
  areFriends?(a: string, b: string): boolean;
}
