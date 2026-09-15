import { matches } from './matches.js';
// Replace these reads when a real, consented recording data source is available.
export const getMatches = () => matches;
export const getMatch = id => matches.find(match => match.id === id);
