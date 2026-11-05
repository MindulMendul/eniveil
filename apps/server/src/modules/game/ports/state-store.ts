import type { State } from "../model";

export interface GameStateStore {
  state: State;
  save(): void;
}
