/** Lets DOM UI trigger a screenshot of the WebGL canvas without prop-drilling through R3F. */
export const capture: { run: ((filename: string) => void) | null } = { run: null }
