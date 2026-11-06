/**
 * Entries available in the game mode catalog.
 * Add a mode here when its play flow is implemented.
 */
export const gameModes = [
  {
    id: "solo",
    titleKey: "soloLabel",
    descriptionKey: "soloDescription",
    actionKey: "soloPlay",
  },
  {
    id: "host",
    titleKey: "hostModeTitle",
    descriptionKey: "hostModeDescription",
    actionKey: "createRoom",
  },
  {
    id: "join",
    titleKey: "joinModeTitle",
    descriptionKey: "joinModeDescription",
    actionKey: "joinByCode",
  },
];
