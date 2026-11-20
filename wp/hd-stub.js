// Windows 10 Mobile: geen Ultra-graphics (EdgeHTML kent geen WebGL2), dus alleen de PS1-stand.
import * as T from 'three';
export const HD = false;
export const THREE = T;
export function hdTex(t) { return t; }
export function hdSetup() {}
export function hdResize() {}
export function hdRender() {}
