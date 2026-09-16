import './ui/styles.css';
import { Game } from './game.js';
import { input } from './core/input.js';

if (new URLSearchParams(location.search).has('assetreview')) {
  import('./debug/assetReview.js').then(m => m.startAssetReview());
} else if (new URLSearchParams(location.search).has('netcheck')) {
  import('./debug/netCheck.js').then(m => m.startNetCheck());
} else if (new URLSearchParams(location.search).has('systemscheck')) {
  import('./debug/systemsCheck.js').then(m => m.startSystemsCheck());
} else if (new URLSearchParams(location.search).has('streetreview') || new URLSearchParams(location.search).has('rockreview')) {
  import('./debug/streetReview.js').then(m => m.startStreetReview());
} else if (new URLSearchParams(location.search).has('robotlab')) {
  import('./debug/robotLab.js').then(m => m.startRobotLab());
} else {
  const game = new Game(document.getElementById('gl'), document.getElementById('ui'));
  window.HO = game; window.HOin = input; // debug handles
  game.boot();
  if(import.meta.env.DEV&&new URLSearchParams(location.search).has('coopqa'))import('./debug/coopReview.js').then(m=>m.addCoopReview(game));
}
