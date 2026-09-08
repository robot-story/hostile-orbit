import './ui/styles.css';
import { Game } from './game.js';
import { input } from './core/input.js';

const game = new Game(document.getElementById('gl'), document.getElementById('ui'));
window.HO = game; window.HOin = input; // debug handles
game.boot();
