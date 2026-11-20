// Windows 10 Mobile: het eiland (React) draait niet in EdgeHTML; game.js valt dan terug op de gewone meldingen.
export function maak() { return Promise.reject(new Error('geen eiland')); }
